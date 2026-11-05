/* Keeps the database in step with the engine (URD req 28, 32).
   - Every flushMs: upsert the recent tail of each history collection, append plant events and commands,
     upsert vehicles whose record changed, the open shift's downtime and the settings. Writes are idempotent
     (natural keys), so a repeated flush only repeats work.
   - Every checkpointMs, at each shift change and on shutdown: a checkpoint of the whole state.
   - Once a day: history older than the previous production day leaves memory (it is in the database).
   If the database is unreachable the plant keeps running; the next successful flush catches up from the
   last point that was saved, as long as that history is still in memory. */
import type { EngineState } from '@mg/contracts';
import { dayOf, trimHistory } from '@mg/core';
import type { Actor } from './commands.ts';
import type { Db, Queryable } from './db/index.ts';
import { freeze, thaw } from './checkpoint.ts';
import type { EngineHost } from './engine-host.ts';

const OVERLAP = 3600; // plant seconds re-sent on every flush, so nothing between flushes is missed
const CFG_KEYS = ['takt', 'targets', 'shifts', 'calendar', 'buzzer', 'warnPct', 'trimAndon'];
type Row = Record<string, unknown>;
type Log = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };

export interface PersistOptions { flushMs?: number; checkpointMs?: number; keepCheckpoints?: number; log?: Log }

export class Persistence {
  dbUp = true;
  lastFlushAt: number | null = null;
  lastCheckpointAt: number | null = null;
  private savedT = -Infinity;              // plant time up to which history is safely stored
  private vehSig = new Map<string, string>();
  private cfgJson = '';
  private commands: Row[] = [];
  private shiftKey: string | null = null;
  private day: number | null = null;
  private timers: NodeJS.Timeout[] = [];
  private flushing: Promise<void> | null = null;
  private readonly log: Log;

  constructor(readonly db: Db, readonly host: EngineHost, readonly opts: PersistOptions = {}) {
    this.log = opts.log ?? { info() {}, warn() {}, error() {} };
    this.attach();
    host.onCommand = (actor: Actor, command: unknown, ok: boolean, error?: string) => {
      this.commands.push({ t: host.S.t, type: (command as { type: string }).type, actor: `${actor.name}${actor.role ? ` · ${actor.role}` : ''}`, ok, payload: { command, error } });
      if (this.commands.length > 50_000) this.commands.splice(0, this.commands.length - 50_000);
    };
    host.onAdvance = (S) => this.onAdvance(S);
    host.saveAndRestore = async (S) => { await this.checkpoint(S); return (await Persistence.latest(this.db)) ?? S; };
  }

  /** Journal plant events on the current state (again after a restore or scenario load). */
  private attach() { if (!Array.isArray(this.host.S.journal)) this.host.S.journal = []; }

  start() {
    this.timers.push(setInterval(() => void this.flush(), this.opts.flushMs ?? 2000));
    this.timers.push(setInterval(() => void this.checkpoint().catch(() => {}), this.opts.checkpointMs ?? 30_000));
    for (const t of this.timers) t.unref?.();
  }
  async stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.flush();
    await this.checkpoint().catch((e) => this.log.error(`final checkpoint failed: ${(e as Error).message}`));
  }

  private onAdvance(S: EngineState) {
    this.attach();
    const key = S.shift ? S.shift.key : null;
    if (key !== this.shiftKey) { if (this.shiftKey !== null) void this.flush().then(() => this.checkpoint()).catch(() => {}); this.shiftKey = key; }
    const d = dayOf(S.t);
    if (this.day !== null && d !== this.day) void this.trim(S, (d - 1) * 86400);
    this.day = d;
  }

  /** Writes everything new since the last successful flush. Never throws; marks the database down instead. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async doFlush() {
    const S = this.host.S;
    const since = this.savedT === -Infinity ? -Infinity : this.savedT - OVERLAP;
    const journal = (S.journal || []).splice(0);
    const commands = this.commands.splice(0);
    const nowT = S.t;
    try {
      await this.db.tx(async (q) => {
        await this.writeHistory(q, S, since);
        await this.writeEvents(q, journal, commands);
        await this.writeVehicles(q, S);
        await this.writeShifts(q, S);
        await this.writeConfig(q, S);
      });
      this.savedT = nowT;
      this.lastFlushAt = Date.now();
      if (!this.dbUp) this.log.info('database reachable again; history caught up');
      this.dbUp = true;
    } catch (e) {
      // put the events back for the next attempt
      if (S === this.host.S && S.journal) S.journal.unshift(...journal);
      this.commands.unshift(...commands);
      this.vehSig.clear(); // re-send vehicle records once the database is back
      this.cfgJson = '';
      if (this.dbUp) this.log.error(`database write failed, will retry: ${(e as Error).message}`);
      this.dbUp = false;
      const oldest = Math.min(...[S.prod[0], S.stats.segments[0]].filter(Boolean).map((r) => (r as { t: number }).t));
      if (since !== -Infinity && oldest > since) this.log.warn('database has been down longer than the history kept in memory; some cycle-time records were not stored');
    }
  }

  private async writeHistory(q: Queryable, S: EngineState, since: number) {
    const recent = <T extends { t: number }>(a: T[]) => a.filter((r) => r.t >= since);
    const prod = recent(S.prod as { t: number; area: string; vin: string; shiftKey: string; returned: boolean }[]);
    if (prod.length) await upsert(q, 'production', ['area', 'vin', 't', 'shift_key', 'returned'], prod.map((r) => [r.area, r.vin, r.t, r.shiftKey, !!r.returned]), ['area', 'vin', 't']);
    const seg = recent(S.stats.segments as { t: number; vin: string; pos: string; area: string; shiftKey: string; cycle: number; work: number; wait: number; target: number; over: number }[]);
    if (seg.length) await upsert(q, 'segments', ['vin', 'pos', 't', 'area', 'shift_key', 'cycle', 'work', 'wait', 'target', 'over'], seg.map((r) => [r.vin, r.pos, r.t, r.area, r.shiftKey, r.cycle, r.work, r.wait, r.target, r.over]), ['vin', 'pos', 't']);
    const off = recent(S.stats.offline as { t: number; vin: string; pos: string; area: string; reason: string; by: string }[]);
    if (off.length) await upsert(q, 'offline_records', ['vin', 't', 'pos', 'area', 'reason', 'by', 'record'], off.map((r) => [r.vin, r.t, r.pos, r.area, r.reason, r.by, JSON.stringify(r)]), ['vin', 't'], true);
    const audit = S.audit.filter((a) => a.t >= since);
    if (audit.length) await upsert(q, 'audit', ['id', 't', 'date', 'by', 'action', 'target', 'before', 'after', 'reason'], audit.map((a) => [a.id, a.t, a.date ?? null, a.by, a.action, a.target, str(a.before), str(a.after), a.reason || '']), ['id']);
    const calls = S.calls.filter((c) => c.clearedT == null || c.clearedT >= since || c.raisedT >= since);
    if (calls.length) await upsert(q, 'calls', ['id', 'pos', 'area', 'type', 'raised_t', 'raised_by', 'responded_t', 'responded_by', 'cleared_t', 'cleared_by', 'shift_key', 'vin', 'record'],
      calls.map((c) => [c.id, c.pos, c.area, c.type, c.raisedT, c.raisedBy, c.respondedT, c.respondedBy, c.clearedT, c.clearedBy, c.shiftKey, c.vin, JSON.stringify(c)]), ['id'], true);
  }

  private async writeEvents(q: Queryable, journal: unknown[], commands: Row[]) {
    const rows = [
      ...journal.map((e) => { const { t, ...p } = e as { t: number; type: string }; return [t, 'plant', p.type, null, null, JSON.stringify(p)]; }),
      ...commands.map((c) => [c.t, 'command', c.type, c.actor, c.ok, JSON.stringify(c.payload)]),
    ];
    for (let i = 0; i < rows.length; i += 500) await insert(q, 'events', ['t', 'kind', 'type', 'actor', 'ok', 'payload'], rows.slice(i, i + 500));
  }

  private async writeVehicles(q: Queryable, S: EngineState) {
    const rows: unknown[][] = [];
    for (const id of S.vehOrder) {
      const v = S.vehicles[id]; if (!v) continue;
      const sig = `${v.state}|${v.segments.length}|${v.offlines.length}|${v.returns.length}|${v.lineOffT}|${v.posId}`;
      if (this.vehSig.get(v.vin) === sig) continue;
      this.vehSig.set(v.vin, sig);
      const { history: _h, ...record } = v as typeof v & { history?: unknown }; // eslint-disable-line @typescript-eslint/no-unused-vars
      rows.push([v.vin, v.id, v.variant.code, v.variant.model, v.paint.name, v.state, v.entryT, v.lineOffT, v.totalDur, JSON.stringify(record)]);
    }
    for (let i = 0; i < rows.length; i += 200)
      await upsert(q, 'vehicles', ['vin', 'vehicle_id', 'variant', 'model', 'paint', 'state', 'entry_t', 'line_off_t', 'total_dur', 'record'], rows.slice(i, i + 200), ['vin'], true, 'updated_at = now()');
  }

  private async writeShifts(q: Queryable, S: EngineState) {
    const rows: unknown[][] = [];
    for (const h of S.history as { key?: string }[]) if (h.key) rows.push([h.key, JSON.stringify(h), JSON.stringify(S.down[h.key] || null)]);
    if (S.shift && !rows.some((r) => r[0] === S.shift!.key)) rows.push([S.shift.key, null, JSON.stringify(S.down[S.shift.key] || null)]);
    if (rows.length) await upsert(q, 'shifts', ['key', 'summary', 'downtime'], rows, ['key'], true, 'updated_at = now()', 'summary = COALESCE(EXCLUDED.summary, shifts.summary)');
  }

  private async writeConfig(q: Queryable, S: EngineState) {
    const cfg = JSON.stringify(Object.fromEntries(CFG_KEYS.map((k) => [k, S.cfg[k]])));
    if (cfg === this.cfgJson) return;
    await q.query('INSERT INTO config (id, cfg) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET cfg = EXCLUDED.cfg, updated_at = now()', [cfg]);
    this.cfgJson = cfg;
  }

  /** Saves a checkpoint and keeps the newest `keepCheckpoints`. */
  async checkpoint(S: EngineState = this.host.S) {
    const buf = freeze(S);
    await this.db.tx(async (q) => {
      await q.query('INSERT INTO checkpoints (t, rev, state) VALUES ($1, $2, $3)', [Math.round(S.t), this.host.rev, buf]);
      await q.query('DELETE FROM checkpoints WHERE id NOT IN (SELECT id FROM checkpoints ORDER BY id DESC LIMIT $1)', [this.opts.keepCheckpoints ?? 20]);
    });
    this.lastCheckpointAt = Date.now();
  }

  /** The newest checkpoint, ready to run, or null on a fresh database. */
  static async latest(db: Db): Promise<EngineState | null> {
    const row = await db.one<{ state: Buffer }>('SELECT state FROM checkpoints ORDER BY id DESC LIMIT 1');
    return row ? thaw(row.state) : null;
  }

  /** Drops history older than `beforeT` from memory, after making sure it is stored. */
  private async trim(S: EngineState, beforeT: number) {
    await this.flush();
    if (!this.dbUp || this.savedT < beforeT) return; // keep it in memory until it is stored
    const r = trimHistory(S, beforeT);
    for (const [vin] of this.vehSig) if (!S.vehOrder.some((id) => S.vehicles[id]?.vin === vin)) this.vehSig.delete(vin);
    this.log.info(`history before plant day ${beforeT / 86400} moved out of memory: ${JSON.stringify(r)}`);
    this.host.resync(); // screens get the smaller state
  }

  /** Deletes history older than `days` (wall-clock), nightly. */
  async purge(days: number) {
    const cut = `now() - interval '${Math.max(1, Math.floor(days))} days'`;
    await this.db.tx(async (q) => {
      for (const t of ['events', 'auth_log', 'audit']) await q.query(`DELETE FROM ${t} WHERE at < ${cut}`);
      await q.query(`DELETE FROM vehicles WHERE updated_at < ${cut} AND state = 'LINED_OFF'`);
      await q.query(`DELETE FROM sessions WHERE expires_at < now() - interval '30 days'`);
    });
  }
}

const str = (x: unknown) => (x == null ? null : String(x));

async function insert(q: Queryable, table: string, cols: string[], rows: unknown[][]) {
  if (!rows.length) return;
  const params: unknown[] = [];
  const values = rows.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`).join(', ');
  await q.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values}`, params);
}

/** INSERT … ON CONFLICT: updates the other columns when `update` is set, otherwise keeps the first write. */
async function upsert(q: Queryable, table: string, cols: string[], rows: unknown[][], key: string[], update = false, ...extraSet: string[]) {
  if (!rows.length) return;
  // the same key twice in one statement is an error in PostgreSQL: keep the last
  const seen = new Map<string, unknown[]>();
  for (const r of rows) seen.set(key.map((k) => String(r[cols.indexOf(k)])).join('\u0000'), r);
  const uniq = [...seen.values()];
  const params: unknown[] = [];
  const values = uniq.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`).join(', ');
  const others = cols.filter((c) => !key.includes(c));
  const overrides = new Set(extraSet.map((e) => e.split('=')[0].trim()));
  const set = [...others.filter((c) => !overrides.has(c)).map((c) => `${c} = EXCLUDED.${c}`), ...extraSet].join(', ');
  const action = update && set ? `DO UPDATE SET ${set}` : 'DO NOTHING';
  await q.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values} ON CONFLICT (${key.join(', ')}) ${action}`, params);
}

/* Reports API (permission `reports`):
     GET /api/reports?from&to&shift&line      the tables and figures (JSON)
     GET /api/reports/file.xlsx?…  /file.pdf  the same as a file
     GET /api/reports/saved?limit             end-of-shift reports made by the server
     GET /api/reports/saved/:id               one saved file
   Exports are written to the access log with the selection. */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { reportFileName, type ReportMeta } from '@mg/reports';
import { actorLabel } from '../commands.ts';
import type { Db } from '../db/index.ts';
import type { EngineHost } from '../engine-host.ts';
import type { Persistence } from '../persist.ts';
import { actorOf, logAuth, need } from '../auth/routes.ts';
import { ReportQuery, ReportRangeError, makeReport, type ServerReport } from './data.ts';
import { reportPdf, reportXlsx } from './files.ts';

const TYPES = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' } as const;
type Kind = keyof typeof TYPES;
const stamp = () => new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const reportFile = (kind: Kind, r: ServerReport, meta: ReportMeta) => (kind === 'xlsx' ? reportXlsx(r, meta) : reportPdf(r, meta));

function sendFile(reply: FastifyReply, kind: Kind, name: string, file: Buffer) {
  return reply.header('content-type', TYPES[kind]).header('content-disposition', `attachment; filename="${name}.${kind}"`).header('cache-control', 'no-store').send(file);
}

export function registerReports(app: FastifyInstance, db: Db, host: EngineHost, persistence: Persistence | null) {
  const parse = (q: unknown, reply: FastifyReply) => {
    const p = ReportQuery.safeParse(q);
    if (!p.success) { reply.code(400).send({ ok: false, error: 'Choose a day (YYYY-MM-DD), a shift and a line.' }); return null; }
    return p.data;
  };
  const build = async (q: ReportQuery, reply: FastifyReply) => {
    try { return await makeReport(db, host, persistence, q); }
    catch (e) { if (e instanceof ReportRangeError) { reply.code(400).send({ ok: false, error: e.message }); return null; } throw e; }
  };

  app.get('/api/reports', { preHandler: need('reports') }, async (req, reply) => {
    const q = parse(req.query, reply); if (!q) return reply;
    const r = await build(q, reply); if (!r) return reply;
    return { ok: true, ...r };
  });

  app.get<{ Params: { kind: string } }>('/api/reports/file.:kind', { preHandler: need('reports') }, async (req, reply) => {
    const kind = req.params.kind as Kind;
    if (!(kind in TYPES)) return reply.code(404).send({ ok: false, error: 'Excel (xlsx) or PDF only' });
    const q = parse(req.query, reply); if (!q) return reply;
    const r = await build(q, reply); if (!r) return reply;
    const actor = actorOf(req.session!), meta: ReportMeta = { ...r.meta, exportedAt: stamp(), by: actorLabel(actor) };
    const file = await reportFile(kind, r, meta);
    await logAuth(db, actor.name, 'Report exported', `${kind.toUpperCase()} · ${r.meta.from === r.meta.to ? r.meta.from : `${r.meta.from} to ${r.meta.to}`} · ${r.meta.shift} · ${r.meta.line}`, req.ip);
    return sendFile(reply, kind, reportFileName(r.meta), file);
  });

  app.get<{ Querystring: { limit?: string } }>('/api/reports/saved', { preHandler: need('reports') }, async (req) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30));
    const rows = await db.query<{ shift_key: string; at: Date; xlsx: string | null; pdf: string | null }>(
      `SELECT shift_key, max(created_at) AS at, max(id) FILTER (WHERE kind = 'xlsx')::text AS xlsx, max(id) FILTER (WHERE kind = 'pdf')::text AS pdf
         FROM saved_reports GROUP BY shift_key ORDER BY shift_key DESC LIMIT $1`, [limit]);
    return { ok: true, saved: rows.map((r) => ({ shiftKey: r.shift_key, date: r.shift_key.slice(0, 10), shift: r.shift_key.slice(13), at: r.at, xlsx: r.xlsx, pdf: r.pdf })) };
  });

  app.get<{ Params: { id: string } }>('/api/reports/saved/:id', { preHandler: need('reports') }, async (req, reply) => {
    if (!/^\d{1,18}$/.test(req.params.id)) return reply.code(404).send({ ok: false, error: 'No such report' });
    const row = await db.one<{ shift_key: string; kind: Kind; file: Buffer }>('SELECT shift_key, kind, file FROM saved_reports WHERE id = $1', [req.params.id]);
    if (!row) return reply.code(404).send({ ok: false, error: 'No such report' });
    await logAuth(db, actorOf(req.session!).name, 'Report exported', `${row.kind.toUpperCase()} · saved shift report ${row.shift_key}`, req.ip);
    return sendFile(reply, row.kind, reportFileName({ from: row.shift_key.slice(0, 10), to: row.shift_key.slice(0, 10), shift: row.shift_key.slice(13), line: 'All lines' }), row.file);
  });
}

/** Makes and stores the report of a shift that has just ended (all lines), once. Never throws. */
export async function saveShiftReport(db: Db, host: EngineHost, persistence: Persistence | null, key: string, log?: { info(m: string): void; error(m: string): void }) {
  try {
    const have = await db.query<{ kind: Kind }>('SELECT kind FROM saved_reports WHERE shift_key = $1', [key]);
    const missing = (Object.keys(TYPES) as Kind[]).filter((k) => !have.some((h) => h.kind === k));
    if (!missing.length) return;
    const r = await makeReport(db, host, persistence, { from: key.slice(0, 10), shift: key.slice(13), line: 'all' });
    if (!r.report.prod.length) return; // nothing stored for that shift
    const meta: ReportMeta = { ...r.meta, exportedAt: stamp(), by: 'line server (end of shift)' };
    for (const kind of missing) {
      const file = await reportFile(kind, r, meta);
      await db.query('INSERT INTO saved_reports (shift_key, kind, file, bytes) VALUES ($1, $2, $3, $4) ON CONFLICT (shift_key, kind) DO NOTHING', [key, kind, file, file.length]);
    }
    log?.info(`saved the shift report for ${key}`);
  } catch (e) {
    log?.error(`could not save the shift report for ${key}: ${(e as Error).message}`);
  }
}

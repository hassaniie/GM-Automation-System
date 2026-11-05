/* Sessions: a random token in an httpOnly cookie; the database keeps only its SHA-256.
   Lookups are cached for a few seconds so live screens don't hit the database on every request. */
import { createHash, randomBytes } from 'node:crypto';
import type { RoleId } from '@mg/contracts';
import type { Db } from '../db/index.ts';

export const COOKIE = 'mg_session';
export const USER_HOURS = 10, KEEP_HOURS = 12, DISPLAY_DAYS = 180;
const CACHE_MS = 5000, TOUCH_MS = 60_000;

export interface UserRow { id: string; emp_id: string; email: string; name: string; role: RoleId; active: boolean; password_hash: string | null; created_at: Date; last_sign_in: Date | null }
export interface DisplayRow { id: string; name: string; line: 'trim' | 'chassis' | 'final'; revoked_at: Date | null; last_seen: Date | null; created_at: Date; created_by: string }
export interface Session { idHash: string; kind: 'user' | 'display'; user: UserRow | null; display: DisplayRow | null; expiresAt: Date }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export class Sessions {
  private cache = new Map<string, { s: Session | null; at: number }>();
  private touched = new Map<string, number>();
  constructor(readonly db: Db) {}

  async create(o: { kind: 'user'; userId: string; keep?: boolean; ip?: string; ua?: string } | { kind: 'display'; displayId: string; ip?: string; ua?: string }) {
    const token = newToken();
    const ms = o.kind === 'display' ? DISPLAY_DAYS * 86400e3 : (o.keep ? KEEP_HOURS : USER_HOURS) * 3600e3;
    const expiresAt = new Date(Date.now() + ms);
    await this.db.query('INSERT INTO sessions (id_hash, kind, user_id, display_id, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [sha256(token), o.kind, o.kind === 'user' ? o.userId : null, o.kind === 'display' ? o.displayId : null, expiresAt, o.ip ?? null, (o.ua ?? '').slice(0, 300)]);
    return { token, expiresAt };
  }

  /** The live session for a cookie token, or null (unknown, expired, revoked, user disabled, display revoked). */
  async resolve(token: string | undefined): Promise<Session | null> {
    if (!token) return null;
    const idHash = sha256(token);
    const hit = this.cache.get(idHash);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.s;
    const row = await this.db.one<{ kind: 'user' | 'display'; expires_at: Date; user_id: string | null; display_id: string | null }>(
      'SELECT kind, expires_at, user_id, display_id FROM sessions WHERE id_hash = $1 AND revoked_at IS NULL AND expires_at > now()', [idHash]);
    let s: Session | null = null;
    if (row) {
      const user = row.user_id ? await this.db.one<UserRow>('SELECT * FROM users WHERE id = $1 AND active', [row.user_id]) : null;
      const display = row.display_id ? await this.db.one<DisplayRow>('SELECT * FROM displays WHERE id = $1 AND revoked_at IS NULL', [row.display_id]) : null;
      if ((row.kind === 'user' && user) || (row.kind === 'display' && display)) s = { idHash, kind: row.kind, user, display, expiresAt: row.expires_at };
    }
    this.cache.set(idHash, { s, at: Date.now() });
    if (s && Date.now() - (this.touched.get(idHash) ?? 0) > TOUCH_MS) {
      this.touched.set(idHash, Date.now());
      void this.db.query('UPDATE sessions SET last_seen = now() WHERE id_hash = $1', [idHash]).catch(() => {});
      if (s.display) void this.db.query('UPDATE displays SET last_seen = now() WHERE id = $1', [s.display.id]).catch(() => {});
    }
    return s;
  }

  async revoke(idHash: string) { await this.db.query('UPDATE sessions SET revoked_at = now() WHERE id_hash = $1', [idHash]); this.cache.delete(idHash); }
  async revokeUser(userId: string) { await this.db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]); this.cache.clear(); }
  async revokeDisplay(displayId: string) { await this.db.query('UPDATE sessions SET revoked_at = now() WHERE display_id = $1 AND revoked_at IS NULL', [displayId]); this.cache.clear(); }
  forget() { this.cache.clear(); }
}

/** Failed sign-ins: 5 within the window lock that account from that address for 30 s (as in the demo). */
export class Lockout {
  private fails = new Map<string, { n: number; until: number }>();
  constructor(readonly max = 5, readonly lockMs = 30_000) {}
  private key(id: string, ip: string) { return `${id.trim().toLowerCase()}|${ip}`; }
  waitMs(id: string, ip: string) { const f = this.fails.get(this.key(id, ip)); return f && f.until > Date.now() ? f.until - Date.now() : 0; }
  fail(id: string, ip: string) {
    const k = this.key(id, ip), f = this.fails.get(k) || { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= this.max) { f.until = Date.now() + this.lockMs; f.n = 0; }
    this.fails.set(k, f);
    if (this.fails.size > 10_000) this.fails.delete(this.fails.keys().next().value!);
    return { left: f.until > Date.now() ? 0 : this.max - f.n, lockedMs: f.until > Date.now() ? f.until - Date.now() : 0 };
  }
  ok(id: string, ip: string) { this.fails.delete(this.key(id, ip)); }
}

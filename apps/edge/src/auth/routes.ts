/* Sign-in, users, line-display links and the audit log (URD req 30).
   Every /api route except health and the sign-in routes needs a session; see requireSession. */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DEMO_ACCOUNTS, ROLES, ROLE_IDS, roleCan, type Permission, type RoleId } from '@mg/contracts';
import type { Actor } from '../commands.ts';
import type { Db } from '../db/index.ts';
import { hashPassword, passwordProblem, verifyPassword } from './password.ts';
import { COOKIE, Lockout, newToken, sha256, Sessions, type DisplayRow, type Session, type UserRow } from './sessions.ts';

declare module 'fastify' { interface FastifyRequest { session: Session | null } }

export interface AuthOptions { demo: boolean; sso?: { enabled: boolean; label: string } }
export interface AuthHooks {
  /** A user was disabled or a display revoked: close their live connections. */
  onRevoke?: (match: (s: Session) => boolean) => void;
}

export const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, empId: u.emp_id, email: u.email, role: u.role, active: u.active, lastSignIn: u.last_sign_in, created: u.created_at });
export const actorOf = (s: Session): Actor => s.kind === 'display'
  ? { kind: 'display', id: s.display!.id, name: `Display · ${s.display!.name}`, role: null }
  : { kind: 'user', id: s.user!.id, name: s.user!.name, role: s.user!.role };

const ipOf = (req: FastifyRequest) => req.ip;
const isHttps = (req: FastifyRequest) => req.protocol === 'https';
export function setSessionCookie(req: FastifyRequest, reply: FastifyReply, token: string, expires: Date) {
  reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'strict', secure: isHttps(req), expires });
}

/** Seeds the first accounts: the five demo users in demo mode, otherwise one administrator from the environment. */
export async function seedUsers(db: Db, demo: boolean, admin?: { empId?: string; password?: string }) {
  const n = (await db.one<{ n: number }>('SELECT count(*)::int AS n FROM users'))!.n;
  if (n) return 0;
  if (demo) {
    for (const u of DEMO_ACCOUNTS)
      await db.query('INSERT INTO users (id, emp_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)', [u.id, u.empId, u.email, u.name, u.role, await hashPassword(u.pw)]);
    return DEMO_ACCOUNTS.length;
  }
  if (!admin?.empId || !admin.password) throw new Error('No users yet: set ADMIN_EMP_ID and ADMIN_PASSWORD to create the first administrator (or DEMO=1).');
  const problem = passwordProblem(admin.password); if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
  await db.query("INSERT INTO users (id, emp_id, email, name, role, password_hash) VALUES ($1, $2, $3, 'Administrator', 'admin', $4)", [randomUUID(), admin.empId, `${admin.empId.toLowerCase()}@local`, await hashPassword(admin.password)]);
  return 1;
}

export async function logAuth(db: Db, who: string, action: string, detail = '', ip?: string) {
  await db.query('INSERT INTO auth_log (who, action, detail, ip) VALUES ($1, $2, $3, $4)', [who, action, detail, ip ?? null]).catch(() => {});
}

/** preHandler: a signed-in person whose role has `perm` (display links never do). */
export const need = (perm: Permission) => async (req: FastifyRequest, reply: FastifyReply) => {
  const s = req.session;
  if (!s || s.kind !== 'user' || !roleCan(s.user!.role, perm)) return reply.code(403).send({ ok: false, error: 'Not allowed for your role' });
};

export function registerAuth(app: FastifyInstance, db: Db, sessions: Sessions, opts: AuthOptions, hooks: AuthHooks = {}) {
  const lockout = new Lockout();
  const PUBLIC = /^\/api\/(health$|auth\/(sign-in|sign-out|me|config|display|oidc\/))/;

  // who is calling: every request gets request.session (or null)
  app.decorateRequest('session', null);
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    req.session = await sessions.resolve(req.cookies[COOKIE]);
    // CSRF: state-changing calls must come from our own pages (custom header forces a same-origin check)
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-mg-client'] !== 'web') return reply.code(403).send({ ok: false, error: 'Missing client header' });
    if (PUBLIC.test(req.url.split('?')[0])) return;
    if (!req.session) return reply.code(401).send({ ok: false, error: 'Sign in required' });
  });
  const me = (s: Session | null) => s && s.kind === 'user'
    ? { kind: 'user', user: publicUser(s.user!), perms: ROLES[s.user!.role].perms, demo: opts.demo }
    : s ? { kind: 'display', display: { id: s.display!.id, name: s.display!.name, line: s.display!.line }, demo: opts.demo } : null;

  app.get('/api/auth/config', async () => ({ demo: opts.demo, sso: opts.sso?.enabled ? { label: opts.sso.label } : null, demoAccounts: opts.demo ? DEMO_ACCOUNTS.map(({ pw: _pw, ...u }) => u) : [] }));
  app.get('/api/auth/me', async (req) => ({ ok: true, me: me(req.session) }));

  const SignIn = z.object({ id: z.string().min(1).max(120), password: z.string().min(1).max(200), keep: z.boolean().optional() });
  app.post('/api/auth/sign-in', async (req, reply) => {
    const b = SignIn.safeParse(req.body);
    if (!b.success) { reply.code(400); return { ok: false, reason: 'Enter your employee ID or email and your password.' }; }
    const { id, password, keep } = b.data, ip = ipOf(req);
    const wait = lockout.waitMs(id, ip);
    if (wait) { reply.code(429); return { ok: false, locked: true, waitMs: wait, reason: `Too many attempts. Try again in ${Math.ceil(wait / 1000)} s.` }; }
    const u = await db.one<UserRow>('SELECT * FROM users WHERE lower(emp_id) = lower($1) OR lower(email) = lower($1)', [id.trim()]);
    const good = await verifyPassword(password, u?.password_hash);
    if (!u || !good || !u.active) {
      const f = lockout.fail(id, ip);
      await logAuth(db, id, 'Sign-in failed', u && !u.active ? 'account disabled' : '', ip);
      reply.code(401);
      if (u && good && !u.active) return { ok: false, reason: 'This account is disabled. Ask your administrator.' };
      if (f.lockedMs) return { ok: false, locked: true, waitMs: f.lockedMs, reason: `Too many attempts. Sign-in is paused for ${Math.ceil(f.lockedMs / 1000)} s.` };
      return { ok: false, reason: `That ID and password don't match.${f.left <= 2 ? ` ${f.left} tries left.` : ''}` };
    }
    lockout.ok(id, ip);
    const { token, expiresAt } = await sessions.create({ kind: 'user', userId: u.id, keep, ip, ua: req.headers['user-agent'] });
    await db.query('UPDATE users SET last_sign_in = now() WHERE id = $1', [u.id]);
    await logAuth(db, u.name, 'Signed in', ROLES[u.role].label, ip);
    setSessionCookie(req, reply, token, expiresAt);
    return { ok: true, me: me({ idHash: '', kind: 'user', user: u, display: null, expiresAt }) };
  });

  app.post('/api/auth/sign-out', async (req, reply) => {
    const s = req.session;
    if (s) { await sessions.revoke(s.idHash); await logAuth(db, s.user?.name ?? s.display?.name ?? '?', 'Signed out', '', ipOf(req)); }
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/unlock', async (req, reply) => {
    const s = req.session, pw = z.object({ password: z.string().max(200) }).safeParse(req.body);
    if (!s || s.kind !== 'user' || !pw.success) { reply.code(401); return { ok: false }; }
    const good = await verifyPassword(pw.data.password, s.user!.password_hash);
    await logAuth(db, s.user!.name, good ? 'Screen unlocked' : 'Unlock failed', '', ipOf(req));
    if (!good) reply.code(401);
    return { ok: good };
  });

  // demo role switch: only when the server runs in demo mode
  app.post('/api/auth/switch', async (req, reply) => {
    const s = req.session, b = z.object({ userId: z.string() }).safeParse(req.body);
    if (!opts.demo) { reply.code(403); return { ok: false, error: 'Role switch is for demonstrations only' }; }
    if (!s || s.kind !== 'user' || !b.success) { reply.code(401); return { ok: false }; }
    const u = await db.one<UserRow>('SELECT * FROM users WHERE id = $1 AND active', [b.data.userId]);
    if (!u) { reply.code(404); return { ok: false, error: 'No such user' }; }
    await sessions.revoke(s.idHash);
    const { token, expiresAt } = await sessions.create({ kind: 'user', userId: u.id, keep: true, ip: ipOf(req), ua: req.headers['user-agent'] });
    await logAuth(db, u.name, 'Signed in (demo switch)', `from ${s.user!.name}`, ipOf(req));
    setSessionCookie(req, reply, token, expiresAt);
    return { ok: true, me: me({ idHash: '', kind: 'user', user: u, display: null, expiresAt }) };
  });

  // a line display trades its one-time link token for a long-lived read-only session
  app.post('/api/auth/display', async (req, reply) => {
    const b = z.object({ token: z.string().min(20).max(200) }).safeParse(req.body);
    if (!b.success) { reply.code(400); return { ok: false }; }
    const d = await db.one<DisplayRow>('SELECT * FROM displays WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(b.data.token)]);
    if (!d) { reply.code(401); return { ok: false, reason: 'This display link is not valid or has been revoked. Ask an administrator for a new one.' }; }
    const { token, expiresAt } = await sessions.create({ kind: 'display', displayId: d.id, ip: ipOf(req), ua: req.headers['user-agent'] });
    await logAuth(db, `Display · ${d.name}`, 'Display connected', d.line, ipOf(req));
    setSessionCookie(req, reply, token, expiresAt);
    return { ok: true, me: me({ idHash: '', kind: 'display', user: null, display: d, expiresAt }) };
  });

  /* ── users (admin) ── */
  const NewUser = z.object({ name: z.string().min(2).max(80), empId: z.string().min(2).max(32), email: z.string().email().max(120), role: z.enum(ROLE_IDS as [RoleId, ...RoleId[]]), password: z.string().max(200) });
  const EditUser = z.object({ name: z.string().min(2).max(80).optional(), email: z.string().email().max(120).optional(), role: z.enum(ROLE_IDS as [RoleId, ...RoleId[]]).optional(), active: z.boolean().optional(), password: z.string().max(200).optional() });
  const by = (req: FastifyRequest) => req.session!.user!.name;

  app.get('/api/users', { preHandler: need('users') }, async () => ({ ok: true, users: (await db.query<UserRow>('SELECT * FROM users ORDER BY role, name')).map(publicUser) }));
  app.post('/api/users', { preHandler: need('users') }, async (req, reply) => {
    const b = NewUser.safeParse(req.body);
    if (!b.success) { reply.code(400); return { ok: false, error: 'Check the name, employee ID, email and role.' }; }
    const problem = passwordProblem(b.data.password); if (problem) { reply.code(400); return { ok: false, error: problem }; }
    try {
      const id = randomUUID();
      await db.query('INSERT INTO users (id, emp_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5, $6)', [id, b.data.empId, b.data.email, b.data.name, b.data.role, await hashPassword(b.data.password)]);
      await logAuth(db, by(req), 'User added', `${b.data.name} · ${ROLES[b.data.role].label}`, ipOf(req));
      return { ok: true, user: publicUser((await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]))!) };
    } catch (e) { reply.code(409); return { ok: false, error: /emp_id/.test(String(e)) ? 'That employee ID is already in use.' : /email/.test(String(e)) ? 'That email is already in use.' : 'Could not add the user.' }; }
  });
  app.patch<{ Params: { id: string } }>('/api/users/:id', { preHandler: need('users') }, async (req, reply) => {
    const b = EditUser.safeParse(req.body);
    if (!b.success) { reply.code(400); return { ok: false, error: 'Check the details.' }; }
    const u = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!u) { reply.code(404); return { ok: false, error: 'No such user' }; }
    const self = u.id === req.session!.user!.id;
    if (self && (b.data.active === false || (b.data.role && b.data.role !== u.role))) { reply.code(400); return { ok: false, error: 'You cannot disable or change the role of your own account.' }; }
    if (b.data.password) { const p = passwordProblem(b.data.password); if (p) { reply.code(400); return { ok: false, error: p }; } }
    const next = { name: b.data.name ?? u.name, email: b.data.email ?? u.email, role: b.data.role ?? u.role, active: b.data.active ?? u.active };
    try {
      await db.query('UPDATE users SET name = $2, email = $3, role = $4, active = $5 WHERE id = $1', [u.id, next.name, next.email, next.role, next.active]);
    } catch { reply.code(409); return { ok: false, error: 'That email is already in use.' }; }
    if (b.data.password) await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [u.id, await hashPassword(b.data.password)]);
    const changes = [next.role !== u.role && `role ${ROLES[u.role].label} → ${ROLES[next.role].label}`, next.active !== u.active && (next.active ? 'enabled' : 'disabled'), b.data.password && 'password reset', next.name !== u.name && 'name', next.email !== u.email && 'email'].filter(Boolean).join(', ');
    await logAuth(db, by(req), 'User updated', `${next.name}${changes ? ` · ${changes}` : ''}`, ipOf(req));
    if (!next.active || next.role !== u.role || b.data.password) { await sessions.revokeUser(u.id); hooks.onRevoke?.((s) => s.user?.id === u.id); }
    return { ok: true, user: publicUser((await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [u.id]))!) };
  });

  /* ── line display links (admin) ── */
  app.get('/api/displays', { preHandler: need('users') }, async () => ({ ok: true, displays: await db.query<DisplayRow>('SELECT id, name, line, created_by, created_at, last_seen, revoked_at FROM displays ORDER BY revoked_at NULLS FIRST, created_at DESC') }));
  app.post('/api/displays', { preHandler: need('users') }, async (req, reply) => {
    const b = z.object({ name: z.string().min(2).max(60), line: z.enum(['trim', 'chassis', 'final']) }).safeParse(req.body);
    if (!b.success) { reply.code(400); return { ok: false, error: 'Give the display a name and a line.' }; }
    const id = randomUUID(), token = newToken();
    await db.query('INSERT INTO displays (id, name, line, token_hash, created_by) VALUES ($1, $2, $3, $4, $5)', [id, b.data.name, b.data.line, sha256(token), by(req)]);
    await logAuth(db, by(req), 'Display link created', `${b.data.name} · ${b.data.line}`, ipOf(req));
    return { ok: true, id, token, path: `#/display/${b.data.line}?display=${token}` };
  });
  app.delete<{ Params: { id: string } }>('/api/displays/:id', { preHandler: need('users') }, async (req, reply) => {
    const d = await db.one<DisplayRow>('UPDATE displays SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING *', [req.params.id]);
    if (!d) { reply.code(404); return { ok: false, error: 'No such display link' }; }
    await sessions.revokeDisplay(d.id);
    hooks.onRevoke?.((s) => s.display?.id === d.id);
    await logAuth(db, by(req), 'Display link revoked', d.name, ipOf(req));
    return { ok: true };
  });

  /* ── audit log: configuration changes, corrections, sign-ins and account changes ── */
  app.get<{ Querystring: { limit?: string } }>('/api/audit', { preHandler: need('audit') }, async (req) => {
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
    const changes = await db.query('SELECT id, t, date, by, action, target, before, after, reason, at FROM audit ORDER BY at DESC, id DESC LIMIT $1', [limit]);
    const access = await db.query('SELECT id, at, who, action, detail FROM auth_log ORDER BY id DESC LIMIT $1', [limit]);
    return { ok: true, changes, access };
  });

  return { lockout };
}

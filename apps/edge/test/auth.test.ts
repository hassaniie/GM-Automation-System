/* Sign-in and permissions on the server (URD req 30): sessions, lockout, roles on every command,
   names from the session, display links, revoking access, and the live connection's checks. */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '@mg/contracts';
import { buildServer } from '../src/server.ts';
import { freshDatabase } from './helpers/db.ts';

let T: Awaited<ReturnType<typeof freshDatabase>>;
let srv: Awaited<ReturnType<typeof buildServer>>;
let base = '', host = '';
beforeAll(async () => {
  T = await freshDatabase();
  srv = await buildServer({ seed: 11, speed: 15, tickMs: 50, webDir: null, databaseUrl: T.url, demo: true, persist: { flushMs: 200 } });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  host = `127.0.0.1:${(srv.app.server.address() as { port: number }).port}`; base = `http://${host}`;
});
afterAll(async () => { await srv.app.close(); await T.drop(); });

async function call(path: string, body?: unknown, cookie?: string, method = body === undefined ? 'GET' : 'POST') {
  const headers: Record<string, string> = { 'x-mg-client': 'web', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) };
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const signIn = async (id: string, password: string) => { const r = await call('/api/auth/sign-in', { id, password }); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.cookie; };
function live(cookie?: string, origin?: string) {
  const ws = new WebSocket(`ws://${host}/api/live`, { headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) } });
  let n = 0; const waiting = new Map<string, (m: ServerMessage) => void>();
  const ready = new Promise<void>((res, rej) => {
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()) as ServerMessage; if (m.type === 'snapshot') res(); if (m.type === 'result') waiting.get(m.id)?.(m); });
    ws.on('unexpected-response', (_req, r) => rej(new Error(`HTTP ${r.statusCode}`)));
    ws.on('error', rej);
  });
  const closed = new Promise<number>((res) => ws.on('close', (code) => res(code)));
  const send = (command: unknown) => new Promise<Extract<ServerMessage, { type: 'result' }>>((res) => { const id = `c${++n}`; waiting.set(id, res as never); ws.send(JSON.stringify({ type: 'command', id, command })); });
  return { ws, ready, closed, send };
}

describe('sign-in', () => {
  test('demo accounts are seeded; wrong passwords lock the account for a while; the right one gives a session', async () => {
    const cfg = await call('/api/auth/config');
    expect(cfg.body.demoAccounts.map((u: { empId: string }) => u.empId)).toContain('MG-1001');
    expect(JSON.stringify(cfg.body)).not.toMatch(/Admin@2026/); // passwords are never sent
    for (let i = 0; i < 4; i++) expect((await call('/api/auth/sign-in', { id: 'MG-3112', password: 'nope' })).status).toBe(401);
    const fifth = await call('/api/auth/sign-in', { id: 'MG-3112', password: 'nope' });
    expect(fifth.body.locked).toBe(true);
    expect((await call('/api/auth/sign-in', { id: 'MG-3112', password: 'Line@2026' })).status).toBe(429); // still locked
    const cookie = await signIn('ayesha.malik@mgjw.pk', 'Plan@2026'); // email works too
    expect(cookie).toMatch(/^mg_session=/);
    const me = await call('/api/auth/me', undefined, cookie);
    expect(me.body.me.user.name).toBe('Ayesha Malik');
    expect(me.body.me.user.role).toBe('authorised');
    const log = await T.db.query<{ action: string }>("SELECT action FROM auth_log WHERE who IN ('MG-3112', 'Ayesha Malik')");
    expect(log.filter((l) => l.action === 'Sign-in failed').length).toBe(5);
  });

  test('without a session the API and the live connection are closed; requests without the client header are refused', async () => {
    expect((await call('/api/snapshot')).status).toBe(401);
    expect((await call('/api/commands', { type: 'SIM_SPEED', speed: 60 })).status).toBe(401);
    await expect(live().ready).rejects.toThrow(/401/);
    const r = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'MG-1001', password: 'Admin@2026' }) });
    expect(r.status).toBe(403);
    const admin = await signIn('MG-1001', 'Admin@2026');
    await expect(live(admin, 'https://evil.example').ready).rejects.toThrow(/403/);
    expect((await call('/api/health')).status).toBe(200);
  });
});

describe('permissions', () => {
  test('each role may do only its own commands, and the name recorded is the session’s', async () => {
    const viewer = live(await signIn('MG-9001', 'View@2026')); await viewer.ready;
    const planner = live(await signIn('MG-2040', 'Plan@2026')); await planner.ready;
    const maint = live(await signIn('MG-4207', 'Fix@2026')); await maint.ready;

    const v = await viewer.send({ type: 'SET_TAKT', area: 'CHASSIS', sec: 540 });
    expect(v.ok).toBe(false); expect(v.error).toMatch(/may not/);
    const p = await planner.send({ type: 'SET_TAKT', area: 'CHASSIS', sec: 540, reason: 'rebalance', by: 'Somebody Else' });
    expect(p.ok).toBe(true);
    const audit = srv.host.S.audit.find((a) => a.action === 'Takt time changed')!;
    expect(audit.by).toBe('Ayesha Malik · Authorised');
    expect((await planner.send({ type: 'SIM_SPEED', speed: 60 })).ok).toBe(false); // simulator controls: admin only

    // calls: the matching team responds
    const raised = await planner.send({ type: 'RAISE_CALL', pos: 'FL4', callType: 'MNT' });
    const id = (raised.value as { id: string }).id;
    expect((await planner.send({ type: 'RESPOND_CALL', callId: id })).ok).toBe(false);
    expect((await maint.send({ type: 'RESPOND_CALL', callId: id })).ok).toBe(true);
    expect(srv.host.S.calls.find((c) => c.id === id)!.respondedBy).toBe('Bilal Ahmed · Maintenance');
    for (const s of [viewer, planner, maint]) s.ws.close();
  });

  test('users: only admins manage them; disabling a user ends their live connection', async () => {
    const planner = await signIn('MG-2040', 'Plan@2026');
    expect((await call('/api/users', undefined, planner)).status).toBe(403);
    const admin = await signIn('MG-1001', 'Admin@2026');
    const add = await call('/api/users', { name: 'Sara Khan', empId: 'MG-5001', email: 'sara.khan@mgjw.pk', role: 'supervisor', password: 'Shift2026' }, admin);
    expect(add.body.ok).toBe(true);
    expect((await call('/api/users', { name: 'Dup', empId: 'mg-5001', email: 'x@mgjw.pk', role: 'viewer', password: 'Shift2026' }, admin)).body.error).toMatch(/employee ID/);
    expect((await call('/api/users', { name: 'Weak', empId: 'MG-5002', email: 'w@mgjw.pk', role: 'viewer', password: 'short' }, admin)).body.error).toMatch(/8 characters/);
    const sara = live(await signIn('MG-5001', 'Shift2026')); await sara.ready;
    const off = await call(`/api/users/${add.body.user.id}`, { active: false }, admin, 'PATCH');
    expect(off.body.ok).toBe(true);
    expect(await sara.closed).toBe(4401);
    expect((await call('/api/auth/sign-in', { id: 'MG-5001', password: 'Shift2026' })).status).toBe(401);
    expect((await call(`/api/users/${'u1'}`, { active: false }, admin, 'PATCH')).body.error).toMatch(/your own account/);
    const audit = await call('/api/audit', undefined, admin);
    expect(audit.body.access.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['User added', 'User updated']));
  });

  test('display links: read-only live data until revoked', async () => {
    const admin = await signIn('MG-1001', 'Admin@2026');
    const link = await call('/api/displays', { name: 'Chassis TV', line: 'chassis' }, admin);
    expect(link.body.path).toMatch(/^#\/display\/chassis\?display=/);
    expect((await call('/api/auth/display', { token: 'x'.repeat(40) })).status).toBe(401);
    const tv = await call('/api/auth/display', { token: link.body.token });
    expect(tv.body.me.display.line).toBe('chassis');
    const screen = live(tv.cookie); await screen.ready;
    const refused = await screen.send({ type: 'RAISE_CALL', pos: 'CL2', callType: 'SUP' });
    expect(refused.ok).toBe(false); expect(refused.error).toMatch(/read-only/);
    expect((await call(`/api/displays/${link.body.id}`, undefined, admin, 'DELETE')).body.ok).toBe(true);
    expect(await screen.closed).toBe(4401);
    expect((await call('/api/snapshot', undefined, tv.cookie)).status).toBe(401);
  });

  test('demo switch changes the signed-in person; sign-out ends the session', async () => {
    const admin = await signIn('MG-1001', 'Admin@2026');
    const sw = await call('/api/auth/switch', { userId: 'u4' }, admin);
    expect(sw.body.me.user.name).toBe('Bilal Ahmed');
    expect((await call('/api/auth/me', undefined, admin)).body.me).toBeNull(); // the old session is gone
    await call('/api/auth/sign-out', {}, sw.cookie);
    expect((await call('/api/auth/me', undefined, sw.cookie)).body.me).toBeNull();
  });
});

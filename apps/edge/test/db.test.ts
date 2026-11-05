/* Database layer: migrations apply once and are idempotent; transactions roll back on error. */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from '../src/db/index.ts';
import { freshDatabase } from './helpers/db.ts';

let T: Awaited<ReturnType<typeof freshDatabase>>;
beforeAll(async () => { T = await freshDatabase(); });
afterAll(async () => { await T.drop(); });

test('schema is in place and migrating again does nothing', async () => {
  const tables = (await T.db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")).map((r) => r.tablename);
  for (const t of ['users', 'sessions', 'displays', 'auth_log', 'audit', 'events', 'vehicles', 'production', 'segments', 'offline_records', 'calls', 'shifts', 'config', 'checkpoints', 'schema_migrations'])
    expect(tables).toContain(t);
  expect(await migrate(T.db)).toEqual([]);
});

test('a failed transaction leaves nothing behind', async () => {
  await expect(T.db.tx(async (q) => {
    await q.query("INSERT INTO auth_log (who, action) VALUES ('x', 'y')");
    throw new Error('boom');
  })).rejects.toThrow('boom');
  expect((await T.db.one<{ n: number }>('SELECT count(*)::int AS n FROM auth_log'))!.n).toBe(0);
});

test('emp_id and email are unique regardless of case', async () => {
  await T.db.query("INSERT INTO users (id, emp_id, email, name, role) VALUES ('u1', 'MG-1', 'a@x.pk', 'A', 'admin')");
  await expect(T.db.query("INSERT INTO users (id, emp_id, email, name, role) VALUES ('u2', 'mg-1', 'b@x.pk', 'B', 'viewer')")).rejects.toThrow(/users_emp_id_key/);
  await expect(T.db.query("INSERT INTO users (id, emp_id, email, name, role) VALUES ('u3', 'MG-3', 'A@X.PK', 'C', 'viewer')")).rejects.toThrow(/users_email_key/);
});

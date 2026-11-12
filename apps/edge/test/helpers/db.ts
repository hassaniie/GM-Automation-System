/* A throwaway PostgreSQL database per test file.
   Uses TEST_DATABASE_URL (a server-level URL with rights to create databases), default local dev cluster. */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createDb, migrate, type Db } from '../../src/db/index.ts';

export const ADMIN_URL = process.env.TEST_DATABASE_URL || 'postgres://mg:mg@localhost:5432/postgres';

/** Whether the test cluster answers. Without it the database tests are skipped, not crashed (audit S3); CI always
    has one and sets TEST_DATABASE_URL, so there a missing database is a failure. */
export async function dbAvailable(): Promise<boolean> {
  if (process.env.CI) return true;
  const c = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 1500 });
  try { await c.connect(); await c.end(); return true; } catch { return false; }
}

export async function freshDatabase(): Promise<{ url: string; db: Db; drop: () => Promise<void> }> {
  const name = `mg_test_${randomBytes(5).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const u = new URL(ADMIN_URL); u.pathname = `/${name}`;
  const url = u.toString();
  const db = createDb(url);
  await migrate(db);
  return {
    url, db,
    async drop() {
      await db.close().catch(() => {});
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}

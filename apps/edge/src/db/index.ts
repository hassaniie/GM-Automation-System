/* PostgreSQL access: a small wrapper around a pg Pool, and the migration runner.
   Migrations are plain SQL files in ./migrations, applied in name order, each in its own transaction. */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// bigint columns (bigserial ids, counts) as numbers; they stay far below 2^53 here
pg.types.setTypeParser(20, (v) => Number(v));

export interface Queryable { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> }
export interface Db extends Queryable {
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
  readonly pool: pg.Pool;
}

export function createDb(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 6, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on('error', () => { /* a dropped idle client; the next query reconnects */ });
  const query = async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];
  return {
    pool,
    query,
    async one<T>(sql: string, params: unknown[] = []) { return ((await query<T>(sql, params))[0] ?? null) as T | null; },
    async tx<T>(fn: (q: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await fn({ query: async <R>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as R[] });
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { client.release(); }
    },
    async ping() { try { await pool.query('SELECT 1'); return true; } catch { return false; } },
    async close() { await pool.end(); },
  };
}

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies pending migrations. Returns the names applied. Safe to run on every start. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    await db.tx(async (q) => {
      await q.query('SELECT pg_advisory_xact_lock(4242)'); // one migrator at a time
      if ((await q.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).length) return;
      await q.query(sql);
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      applied.push(name);
    });
  }
  return applied;
}

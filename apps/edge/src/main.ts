/* Starts the edge server. Environment: DATABASE_URL (required), PORT (8787), HOST (0.0.0.0), RETENTION_DAYS (730),
   DEMO (1 = demo accounts and role switch), ADMIN_EMP_ID / ADMIN_PASSWORD (first admin when not in demo mode),
   SIM_SEED (11), SIM_SPEED (15), SIM_SCENARIO (1),
   PLANT_MODE (simulation | live | shadow), DEVICES_FILE (config/devices.json), PLANT_TZ (Asia/Karachi). Reads .env when present. */
import { buildServer } from './server.ts';
import { oidcFromEnv } from './auth/oidc.ts';
import { DeviceConfigError } from './devices/manager.ts';

try { process.loadEnvFile(new URL('../../../.env', import.meta.url)); } catch { /* no .env: use the environment */ }

const env = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Start PostgreSQL (pnpm db:dev) and copy .env.example to .env.');
  process.exit(1);
}
const mode = (process.env.PLANT_MODE || 'simulation') as 'simulation' | 'live' | 'shadow';
if (!['simulation', 'live', 'shadow'].includes(mode)) { console.error(`PLANT_MODE must be simulation, live or shadow (not "${mode}").`); process.exit(1); }
const built = await buildServer({
  plantMode: mode, devicesFile: process.env.DEVICES_FILE || new URL('../../../config/devices.json', import.meta.url).pathname, tz: process.env.PLANT_TZ || 'Asia/Karachi',
  seed: env('SIM_SEED', 11), speed: env('SIM_SPEED', 15), scenario: env('SIM_SCENARIO', 1), logger: true,
  databaseUrl: process.env.DATABASE_URL, retentionDays: env('RETENTION_DAYS', 730),
  demo: process.env.DEMO === '1', sso: oidcFromEnv(process.env), admin: { empId: process.env.ADMIN_EMP_ID, password: process.env.ADMIN_PASSWORD },
}).catch((e) => { if (e instanceof DeviceConfigError) { console.error(e.message); process.exit(1); } throw e; });
const { app, host } = built;
await app.listen({ port: env('PORT', 8787), host: process.env.HOST || '0.0.0.0' });
app.log.info(`MG Andon edge server · ${mode}${mode === 'live' ? '' : ` · speed ${host.clock.speed}×`} · open http://localhost:${env('PORT', 8787)}/`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void app.close().then(() => process.exit(0)); });

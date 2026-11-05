/* Starts the edge server. Environment: PORT (8787), HOST (0.0.0.0), SIM_SEED (11), SIM_SPEED (15), SIM_SCENARIO (1). */
import { buildServer } from './server.ts';

const env = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);
const { app, host } = await buildServer({ seed: env('SIM_SEED', 11), speed: env('SIM_SPEED', 15), scenario: env('SIM_SCENARIO', 1), logger: true });
await app.listen({ port: env('PORT', 8787), host: process.env.HOST || '0.0.0.0' });
app.log.info(`MG Andon edge server · simulation · speed ${host.clock.speed}× · open http://localhost:${env('PORT', 8787)}/`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void app.close().then(() => process.exit(0)); });

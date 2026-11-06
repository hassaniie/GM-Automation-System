/* pnpm emulate:plant — runs the plant emulator and writes a device map for it (config/devices.emulator.json,
   OPC UA; PROTOCOL=modbus for the Modbus one). Start the edge server with
   PLANT_MODE=live DEVICES_FILE=config/devices.emulator.json pnpm start:edge
   The line starts when the server connects (WAIT=0 starts it at once).
   Environment: SEED (11), SPEED (1), PLANT_TZ (Asia/Karachi), OPCUA_PORT (4840), MODBUS_PORT (5020), SCANNER_PORT (5101). */
import { writeFileSync } from 'node:fs';
import { PlantEmulator } from './emulator.ts';
import { exampleMap } from './map.ts';

const n = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);
const em = new PlantEmulator({ seed: n('SEED', 11), speed: n('SPEED', 1), tz: process.env.PLANT_TZ || 'Asia/Karachi', opcuaPort: n('OPCUA_PORT', 4840), modbusPort: n('MODBUS_PORT', 5020), scannerPort: n('SCANNER_PORT', 5101), waitForClient: process.env.WAIT !== '0', log: (m) => console.log(m) });
await em.start();
const protocol = process.env.PROTOCOL === 'modbus' ? 'modbus' : 'opcua';
const file = new URL('../../../config/devices.emulator.json', import.meta.url);
writeFileSync(file, JSON.stringify(exampleMap({ protocol, plcHost: '127.0.0.1', plcPort: protocol === 'opcua' ? em.opts.opcuaPort : em.opts.modbusPort, scannerHost: '127.0.0.1', scannerPort: em.opts.scannerPort }), null, 2) + '\n');
console.log(`device map for this emulator (${protocol}): ${file.pathname}`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void em.stop().then(() => process.exit(0)); });

import { AREAS, logEvent } from '@mg/core';

export function setPaused(S, area, on) { S.paused[area] = on; logEvent(S, 'sim', `SIMULATION · ${AREAS[area].name} ${on ? 'stopped (simulated line stop)' : 'restarted'}`); }

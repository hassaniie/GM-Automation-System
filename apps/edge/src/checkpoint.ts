/* Checkpoints: the whole engine state as bytes (node:v8 structured serialisation keeps shared references,
   Infinity and undefined), so a restart continues exactly where it stopped (URD req 32).
   Code parts are rebuilt on load: the random generator (its position is in S.rngState) and Path objects. */
import { deserialize, serialize } from 'node:v8';
import type { EngineState } from '@mg/contracts';
import { applyTakt, Path, stateRng } from '@mg/core';
import { rehydrate } from '@mg/sync';

export function freeze(S: EngineState): Buffer {
  // code (rng) and the event journal (flushed to the database separately) stay out; the last analysis is kept,
  // since the next simulated second reads it before working out a new one
  const { rng: _rng, journal: _j, ...data } = S as EngineState & { rng: unknown }; // eslint-disable-line @typescript-eslint/no-unused-vars
  return serialize(data);
}

export function thaw(buf: Buffer | Uint8Array): EngineState {
  const S = deserialize(buf) as EngineState;
  S.rng = stateRng(S);
  rehydrate(S as Parameters<typeof rehydrate>[0], Path);
  applyTakt(S); // station targets live beside the state
  return S;
}

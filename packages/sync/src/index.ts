/* State sync between the edge server and the screens.
   The server sends one full snapshot on connect, then a patch of what changed. Most of the state only
   grows (vehicles, events, stats), so arrays are diffed as "shift some off the front, push some on the end"
   and objects key by key. Pure functions, no dependencies. */

export type Path = (string | number)[];
export type Op =
  | [Path, 'set', unknown]
  | [Path, 'del']
  | [Path, 'push', unknown[]]
  | [Path, 'shift', number]
  | [Path, 'trunc', number];
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** JSON-safe deep copy of the engine state: drops functions (rng) and anything not serialisable. */
export function toWire<T>(S: T): Json {
  return JSON.parse(JSON.stringify(S, (_k, v) => (typeof v === 'function' ? undefined : v)));
}

/** Ops that turn `prev` into `next`. Both must be plain JSON (use toWire). */
export function diff(prev: unknown, next: unknown, path: Path = [], ops: Op[] = []): Op[] {
  if (prev === next) return ops;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let a = prev;
    // capped logs drop entries from the front: detect by id
    if (a.length && next.length && isObj(next[0]) && 'id' in next[0]) {
      const id = next[0].id;
      if (!(isObj(a[0]) && a[0].id === id)) {
        const k = a.findIndex((x) => isObj(x) && x.id === id);
        if (k > 0) { ops.push([path, 'shift', k]); a = a.slice(k); }
      }
    }
    const n = Math.min(a.length, next.length);
    for (let i = 0; i < n; i++) diff(a[i], next[i], [...path, i], ops);
    if (next.length > a.length) ops.push([path, 'push', next.slice(a.length)]);
    else if (next.length < a.length) ops.push([path, 'trunc', next.length]);
    return ops;
  }
  if (isObj(prev) && isObj(next)) {
    for (const k of Object.keys(next)) {
      if (!(k in prev)) ops.push([[...path, k], 'set', next[k]]);
      else diff(prev[k], next[k], [...path, k], ops);
    }
    for (const k of Object.keys(prev)) if (!(k in next)) ops.push([[...path, k], 'del']);
    return ops;
  }
  ops.push([path, 'set', next]);
  return ops;
}

/** Applies ops in place. A 'set' at the root path is not allowed (send a snapshot instead). */
export function patch<T extends object>(state: T, ops: Op[]): T {
  for (const op of ops) {
    const [path, kind] = op;
    if (!path.length) throw new Error('sync: root replacement must be a snapshot');
    let parent: any = state; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]];
    const key = path[path.length - 1];
    if (kind === 'set') parent[key] = op[2];
    else if (kind === 'del') delete parent[key];
    else {
      const arr = parent[key] as unknown[];
      if (kind === 'push') arr.push(...op[2]);
      else if (kind === 'shift') arr.splice(0, op[2]);
      else if (kind === 'trunc') arr.length = op[2];
    }
  }
  return state;
}

/** Path objects (with .at()) inside the state arrive as plain data; give them their prototype back. */
export function rehydrate(S: { anims?: { path?: unknown }[]; carriers?: Record<string, { transit?: { path?: unknown } | null }> }, PathClass: { prototype: object }) {
  const fix = (p: unknown) => { if (p && typeof p === 'object' && Object.getPrototypeOf(p) !== PathClass.prototype) Object.setPrototypeOf(p, PathClass.prototype); };
  for (const a of S.anims || []) fix(a.path);
  for (const c of Object.values(S.carriers || {})) if (c.transit) fix(c.transit.path);
  return S;
}

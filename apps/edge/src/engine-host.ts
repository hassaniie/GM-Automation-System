/* Owns the one engine state on the server and keeps it moving.
   Every TICK_MS it advances the simulation by speed × elapsed seconds, then publishes one patch.
   Listeners get a snapshot when they join and every patch after that. */
import type { Clock, EngineState } from '@mg/contracts';
import { buildScenario, injectDemoDelay, DEMO_AFTER } from '@mg/sim';
import { MGE } from '@mg/engine';
import { diff, rehydrate, toWire, type Op } from '@mg/sync';

export interface HostOptions { seed?: number; speed?: number; scenario?: number; tickMs?: number; mode?: Clock['mode'] }
export type HostListener = { snapshot(rev: number, clock: Clock, state: unknown, hints?: Record<string, unknown>): void; patch(rev: number, clock: Clock, ops: Op[]): void };

export class EngineHost {
  S!: EngineState;
  rev = 0;
  clock: Clock;
  hints: Record<string, unknown> = {};
  private wire: unknown;
  private acc = 0;
  private last = 0;
  private demo: { elapsed: number; fired: boolean } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<HostListener>();
  readonly seed: number;
  readonly tickMs: number;

  constructor(opts: HostOptions = {}) {
    this.seed = opts.seed ?? 11;
    this.tickMs = opts.tickMs ?? 250;
    this.clock = { speed: opts.speed ?? 15, running: true, mode: opts.mode ?? 'simulation' };
    this.loadScenario(opts.scenario ?? 1);
  }

  /** Replaces the state with scenario n and sends everyone a fresh snapshot. */
  loadScenario(n: number) {
    const built = buildScenario(n, {}, this.seed);
    const hints = built.hints as Record<string, unknown>;
    this.S = built.S as EngineState;
    this.hints = hints;
    this.clock.speed = (hints.speed as number) || this.clock.speed;
    this.clock.running = true;
    this.demo = hints.demo ? { elapsed: 0, fired: false } : null;
    this.acc = 0;
    this.resync();
    return hints;
  }

  /** Re-sends a full snapshot (after a scenario load or a restore). */
  resync() {
    MGE.applyTakt(this.S);
    this.wire = toWire(this.S);
    this.rev++;
    for (const l of this.listeners) l.snapshot(this.rev, this.clock, this.wire, this.hints);
  }

  start() {
    this.last = Date.now();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.timer.unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** Advance the plant and publish what changed. Also called after each command. */
  tick() {
    const now = Date.now(), dt = (now - this.last) / 1000; this.last = now;
    if (this.clock.running && this.clock.mode === 'simulation') {
      this.acc += dt * this.clock.speed;
      let n = 0;
      while (this.acc >= 1 && n < 3600) { MGE.step(this.S, 1); this.acc -= 1; n++; }
      if (this.demo && !this.demo.fired && (this.demo.elapsed += dt) >= DEMO_AFTER) { this.demo.fired = true; injectDemoDelay(this.S); }
    }
    this.publish();
  }

  publish() {
    const next = toWire(this.S), ops = diff(this.wire, next);
    this.wire = next;
    if (!ops.length) return;
    this.rev++;
    for (const l of this.listeners) l.patch(this.rev, this.clock, ops);
  }

  snapshotFor(l: HostListener) { l.snapshot(this.rev, this.clock, this.wire, this.hints); }
  subscribe(l: HostListener) { this.listeners.add(l); this.snapshotFor(l); return () => this.listeners.delete(l); }
  get listenerCount() { return this.listeners.size; }

  /** Demonstrates a restart (URD req 32): the state is copied, dropped and rebuilt from the copy.
      In-memory for now (structuredClone keeps shared references); Phase 4 writes it to the database. */
  powerCut() {
    const { rng, ...data } = this.S as EngineState & { rng: () => number };
    const restored = structuredClone(data) as EngineState;
    restored.rng = rng; // the random generator is code, not data; it carries on
    rehydrate(restored as Parameters<typeof rehydrate>[0], MGE.Path);
    this.S = restored;
    const n = Object.values(this.S.pos).filter((p) => p.occ && p.occ.vehicleId).length;
    MGE.logEvent(this.S, 'sim', `SIMULATION · restart · ${n} vehicle positions restored from the server's saved state`);
    this.resync();
    return { restored: n };
  }
}

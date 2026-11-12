/* Owns the one engine state on the server and keeps it moving.
   Every TICK_MS it advances the simulation by speed × elapsed seconds, then publishes one patch.
   Listeners get a snapshot when they join and every patch after that. */
import type { Clock, EngineState, PlantEvent } from '@mg/contracts';
import { createLiveState, liveStep } from '@mg/core';
import { plantNow, plantT } from './devices/clock.ts';
import { buildScenario, injectDemoDelay, DEMO_AFTER } from '@mg/sim';
import { MGE } from '@mg/engine';
import { diff, toWire, type Op } from '@mg/sync';
import { freeze, thaw } from './checkpoint.ts';

export interface HostOptions { seed?: number; speed?: number; scenario?: number; tickMs?: number; mode?: Clock['mode']; /** start from a restored state instead of a scenario */ state?: EngineState; /** plant time zone for live running */ tz?: string }
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
  readonly tz: string;
  /** Device events waiting for the next plant second (live). */
  private queue: { t: number; e: PlantEvent }[] = [];
  /** Called after every command (allowed or refused); the persistence layer logs it. */
  onCommand?: (actor: import('./commands.ts').Actor, command: unknown, ok: boolean, error?: string) => void;
  readonly tickMs: number;
  /** Runs after the plant has advanced, before the patch goes out (shift change → checkpoint, day change → trim). */
  onAdvance?: (S: EngineState) => void;
  /** Saves the state and loads it back (the database in deployment). Used by the power-cut demo. */
  saveAndRestore?: (S: EngineState) => Promise<EngineState>;

  constructor(opts: HostOptions = {}) {
    this.seed = opts.seed ?? 11;
    this.tickMs = opts.tickMs ?? 250;
    this.clock = { speed: opts.speed ?? 15, running: true, mode: opts.mode ?? 'simulation' };
    if (this.clock.mode === 'live') this.clock.speed = 1; // real time
    this.tz = opts.tz ?? 'Asia/Karachi';
    const restoredLive = opts.state && (opts.state as { plantMode?: string }).plantMode === 'live';
    if (this.clock.mode === 'live') {
      // live: carry on from a live checkpoint, otherwise start a fresh line on today's plant clock
      if (restoredLive) this.adopt(opts.state!);
      else { const now = plantNow(this.tz); this.adopt(createLiveState(this.seed, now.date, now.sec) as EngineState); }
    } else if (opts.state && !restoredLive) this.adopt(opts.state);
    else this.loadScenario(opts.scenario ?? 1);
  }

  /** Takes over a state (restored from a checkpoint) and sends everyone a fresh snapshot. */
  adopt(S: EngineState) {
    // a checkpoint saved before plans were validated may hold one the rules engine cannot read: drop it, with a note
    const cal = (S.cfg as { calendar?: Record<string, unknown> }).calendar || {};
    for (const [date, plan] of Object.entries(cal)) {
      const bad = MGE.checkPlanPatch(plan);
      if (bad) { delete cal[date]; MGE.logEvent(S, 'exception', `SYSTEM · the saved plan for ${date} was not valid and was removed (${bad})`); }
    }
    this.S = S; this.hints = {}; this.demo = null; this.acc = 0;
    this.resync();
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

  /** Advance the plant and publish what changed. A failure is logged and shown as an event instead of stopping the
      server's timer (audit B3); the same error is reported once until a tick succeeds again. */
  tick() {
    try { this.advance(); this.tickError = null; }
    catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg !== this.tickError) {
        this.tickError = msg;
        console.error('[engine] tick failed:', e);
        try { MGE.logEvent(this.S, 'exception', `SYSTEM · the rules engine stopped advancing: ${msg}`); this.publish(); } catch { /* keep the timer alive */ }
      }
    }
  }
  private tickError: string | null = null;

  private advance() {
    const now = Date.now(), dt = (now - this.last) / 1000; this.last = now;
    if (this.clock.mode === 'live' && (this.S as { plantMode?: string }).plantMode === 'live') {
      // live: plant time follows the plant clock; device events are applied in the second they happened
      const target = plantT(this.tz, (this.S.cfg as { baseDate: string }).baseDate);
      let n = 0;
      while (this.S.t < target && n < 2 * 86400) {
        const t = this.S.t + 1, due = this.queue.filter((q) => q.t <= t).map((q) => q.e);
        if (due.length) this.queue = this.queue.filter((q) => q.t > t);
        liveStep(this.S, 1, due); n++;
      }
      if (n) this.onAdvance?.(this.S);
    } else if (this.clock.running && (this.clock.mode === 'simulation' || this.clock.mode === 'shadow')) {
      this.acc += dt * this.clock.speed;
      let n = 0;
      while (this.acc >= 1 && n < 3600) { MGE.step(this.S, 1); this.acc -= 1; n++; }
      if (this.demo && !this.demo.fired && (this.demo.elapsed += dt) >= DEMO_AFTER) { this.demo.fired = true; injectDemoDelay(this.S); }
      if (n) this.onAdvance?.(this.S);
    }
    this.publish();
  }

  /** A device event (live): applied in the plant second it happened. */
  enqueue(e: PlantEvent, at = Date.now()) {
    this.queue.push({ t: Math.max(this.S.t + 1, plantT(this.tz, (this.S.cfg as { baseDate: string }).baseDate, at)), e });
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

  /** Demonstrates a restart (URD req 32): the state is saved, dropped and loaded back. With a database the
      round trip goes through it; without one, through an in-memory copy in the same format. */
  async powerCut() {
    const restored = this.saveAndRestore ? await this.saveAndRestore(this.S) : thaw(freeze(this.S));
    this.S = restored;
    const n = Object.values(this.S.pos).filter((p) => p.occ && p.occ.vehicleId).length;
    MGE.logEvent(this.S, 'sim', `SIMULATION · restart · ${n} vehicle positions restored from the server's saved state`);
    this.resync();
    return { restored: n };
  }
}

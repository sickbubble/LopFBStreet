import type { Vec3 } from '../vec.js';
import { Ballistics } from './ballistics.js';

/** A position and velocity being stepped: the mutable pair `TrajectorySampler.Step` takes by ref. */
export interface FlightState {
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * The arc preview's points, stepped the way the physics steps the ball (S4).
 * Port of `TrajectorySampler.cs`. The web's ball integrator (`ballBody.ts`)
 * runs the same `step`, so the arc and the ball cannot disagree in flight.
 */
export const TrajectorySampler = {
  /**
   * The damp the physics applies: the body's own, added to the project
   * default unless the body replaces it (Godot's Combine mode).
   */
  effectiveDamp: (bodyDamp: number, projectDamp: number, replaces: boolean): number =>
    Math.max(replaces ? bodyDamp : bodyDamp + projectDamp, 0),

  /** One physics tick: gravity, then damp, then position with the new velocity. */
  step(s: FlightState, effectiveGravity: number, damp: number, step: number): void {
    s.vy -= Math.max(effectiveGravity, Ballistics.MinGravity) * step;
    const keep = Math.max(1 - damp * step, 0);
    s.vx *= keep;
    s.vy *= keep;
    s.vz *= keep;
    s.px += s.vx * step;
    s.py += s.vy * step;
    s.pz += s.vz * step;
  },

  /**
   * Fill `into` with the ball's position at evenly spaced moments from launch
   * (the first point) to `duration` (the last), each read off the tick nearest it.
   */
  sample(
    start: Vec3,
    velocity: Vec3,
    effectiveGravity: number,
    damp: number,
    step: number,
    duration: number,
    into: Vec3[],
  ): void {
    if (into.length === 0) return;

    into[0] = start;
    if (into.length === 1 || step <= 0) {
      for (let i = 1; i < into.length; i++) into[i] = start;
      return;
    }

    const ticks = Math.max(Math.round(Math.max(duration, 0) / step), 1);
    const s: FlightState = { px: start.x, py: start.y, pz: start.z, vx: velocity.x, vy: velocity.y, vz: velocity.z };
    let tick = 0;

    for (let i = 1; i < into.length; i++) {
      const target = Math.round((i * ticks) / (into.length - 1));
      while (tick < target) {
        TrajectorySampler.step(s, effectiveGravity, damp, step);
        tick++;
      }
      into[i] = { x: s.px, y: s.py, z: s.pz };
    }
  },

  /**
   * Cut the samples at the first thing the ball would hit. `firstHit` is the
   * engine's sweep between two points. Returns how many points to draw, and
   * the impact (the last point if nothing was hit).
   */
  truncate(samples: Vec3[], firstHit: (from: Vec3, to: Vec3) => Vec3 | null): { count: number; impact: Vec3 } {
    let impact: Vec3 = samples.length === 0 ? { x: 0, y: 0, z: 0 } : (samples[samples.length - 1] as Vec3);

    for (let i = 1; i < samples.length; i++) {
      const hit = firstHit(samples[i - 1] as Vec3, samples[i] as Vec3);
      if (hit) {
        samples[i] = hit;
        impact = hit;
        return { count: i + 1, impact };
      }
    }

    return { count: samples.length, impact };
  },
};

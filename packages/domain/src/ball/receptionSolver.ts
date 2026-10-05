import { clamp } from '../mathUtil.js';
import type { TrapSettings } from '../tuning/ballSettings.js';
import { add, dot, flat, length, lengthSq, neg, normalize, scale, sub, type Vec3 } from '../vec.js';
import { Ballistics } from './ballistics.js';

/** A ball's closest pass by a player: when, how far out flat, and how high above their feet. */
export interface Approach {
  readonly Time: number;
  readonly Separation: number;
  readonly Height: number;
}

/** The numbers of the first touch that are not the touch itself (S24, S5). Port of `ReceptionSolver.cs`. */
export const ReceptionSolver = {
  /** What an untimed trap sends back: the relative flat velocity reversed and scaled, capped. */
  rebound(relative: Vec3, trap: TrapSettings): Vec3 {
    const back = scale(flat(relative), -Math.max(trap.Rebound, 0));
    const speed = length(back);
    const cap = Math.max(trap.MaxResidual, 0);
    return speed > cap && speed > 0 ? scale(back, cap / speed) : back;
  },

  /** How high an untimed trap pops the ball. */
  trapApex: (footApex: number, relative: Vec3, trap: TrapSettings, maxApex: number): number =>
    Math.min(footApex + Math.max(trap.LiftPerSpeed, 0) * length(flat(relative)), maxApex),

  /** When a ball in flight passes closest to a player (S5). Flat and vertical are separate on purpose. */
  closestApproach(
    relative: Vec3,
    relativeVelocity: Vec3,
    effectiveGravity: number,
    windowBefore: number,
    windowAfter: number,
  ): Approach {
    const r = flat(relative);
    const v = flat(relativeVelocity);
    const vv = lengthSq(v);

    let t = vv < 0.0001 ? 0 : -dot(r, v) / vv;
    t = clamp(t, -Math.max(windowAfter, 0), Math.max(windowBefore, 0));

    return {
      Time: t,
      Separation: length(add(r, scale(v, t))),
      Height: relative.y + relativeVelocity.y * t - 0.5 * Math.max(effectiveGravity, Ballistics.MinGravity) * t * t,
    };
  },

  /** Whether a tap at `tapTime` catches a hot ball whose closest approach is `approachIn` from `now`. */
  isTimedCatch: (now: number, approachIn: number, tapTime: number | null, catchWindow: number): boolean =>
    tapTime !== null && Math.abs(now + approachIn - tapTime) <= Math.max(catchWindow, 0),

  /** A hot ball meeting a body it is not caught by comes off it (S5). Null when there is no ricochet. */
  ricochet(
    ballPosition: Vec3,
    ballVelocity: Vec3,
    ballRadius: number,
    bodyFeet: Vec3,
    bodyVelocity: Vec3,
    bodyRadius: number,
    bodyHeight: number,
    restitution: number,
  ): Vec3 | null {
    const offset = sub(ballPosition, bodyFeet);
    if (offset.y < -ballRadius || offset.y > bodyHeight + ballRadius) return null;

    const f = flat(offset);
    const distance = length(f);
    if (distance > bodyRadius + ballRadius) return null;

    const relative = sub(ballVelocity, bodyVelocity);
    const normal =
      distance > 0.0001 ? scale(f, 1 / distance) : neg(normalize(add(flat(relative), { x: 0, y: 0, z: 0.0001 })));

    const into = dot(relative, normal);
    if (into >= 0) return null;

    const after = sub(relative, scale(normal, (1 + clamp(restitution, 0, 1)) * into));
    return add(bodyVelocity, after);
  },
};

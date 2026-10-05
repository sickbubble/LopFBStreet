import { clamp, lerpf } from '../mathUtil.js';
import type { LaunchSettings } from '../tuning/ballSettings.js';
import type { Vec3 } from '../vec.js';

/**
 * Projectile maths shared by the launch, the touch and the HUD, so they
 * cannot disagree about what "apex" means. Port of `Ballistics.cs`.
 */
export const Ballistics = {
  /** Gravity is never allowed to reach zero: every apex conversion divides by it. */
  MinGravity: 0.001,

  effectiveGravity: (gravity: number, gravityScale: number): number =>
    Math.max(gravity * gravityScale, Ballistics.MinGravity),

  /**
   * Launch speed off a part whose power scale is `powerScale` (S28). Only the
   * top of the line moves; a scale that would put it under the minimum is held there.
   */
  speedForCharge(launch: LaunchSettings, chargeRatio: number, powerScale = 1): number {
    const top = Math.max(launch.MaxSpeed * Math.max(powerScale, 0), launch.MinSpeed);
    return lerpf(launch.MinSpeed, top, clamp(chargeRatio, 0, 1));
  },

  apexForVerticalSpeed: (verticalSpeed: number, effectiveGravity: number): number =>
    verticalSpeed <= 0 ? 0 : (verticalSpeed * verticalSpeed) / (2 * Math.max(effectiveGravity, Ballistics.MinGravity)),

  verticalSpeedForApex: (apex: number, effectiveGravity: number): number =>
    Math.sqrt(2 * Math.max(effectiveGravity, Ballistics.MinGravity) * Math.max(apex, 0)),

  /** Up and down, `2v/g`. */
  timeToReturn: (verticalSpeed: number, effectiveGravity: number): number =>
    verticalSpeed <= 0 ? 0 : (2 * verticalSpeed) / Math.max(effectiveGravity, Ballistics.MinGravity),

  /**
   * When a ball `heightAbove` a height, moving vertically at `verticalSpeed`,
   * next comes down through it: the later root. Negative when it already has,
   * null when it never will.
   */
  timeToDescendTo(heightAbove: number, verticalSpeed: number, effectiveGravity: number): number | null {
    const g = Math.max(effectiveGravity, Ballistics.MinGravity);
    const discriminant = verticalSpeed * verticalSpeed + 2 * g * heightAbove;
    if (discriminant < 0) return null;
    return (verticalSpeed + Math.sqrt(discriminant)) / g;
  },

  /** Where a ball is after `seconds` of drag-free flight. The one flight equation. */
  positionAfter(position: Vec3, velocity: Vec3, effectiveGravity: number, seconds: number): Vec3 {
    const g = Math.max(effectiveGravity, Ballistics.MinGravity);
    return {
      x: position.x + velocity.x * seconds,
      y: position.y + velocity.y * seconds - 0.5 * g * seconds * seconds,
      z: position.z + velocity.z * seconds,
    };
  },
};

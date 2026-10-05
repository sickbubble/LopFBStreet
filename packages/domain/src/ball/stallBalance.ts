import { clamp } from '../mathUtil.js';
import type { BounceSettings } from '../tuning/ballSettings.js';
import { add, length, scale, sub, withY, ZERO, type Vec3 } from '../vec.js';

/** About 2.5 Hz: fast enough to read as a held ball, slow enough not to strobe. */
const MICRO_RADIANS_PER_SECOND = 15.7;

/**
 * A ball balanced on a body part (S10). Its placement is a function of the
 * owner's acceleration, never of their position: that is the line between a
 * stall and the invisible string. Port of `StallBalance.cs`.
 */
export class StallBalance {
  /** Where the ball sits relative to the rest point, flat, in world axes. */
  offset: Vec3 = ZERO;
  /** How fast that offset is moving. */
  drift: Vec3 = ZERO;
  /** Seconds this stall has been held, for the micro-motion phase. */
  held = 0;

  /** Put the ball back on the rest point: the re-settle. */
  settle(): void {
    this.offset = ZERO;
    this.drift = ZERO;
    this.held = 0;
  }

  /** Start a stall from wherever the ball actually arrived. */
  catch(offset: Vec3, drift: Vec3): void {
    this.offset = withY(offset, 0);
    this.drift = withY(drift, 0);
    this.held = 0;
  }

  /** Advance one step against the owner's acceleration. True when the ball has come off. */
  step(ownerAccel: Vec3, breakRadius: number, settings: BounceSettings, step: number): boolean {
    const disturbance: Vec3 = { x: -ownerAccel.x, y: 0, z: -ownerAccel.z };
    const accel = sub(
      sub(scale(disturbance, settings.StallCoupling), scale(this.offset, settings.StallRestore)),
      scale(this.drift, settings.StallDamping),
    );

    this.drift = add(this.drift, scale(accel, step));
    this.offset = add(this.offset, scale(this.drift, step));
    this.held += step;

    return length(this.offset) > breakRadius;
  }

  /** The small, quick wobble of a held ball; grows as the balance nears breaking. */
  microMotion(amplitude: number, breakRadius: number): number {
    if (amplitude <= 0) return 0;
    const strain = breakRadius <= 0 ? 0 : clamp(length(this.offset) / breakRadius, 0, 1);
    return amplitude * (1 + strain) * Math.sin(this.held * MICRO_RADIANS_PER_SECOND);
  }
}

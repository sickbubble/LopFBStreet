import { lerpAngle, moveToward } from '../mathUtil.js';
import type { Vec3 } from '../vec.js';

/**
 * The player's ground ramp and turn (S23). Port of `Locomotion.cs`. Forward
 * is -Z; a yaw of theta about Y sends -Z to (-sin, 0, -cos).
 */
export const Locomotion = {
  /** The flat velocity after one step toward `target`, each axis moving by at most accel × step. */
  step(velocity: Vec3, target: Vec3, accel: number, step: number): Vec3 {
    const rate = Math.max(accel, 0) * Math.max(step, 0);
    return { x: moveToward(velocity.x, target.x, rate), y: velocity.y, z: moveToward(velocity.z, target.z, rate) };
  },

  yawOf: (direction: Vec3): number => Math.atan2(-direction.x, -direction.z),

  forwardOf: (yaw: number): Vec3 => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }),

  turnToward: (yaw: number, direction: Vec3, turnSpeed: number, step: number): number =>
    lerpAngle(yaw, Locomotion.yawOf(direction), turnSpeed * step),
};

import { add, cross, dot, flat, length, lengthSq, normalize, scale, sub, UP, withY, ZERO, type Vec3 } from '../vec.js';

/** The follow's numbers (S23). A zero top speed turns the follow off. */
export interface FollowSettings {
  readonly TopSpeed: number;
  readonly MinTime: number;
  readonly AimSpeed: number;
  readonly TrapAssist: number;
}

export const FOLLOW_OFF: FollowSettings = { TopSpeed: 0, MinTime: 0, AimSpeed: 0, TrapAssist: 0 };

export const followEnabled = (s: FollowSettings): boolean => s.TopSpeed > 0;

/** What the follow proposes for one contact, before reach has been checked. */
export interface FollowStep {
  readonly Velocity: Vec3;
  readonly Forward: Vec3;
  readonly Stand: Vec3;
  readonly OwnerAtContact: Vec3;
}

const EPSILON = 0.0001;

/**
 * The body follows the ball: during a flight the owner moves to where the
 * ball comes down (S23). One rule, read by the planner and the motor. Port of
 * `FollowRule.cs`.
 */
export const FollowRule = {
  /** Which way the body faces at the contact: the ball's travel, else the input, else the facing now. */
  forwardAt(ballVelocity: Vec3, intent: Vec3, facing: Vec3, settings: FollowSettings): Vec3 {
    const travel = flat(ballVelocity);
    const aim = Math.max(settings.AimSpeed, 0);
    if (lengthSq(travel) > Math.max(aim * aim, EPSILON)) return normalize(travel);

    const wish = flat(intent);
    if (lengthSq(wish) > EPSILON) return normalize(wish);

    const now = flat(facing);
    return lengthSq(now) > EPSILON ? normalize(now) : ZERO;
  },

  /** Where the owner's origin stands for the ball to arrive on the part's own spot. */
  standSpot(point: Vec3, forward: Vec3, holdOffset: number, ownerHeight: number, lateralSpot = 0): Vec3 {
    const f = flat(forward);
    const right = cross(f, UP);
    const stand = sub(sub(flat(point), scale(f, holdOffset)), scale(right, lateralSpot));
    return withY(stand, ownerHeight);
  },

  /** The flat velocity that brings the owner to the stand spot in `time`, never faster than the top speed. */
  velocityTo(stand: Vec3, owner: Vec3, time: number, settings: FollowSettings): Vec3 {
    const gap = flat(sub(stand, owner));
    const over = Math.max(time, Math.max(settings.MinTime, 0.0001));
    let velocity = scale(gap, 1 / over);

    const top = Math.max(settings.TopSpeed, 0);
    const speed = length(velocity);
    if (speed > top) velocity = speed > 0 ? scale(velocity, top / speed) : ZERO;
    return velocity;
  },

  /** The follow's proposal for a contact `time` away; null when the follow is off or the contact is now. */
  propose(
    point: Vec3,
    time: number,
    holdOffset: number,
    ownerPosition: Vec3,
    ballVelocity: Vec3,
    intent: Vec3,
    facing: Vec3,
    settings: FollowSettings,
    lateralSpot = 0,
  ): FollowStep | null {
    if (!followEnabled(settings) || time <= 0) return null;
    return FollowRule.toward(
      point,
      time,
      holdOffset,
      ownerPosition,
      FollowRule.forwardAt(ballVelocity, intent, facing, settings),
      settings,
      lateralSpot,
    );
  },

  /** The proposal with the forward already decided: a trap faces the ball coming in (S24). */
  toward(
    point: Vec3,
    time: number,
    holdOffset: number,
    ownerPosition: Vec3,
    forward: Vec3,
    settings: FollowSettings,
    lateralSpot = 0,
  ): FollowStep | null {
    if (!followEnabled(settings) || time <= 0) return null;
    const stand = FollowRule.standSpot(point, forward, holdOffset, ownerPosition.y, lateralSpot);
    const velocity = FollowRule.velocityTo(stand, ownerPosition, time, settings);
    return { Velocity: velocity, Forward: flat(forward), Stand: stand, OwnerAtContact: add(ownerPosition, scale(velocity, time)) };
  },

  /** The step with any part of its velocity against the stick taken out (S35). */
  neverAgainst(step: FollowStep, intent: Vec3, ownerPosition: Vec3, time: number): FollowStep {
    const wish = flat(intent);
    if (lengthSq(wish) <= EPSILON) return step;

    const along = normalize(wish);
    const against = dot(step.Velocity, along);
    if (against >= 0) return step;

    const velocity = sub(step.Velocity, scale(along, against));
    const at = add(ownerPosition, scale(velocity, Math.max(time, 0)));
    return { ...step, Velocity: velocity, Stand: withY(at, step.Stand.y), OwnerAtContact: at };
  },
};

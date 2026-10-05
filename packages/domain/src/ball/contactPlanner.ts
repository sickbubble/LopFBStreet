import { strideAfter, swinging } from '../body/strideClock.js';
import { FOLLOW_OFF, FollowRule } from '../player/followRule.js';
import { holdOffsetFor, levelFor, shoulderExists, type BounceSettings } from '../tuning/ballSettings.js';
import { hasShoulders, reachForLimb } from '../tuning/bodyModel.js';
import { add, cross, dot, flat, length, lengthSq, normalize, scale, sub, UP, vecEquals, withY, ZERO, type Vec3 } from '../vec.js';
import { Ballistics } from './ballistics.js';
import { BallVerb } from './ballVerb.js';
import {
  makePlan,
  NO_PLAN,
  partUnderTheBall,
  TouchKind,
  type BounceInput,
  type ContactPlan,
} from './contactPlan.js';
import { LandingPredictor } from './landingPredictor.js';
import { BodySide, Limb, Limbs } from './limb.js';
import { ContactSpot, Torso } from './torso.js';

/** Below this squared length a facing has no direction. */
const FACING_EPSILON = 0.0001;

/** The parts that trap a ball out of the air, highest first. Never the head. */
const TRAP_PARTS: readonly BallVerb[] = [BallVerb.Chest, BallVerb.Thigh, BallVerb.Foot];

interface Crossing {
  readonly time: number;
  readonly point: Vec3;
}

/**
 * Decides the next contact before it happens: which limb, when, where, and
 * whether it can get there (S16). Pure, re-run every step. Port of
 * `ContactPlanner.cs`.
 */
export const ContactPlanner = {
  plan(
    input: BounceInput,
    level: BallVerb,
    held: boolean,
    lastLimb: Limb,
    kind: TouchKind,
    settings: BounceSettings,
    controlled = true,
    committed: Limb = Limb.None,
    neverAgainstStick = false,
  ): ContactPlan {
    if (!input.HasOwner) return NO_PLAN;

    if (held) {
      const holding =
        Limbs.levelOf(lastLimb) === level && lastLimb !== Limb.None
          ? lastLimb
          : Limbs.for(level, sideOf(input.BallPosition, input, lastLimb, level, 0));
      return makePlan(holding, level, kind, 0, input.BallPosition, ContactPlanner.canReach(holding, input.BallPosition, input, settings));
    }

    if (!controlled && !input.IsGrounded) return trap(input, lastLimb, kind, settings, committed);

    let at = level;
    let time: number;
    let point: Vec3;
    let crossing: Crossing | null = null;

    if (input.IsGrounded) {
      at = BallVerb.Foot;
      time = 0;
      point = input.BallPosition;
      kind = grounded(kind, settings);
    } else if (
      levelFor(settings.Levels, at).TouchHeight > input.BallRadius &&
      (crossing = nextCrossing(input, levelFor(settings.Levels, at).TouchHeight)) !== null
    ) {
      time = crossing.time;
      point = crossing.point;
    } else {
      at = BallVerb.Foot;
      const landing = LandingPredictor.predict(
        input.BallPosition,
        input.BallVelocity,
        input.EffectiveGravity,
        input.OwnerPosition.y,
        input.BallRadius,
      );
      time = landing.TimeToLand;
      point = landing.Point;
      kind = grounded(kind, settings);
    }

    if (time > 0 || !input.IsGrounded) at = partUnderTheBall(at, input.OwnerRise, settings);

    let forced: Limb = Limb.None;
    if (at === BallVerb.Chest) {
      const shoulder = shoulderCrossing(input, settings);
      if (shoulder) {
        forced = shoulder.limb;
        time = shoulder.time;
        point = shoulder.point;
      }
    }

    const holdOffset = forced === Limb.None ? levelFor(settings.Levels, at).HoldOffset : holdOffsetFor(settings, forced);

    let lateralSpot = 0;
    if (at === BallVerb.Thigh && forced === Limb.None) {
      const knee =
        Limbs.levelOf(committed) === BallVerb.Thigh ? committed : Limbs.for(at, sideOf(point, input, lastLimb, at, time));
      lateralSpot = ContactSpot.arriving(knee, input.OwnerBody);
    }

    if (controlled) {
      const proposed = FollowRule.propose(
        point,
        time,
        holdOffset,
        input.OwnerPosition,
        input.BallVelocity,
        input.OwnerIntent,
        input.OwnerFacing,
        input.OwnerFollow ?? FOLLOW_OFF,
        lateralSpot,
      );
      if (proposed) {
        const follow = neverAgainstStick
          ? FollowRule.neverAgainst(proposed, input.OwnerIntent, input.OwnerPosition, time)
          : proposed;

        const there: BounceInput = {
          ...input,
          OwnerPosition: follow.OwnerAtContact,
          OwnerFacing: follow.Forward,
          OwnerVelocity: follow.Velocity,
        };

        const followed = choose(point, there, lastLimb, at, time, kind, settings, committed, forced);
        if (followed.Reachable) return { ...followed, Following: true, Stand: follow.Stand, Forward: follow.Forward };
      }
    }

    return choose(point, input, lastLimb, at, time, kind, settings, committed, forced);
  },

  /** Whether this limb's contact surface can get to the point: within reach of its anchor, flat, and not behind S13's line. */
  canReach(limb: Limb, point: Vec3, input: BounceInput, settings: BounceSettings): boolean {
    if (limb === Limb.None) return false;

    const facing = flatFacing(input.OwnerFacing);
    const toPoint = flat(sub(point, input.OwnerPosition));

    if (!vecEquals(facing, ZERO) && dot(facing, toPoint) < -settings.BehindReach) return false;

    const reach = reachForLimb(input.OwnerBody, limb);
    const anchor = scale(right(facing), reach.Lateral * sign(Limbs.sideOf(limb)));
    const fromAnchor = sub(toPoint, anchor);

    return lengthSq(fromAnchor) <= reach.Reach * reach.Reach;
  },
};

function shoulderCrossing(input: BounceInput, settings: BounceSettings): (Crossing & { limb: Limb }) | null {
  if (!shoulderExists(settings.Shoulder) || !hasShoulders(input.OwnerBody) || input.IsGrounded) return null;

  const crossing = nextCrossing(input, settings.Shoulder.TouchHeight);
  if (!crossing) return null;

  const toPoint = flat(sub(crossing.point, input.OwnerPosition));
  const lateral = dot(right(flatFacing(input.OwnerFacing)), toPoint);
  const limb = Torso.partFor(lateral, input.OwnerBody.ShoulderLine);

  return Limbs.isShoulder(limb) ? { ...crossing, limb } : null;
}

function choose(
  point: Vec3,
  from: BounceInput,
  lastLimb: Limb,
  at: BallVerb,
  time: number,
  kind: TouchKind,
  settings: BounceSettings,
  committed: Limb,
  forced: Limb = Limb.None,
): ContactPlan {
  if (forced !== Limb.None) {
    return makePlan(forced, at, played(kind, forced), time, point, ContactPlanner.canReach(forced, point, from, settings));
  }

  if (
    committed !== Limb.None &&
    Limbs.levelOf(committed) === at &&
    !Limbs.isShoulder(committed) &&
    ContactPlanner.canReach(committed, point, from, settings)
  ) {
    return makePlan(committed, at, played(kind, committed), time, point, true);
  }

  const preferred = sideOf(point, from, lastLimb, at, time);
  let limb = Limbs.for(at, preferred);
  let reachable = ContactPlanner.canReach(limb, point, from, settings);

  if (!reachable && preferred !== BodySide.None) {
    const other = Limbs.mirror(limb);
    if (ContactPlanner.canReach(other, point, from, settings)) {
      limb = other;
      reachable = true;
    }
  }

  return makePlan(limb, at, played(kind, limb), time, point, reachable);
}

/** A shoulder sends the ball back up however its level is tuned (S27). */
const played = (kind: TouchKind, limb: Limb): TouchKind =>
  kind === TouchKind.Stall && Limbs.isShoulder(limb) ? TouchKind.KeepUp : kind;

/** A keep-up or a trap from the floor is the scoop, unless the foot's surface is the floor itself. */
const grounded = (kind: TouchKind, settings: BounceSettings): TouchKind =>
  (kind === TouchKind.KeepUp || kind === TouchKind.Trap) && settings.Levels.Foot.TouchHeight > 0 ? TouchKind.Scoop : kind;

/** The first touch of a ball not under control, in the air (S24). */
function trap(input: BounceInput, lastLimb: Limb, kind: TouchKind, settings: BounceSettings, committed: Limb): ContactPlan {
  for (const part of TRAP_PARTS) {
    const height = levelFor(settings.Levels, part).TouchHeight;
    if (height <= input.BallRadius) continue;
    const crossing = nextCrossing(input, height);
    if (!crossing) continue;

    const at = partUnderTheBall(part, input.OwnerRise, settings);
    const plan = approach(crossing.point, crossing.time, at, input, lastLimb, kind, settings, committed);
    if (plan.Reachable) return plan;
  }

  const landing = LandingPredictor.predict(
    input.BallPosition,
    input.BallVelocity,
    input.EffectiveGravity,
    input.OwnerPosition.y,
    input.BallRadius,
  );

  return approach(landing.Point, landing.TimeToLand, BallVerb.Foot, input, lastLimb, grounded(kind, settings), settings, committed);
}

/** A trap's reach, measured where the owner's own motion puts them; the body takes the last step only (S24). */
function approach(
  point: Vec3,
  time: number,
  at: BallVerb,
  input: BounceInput,
  lastLimb: Limb,
  kind: TouchKind,
  settings: BounceSettings,
  committed: Limb,
): ContactPlan {
  if (time <= 0) return choose(point, input, lastLimb, at, time, kind, settings, committed);

  const follow = input.OwnerFollow ?? FOLLOW_OFF;
  const going = add(input.OwnerPosition, scale(flat(input.OwnerVelocity), time));
  const toBall = flat(sub(point, going));
  const forward = lengthSq(toBall) > FACING_EPSILON ? normalize(toBall) : flatFacing(input.OwnerFacing);

  const step = FollowRule.toward(point, time, levelFor(settings.Levels, at).HoldOffset, input.OwnerPosition, forward, follow);
  if (step && length(flat(sub(step.Stand, going))) <= follow.TrapAssist) {
    const there: BounceInput = {
      ...input,
      OwnerPosition: step.OwnerAtContact,
      OwnerFacing: step.Forward,
      OwnerVelocity: step.Velocity,
    };
    const assisted = choose(point, there, lastLimb, at, time, kind, settings, committed);
    if (assisted.Reachable) return { ...assisted, Following: true, Stand: step.Stand, Forward: step.Forward };
  }

  return choose(point, { ...input, OwnerPosition: going }, lastLimb, at, time, kind, settings, committed);
}

/**
 * When and where the ball next comes down through a touch height. A crossing
 * within the last step counts as now. Null when already passed, or never.
 */
function nextCrossing(input: BounceInput, touchHeight: number): Crossing | null {
  const surface = input.OwnerPosition.y + touchHeight;
  const above = input.BallPosition.y - surface;

  const time = Ballistics.timeToDescendTo(above, input.BallVelocity.y, input.EffectiveGravity);
  if (time === null || time < -input.Step) return null;
  if (time <= 0) return { time: 0, point: input.BallPosition };

  const point = Ballistics.positionAfter(input.BallPosition, input.BallVelocity, input.EffectiveGravity, time);
  return { time, point: withY(point, surface) };
}

/** Which side plays a contact at this point (S16, S18). */
function sideOf(point: Vec3, input: BounceInput, lastLimb: Limb, level: BallVerb, timeToContact: number): BodySide {
  if (level === BallVerb.Chest || level === BallVerb.Head) return BodySide.None;

  const toPoint = flat(sub(point, input.OwnerPosition));
  const lateral = dot(right(flatFacing(input.OwnerFacing)), toPoint);
  const deadband = Math.max(input.OwnerBody.SideDeadband, 0);

  if (lateral > deadband) return BodySide.Right;
  if (lateral < -deadband) return BodySide.Left;

  if (input.OwnerStride.Moving && level === BallVerb.Foot) {
    const speed = length(flat(input.OwnerVelocity));
    return swinging(strideAfter(input.OwnerStride, speed * Math.max(timeToContact, 0)));
  }

  const last = Limbs.sideOf(lastLimb);
  return last === BodySide.None ? BodySide.Right : Limbs.opposite(last);
}

function flatFacing(facing: Vec3): Vec3 {
  const f = flat(facing);
  return lengthSq(f) < FACING_EPSILON ? ZERO : normalize(f);
}

/** The owner's right, flat. Zero for a facing of nothing. */
const right = (flatFacingDir: Vec3): Vec3 => cross(flatFacingDir, UP);

const sign = (side: BodySide): number => (side === BodySide.Left ? -1 : side === BodySide.Right ? 1 : 0);

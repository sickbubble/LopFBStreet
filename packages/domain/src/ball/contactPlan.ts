import type { StrideState } from '../body/strideClock.js';
import type { FollowSettings } from '../player/followRule.js';
import { levelFor, levelForHeight, type BounceSettings } from '../tuning/ballSettings.js';
import type { BodyModel } from '../tuning/bodyModel.js';
import { ZERO, type Vec3 } from '../vec.js';
import type { BallVerb } from './ballVerb.js';
import { Limb, Limbs, type BodySide } from './limb.js';

/**
 * Everything the solver needs to know about this physics step. Port of the
 * C# `BounceInput` record; the four `init` properties are optional here, and
 * default as they do there.
 */
export interface BounceInput {
  readonly BallPosition: Vec3;
  readonly BallVelocity: Vec3;
  readonly HasOwner: boolean;
  /** The owner's feet. */
  readonly OwnerPosition: Vec3;
  readonly OwnerVelocity: Vec3;
  /** Input direction times the speed cap, before any carry slowdown. */
  readonly OwnerIntent: Vec3;
  readonly OwnerFacing: Vec3;
  /** How far the owner's origin is above their feet: the jump. */
  readonly OwnerRise: number;
  readonly OwnerStride: StrideState;
  readonly OwnerBody: BodyModel;
  readonly IsGrounded: boolean;
  readonly BallRadius: number;
  readonly Step: number;
  readonly EffectiveGravity: number;
  /** How the body follows the ball (S23). Off when absent. */
  readonly OwnerFollow?: FollowSettings;
  /** A shove from something that is not the owner, m/s. Zero when absent. */
  readonly ExternalPush?: Vec3;
  /** Something that is not the owner touched the ball this step (S34). */
  readonly Deflected?: boolean;
  /** The deflection was cloth (S35). */
  readonly DeflectedSoftly?: boolean;
}

/** What the last touch was. Port of `TouchKind`. */
export const TouchKind = {
  None: 0,
  /** An automatic keep-up at the current level. */
  KeepUp: 1,
  /** A commanded touch upward, to the apex the hold asked for. */
  Bounce: 2,
  /** A commanded touch to an apex below the ball. */
  Drop: 3,
  /** The queued launch, fired from this touch. */
  Launch: 4,
  /** Cushioned out of the air and held on the body. */
  Stall: 5,
  /** A held ball thrown off by the owner's movement. */
  Break: 6,
  /** A ball on the ground, lifted back up by the foot (S17). */
  Scoop: 7,
  /** The first touch of a ball not under control, untimed (S24). */
  Trap: 8,
  /** The perfect reception (S24). */
  Reception: 9,
} as const;
export type TouchKind = (typeof TouchKind)[keyof typeof TouchKind];

export const touchKindName = (kind: TouchKind): string =>
  (['None', 'KeepUp', 'Bounce', 'Drop', 'Launch', 'Stall', 'Break', 'Scoop', 'Trap', 'Reception'] as const)[kind];

/** The next contact, decided before it happens (S16). Port of `ContactPlan`. */
export interface ContactPlan {
  readonly Limb: Limb;
  readonly Level: BallVerb;
  readonly Kind: TouchKind;
  readonly TimeToContact: number;
  readonly Point: Vec3;
  readonly Reachable: boolean;
  /** True while the body follows the ball to this contact (S23). */
  readonly Following: boolean;
  readonly Stand: Vec3;
  readonly Forward: Vec3;
}

export const NO_PLAN: ContactPlan = {
  Limb: Limb.None,
  Level: 0,
  Kind: TouchKind.None,
  TimeToContact: 0,
  Point: ZERO,
  Reachable: false,
  Following: false,
  Stand: ZERO,
  Forward: ZERO,
};

export const makePlan = (
  limb: Limb,
  level: BallVerb,
  kind: TouchKind,
  time: number,
  point: Vec3,
  reachable: boolean,
): ContactPlan => ({
  Limb: limb,
  Level: level,
  Kind: kind,
  TimeToContact: time,
  Point: point,
  Reachable: reachable,
  Following: false,
  Stand: ZERO,
  Forward: ZERO,
});

export const planExists = (plan: ContactPlan): boolean => plan.Limb !== Limb.None;

export const planSide = (plan: ContactPlan): BodySide => Limbs.sideOf(plan.Limb);

/** The time to this limb's contact for the body to swing on, or null when it has nothing to swing at. */
export const swingTimeFor = (plan: ContactPlan, limb: Limb): number | null =>
  planExists(plan) && plan.Limb === limb && (plan.Reachable || plan.TimeToContact > 0) ? plan.TimeToContact : null;

/** Float slack for a body part read back exactly at a level boundary (S15). */
const BOUNDARY_MARGIN = 0.001;

/**
 * The body part actually at a level's touch height when the body has risen
 * (S15). A jump only ever lowers it. `BounceSolver.PartUnderTheBall` in C#.
 */
export function partUnderTheBall(level: BallVerb, rise: number, settings: BounceSettings): BallVerb {
  if (rise <= 0) return level;
  const atBody = levelFor(settings.Levels, level).TouchHeight - rise + BOUNDARY_MARGIN;
  const fromBody = levelForHeight(settings.Levels, atBody);
  return fromBody < level ? fromBody : level;
}

import { BallVerb } from '../ball/ballVerb.js';
import { Limbs, type Limb } from '../ball/limb.js';
import type { PassProfiles } from './passProfiles.js';

/**
 * Every feel value of the ball, as plain data: a port of the C# `BallSettings`
 * record and its parts (`domain/Tuning/BallSettings.cs` at godot-final).
 * Field names are the C# ones, so `tools/golden/tuning/ball.json` loads with
 * no rename table. The doc comments on each field are in the C# source and
 * docs/IMPLEMENTATION.md S1-S35; they are not repeated here.
 */

export interface BodySettings {
  readonly Radius: number;
  readonly Mass: number;
  readonly GravityScale: number;
  readonly LinearDamp: number;
  readonly AngularDamp: number;
  readonly Bounce: number;
  readonly Friction: number;
}

/** Ownership arbitration (S3). */
export interface PossessionSettings {
  readonly Radius: number;
  readonly OwnershipMargin: number;
  readonly OwnershipDwell: number;
  readonly TouchCooldown: number;
}

/** One level a ball can be carried at (S8). */
export interface CarryLevel {
  readonly TouchHeight: number;
  readonly HoldOffset: number;
  readonly Apex: number;
  readonly SpeedFactor: number;
  readonly LeadFactor: number;
  readonly Correction: number;
  /** Zero means this level does not stall at all: the foot bounce-dribbles (S10). */
  readonly BreakRadius: number;
  readonly MicroMotion: number;
}

/** Whether a ball arriving at this level is held rather than popped back up. */
export const stalls = (level: CarryLevel): boolean => level.BreakRadius > 0;

export interface CarryLevels {
  readonly Foot: CarryLevel;
  readonly Thigh: CarryLevel;
  readonly Chest: CarryLevel;
  readonly Head: CarryLevel;
}

/**
 * A commanded apex must clear its level's touch height by at least this, so
 * every apex in a band is a real flight. A constant in C# too.
 */
export const POP_MARGIN = 0.2;

export function levelFor(levels: CarryLevels, level: BallVerb): CarryLevel {
  switch (level) {
    case BallVerb.Thigh:
      return levels.Thigh;
    case BallVerb.Chest:
      return levels.Chest;
    case BallVerb.Head:
      return levels.Head;
    default:
      return levels.Foot;
  }
}

/** The level a commanded touch to this apex will be carried at afterwards. */
export function levelForApex(levels: CarryLevels, apex: number): BallVerb {
  if (apex >= levels.Head.TouchHeight + POP_MARGIN) return BallVerb.Head;
  if (apex >= levels.Chest.TouchHeight + POP_MARGIN) return BallVerb.Chest;
  return apex >= levels.Thigh.TouchHeight + POP_MARGIN ? BallVerb.Thigh : BallVerb.Foot;
}

/** The highest level whose touch height is at or below this height (S15). */
export function levelForHeight(levels: CarryLevels, height: number): BallVerb {
  if (height >= levels.Head.TouchHeight) return BallVerb.Head;
  if (height >= levels.Chest.TouchHeight) return BallVerb.Chest;
  return height >= levels.Thigh.TouchHeight ? BallVerb.Thigh : BallVerb.Foot;
}

/** The first touch (S24). */
export interface TrapSettings {
  readonly WindowBefore: number;
  readonly WindowAfter: number;
  readonly Rebound: number;
  readonly MaxResidual: number;
  readonly LiftPerSpeed: number;
}

/** Where a shoulder meets a torso ball (S27). A zero touch height turns the shoulders off. */
export interface ShoulderTouch {
  readonly TouchHeight: number;
  readonly HoldOffset: number;
}

export const shoulderExists = (shoulder: ShoulderTouch): boolean => shoulder.TouchHeight > 0;

/** The touch while owned (S2, S7, S8). */
export interface BounceSettings {
  readonly BounceMaxApex: number;
  readonly BounceChargeTime: number;
  readonly FlightEase: number;
  readonly TouchLeadPerSpeed: number;
  readonly TouchMaxSpeed: number;
  readonly KeepUpReach: number;
  readonly BehindReach: number;
  readonly CarryRadius: number;
  readonly StallCoupling: number;
  readonly StallRestore: number;
  readonly StallDamping: number;
  readonly Levels: CarryLevels;
  readonly Trap: TrapSettings;
  readonly Shoulder: ShoulderTouch;
}

/** Where a ball played by this limb rests ahead of the origin (S27). */
export const holdOffsetFor = (settings: BounceSettings, limb: Limb): number =>
  Limbs.isShoulder(limb) && shoulderExists(settings.Shoulder)
    ? settings.Shoulder.HoldOffset
    : levelFor(settings.Levels, Limbs.levelOf(limb)).HoldOffset;

/** The height a ball played by this limb is met at, above the owner's feet (S27). */
export const touchHeightFor = (settings: BounceSettings, limb: Limb): number =>
  Limbs.isShoulder(limb) && shoulderExists(settings.Shoulder)
    ? settings.Shoulder.TouchHeight
    : levelFor(settings.Levels, Limbs.levelOf(limb)).TouchHeight;

/** How the owner's speed cap follows the carry level (S8). */
export interface CarrySettings {
  readonly SlowTime: number;
  readonly RecoverTime: number;
}

/** The charge-and-release launch (S1, S28). */
export interface LaunchSettings {
  readonly MinSpeed: number;
  readonly MaxSpeed: number;
  readonly ChargeTime: number;
  readonly LaunchSpin: number;
  readonly Parts: PassProfiles;
  readonly AimLoftOffset: number;
  readonly AimLoftGain: number;
}

/** The launch pitch a camera pitch asks for, degrees, before the part's loft window clamps it. */
export const loftFor = (launch: LaunchSettings, cameraPitchDegrees: number): number =>
  launch.AimLoftOffset + launch.AimLoftGain * cameraPitchDegrees;

/** Reception (S5). */
export interface ReceptionSettings {
  readonly CatchSpeed: number;
  readonly RicochetRestitution: number;
  readonly CatchWindow: number;
}

/** Height bands that pick the body part (GDD 3.3). */
export interface VerbBands {
  readonly FootMax: number;
  readonly ThighMax: number;
  readonly ChestMax: number;
}

/** Which body part meets a ball at this height above the owner's feet. */
export function verbFor(bands: VerbBands, height: number): BallVerb {
  if (height <= bands.FootMax) return BallVerb.Foot;
  if (height <= bands.ThighMax) return BallVerb.Thigh;
  return height <= bands.ChestMax ? BallVerb.Chest : BallVerb.Head;
}

export interface BallSettings {
  readonly Body: BodySettings;
  readonly Possession: PossessionSettings;
  readonly Bounce: BounceSettings;
  readonly Carry: CarrySettings;
  readonly Launch: LaunchSettings;
  readonly Reception: ReceptionSettings;
  readonly Bands: VerbBands;
}

/** C#'s `default(TrapSettings)`: no window and no rebound, so a trap is a plain keep-up. */
export const NO_TRAP: TrapSettings = { WindowBefore: 0, WindowAfter: 0, Rebound: 0, MaxResidual: 0, LiftPerSpeed: 0 };

/** C#'s `default(ShoulderTouch)`: a body with no shoulders. */
export const NO_SHOULDER: ShoulderTouch = { TouchHeight: 0, HoldOffset: 0 };

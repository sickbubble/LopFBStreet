import { BallVerb } from '../ball/ballVerb.js';
import { Limbs, type Limb } from '../ball/limb.js';

/** Where one limb hangs from the body and how far it reaches (S16). */
export interface LimbReach {
  readonly Height: number;
  readonly Lateral: number;
  readonly Reach: number;
}

/**
 * Rest-pose facts about the owner's body that decide which limb can play a
 * ball (S16). Numbers, never bones. Port of `BodyModel.cs`.
 */
export interface BodyModel {
  readonly Foot: LimbReach;
  readonly Thigh: LimbReach;
  readonly Chest: LimbReach;
  readonly Head: LimbReach;
  readonly SideDeadband: number;
  /** The acromion (S27). A zero reach is a body with no shoulders. */
  readonly Shoulder: LimbReach;
  /** Outside this of the centreline a torso ball is the shoulder's (S27). */
  readonly ShoulderLine: number;
  /** How far out a thigh keep-up sends the ball, to the other knee (S29). */
  readonly ThighSpot: number;
}

const NO_REACH: LimbReach = { Height: 0, Lateral: 0, Reach: 0 };

/** A body with no reach anywhere: what an unowned ball's solver input carries. */
export const NO_BODY: BodyModel = {
  Foot: NO_REACH,
  Thigh: NO_REACH,
  Chest: NO_REACH,
  Head: NO_REACH,
  SideDeadband: 0,
  Shoulder: NO_REACH,
  ShoulderLine: 0,
  ThighSpot: 0,
};

export const hasShoulders = (body: BodyModel): boolean => body.ShoulderLine > 0 && body.Shoulder.Reach > 0;

/** The anchor and reach of the limb that plays this level. */
export function reachFor(body: BodyModel, level: BallVerb): LimbReach {
  switch (level) {
    case BallVerb.Thigh:
      return body.Thigh;
    case BallVerb.Chest:
      return body.Chest;
    case BallVerb.Head:
      return body.Head;
    default:
      return body.Foot;
  }
}

/** The anchor and reach of one limb; the shoulders hang somewhere else entirely (S27). */
export const reachForLimb = (body: BodyModel, limb: Limb): LimbReach =>
  Limbs.isShoulder(limb) ? body.Shoulder : reachFor(body, Limbs.levelOf(limb));

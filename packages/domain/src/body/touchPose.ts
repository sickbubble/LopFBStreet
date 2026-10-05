import { BallVerb } from '../ball/ballVerb.js';
import { Limb, Limbs } from '../ball/limb.js';
import { clamp } from '../mathUtil.js';

/**
 * The web body's stand-in for the Godot contact poses (S17-S21, S26-S27):
 * how far a part turns to meet a ball, and when. No IK and no strike path:
 * one turn per part, eased in before the planned contact and out after it.
 * The numbers are `player.json`'s, read by name (radians here, converted by
 * the loader). It decides only what is shown: nothing reads it back (rule 4).
 */
export interface TouchPoseSettings {
  /** Seconds before contact the pose starts to engage (`PoseWindup`). */
  readonly Windup: number;
  /** Seconds after contact it takes to let go (`PoseRecover`). */
  readonly Recover: number;
  /**
   * The foot's swing at the instep: the thigh forward by this. A web value
   * (`FOOT_SWING_DEGREES`): Godot drew the foot with a strike path and IK,
   * which have no single angle.
   */
  readonly FootSwing: number;
  /** The thigh's raise for a knee ball (`ThighMaxRaiseDegrees`). */
  readonly ThighRaise: number;
  /** The chest's lean back (`ChestArchDegrees`). */
  readonly ChestArch: number;
  /** The head's tilt back, then its nod (`HeadTiltDegrees`, `HeadNodDegrees`). */
  readonly HeadTilt: number;
  readonly HeadNod: number;
  /** The shoulder's shrug (`ShoulderShrugDegrees`). */
  readonly ShoulderShrug: number;
}

/** The web's foot swing, degrees. No Godot twin; logged in TUNING_LOG as a web, body-stand-in value. */
export const FOOT_SWING_DEGREES = 30;

/** Which bone group a pose turns. */
export const PosePart = { None: 0, LeftLeg: 1, RightLeg: 2, Chest: 3, Head: 4, LeftShoulder: 5, RightShoulder: 6 } as const;
export type PosePart = (typeof PosePart)[keyof typeof PosePart];

/** The part a limb's pose turns. A thigh and a foot are both the leg; they differ by angle. */
export function posePartOf(limb: Limb): PosePart {
  switch (limb) {
    case Limb.LeftFoot:
    case Limb.LeftThigh:
      return PosePart.LeftLeg;
    case Limb.RightFoot:
    case Limb.RightThigh:
      return PosePart.RightLeg;
    case Limb.Chest:
      return PosePart.Chest;
    case Limb.Head:
      return PosePart.Head;
    case Limb.LeftShoulder:
      return PosePart.LeftShoulder;
    case Limb.RightShoulder:
      return PosePart.RightShoulder;
    default:
      return PosePart.None;
  }
}

/** The angle the part turns to at full weight, radians, for a limb. */
export function poseAngle(limb: Limb, settings: TouchPoseSettings): number {
  if (Limbs.isShoulder(limb)) return settings.ShoulderShrug;
  switch (Limbs.levelOf(limb)) {
    case BallVerb.Thigh:
      return settings.ThighRaise;
    case BallVerb.Chest:
      return settings.ChestArch;
    case BallVerb.Head:
      return settings.HeadTilt;
    default:
      return settings.FootSwing;
  }
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * How much of the pose shows, 0..1: rising over the windup to the planned
 * contact, falling over the recover after the last one. `timeToContact` is
 * null when nothing is planned for this part; `sinceContact` null when it has
 * not played the ball.
 */
export function poseWeight(timeToContact: number | null, sinceContact: number | null, settings: TouchPoseSettings): number {
  const coming = timeToContact === null ? 0 : smooth(clamp(1 - timeToContact / Math.max(settings.Windup, 0.001), 0, 1));
  const going = sinceContact === null ? 0 : smooth(clamp(1 - sinceContact / Math.max(settings.Recover, 0.001), 0, 1));
  return Math.max(coming, going);
}

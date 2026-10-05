import { BallVerb } from '../ball/ballVerb.js';
import { Limb } from '../ball/limb.js';

/** The body part a pass is played with (S28). Port of `PassPart`. */
export const PassPart = {
  Foot: 0,
  Backheel: 1,
  Thigh: 2,
  Chest: 3,
  Shoulder: 4,
  Head: 5,
} as const;
export type PassPart = (typeof PassPart)[keyof typeof PassPart];

export const passPartName = (part: PassPart): string =>
  (['Foot', 'Backheel', 'Thigh', 'Chest', 'Shoulder', 'Head'] as const)[part];

/** Every part, strongest first, as S28's table ranks them. */
export const PASS_PARTS_BY_POWER: readonly PassPart[] = [
  PassPart.Foot,
  PassPart.Head,
  PassPart.Thigh,
  PassPart.Backheel,
  PassPart.Chest,
  PassPart.Shoulder,
];

/** The part a limb passes with. A foot aimed behind the body is a backheel. */
export function passPartOfLimb(limb: Limb, behind: boolean): PassPart {
  switch (limb) {
    case Limb.LeftFoot:
    case Limb.RightFoot:
      return behind ? PassPart.Backheel : PassPart.Foot;
    case Limb.LeftThigh:
    case Limb.RightThigh:
      return PassPart.Thigh;
    case Limb.LeftShoulder:
    case Limb.RightShoulder:
      return PassPart.Shoulder;
    case Limb.Chest:
      return PassPart.Chest;
    case Limb.Head:
      return PassPart.Head;
    default:
      return behind ? PassPart.Backheel : PassPart.Foot;
  }
}

/** The part for a level, when no limb is planned. */
export function passPartOfVerb(verb: BallVerb, behind: boolean): PassPart {
  switch (verb) {
    case BallVerb.Thigh:
      return PassPart.Thigh;
    case BallVerb.Chest:
      return PassPart.Chest;
    case BallVerb.Head:
      return PassPart.Head;
    case BallVerb.Backheel:
      return PassPart.Backheel;
    default:
      return behind ? PassPart.Backheel : PassPart.Foot;
  }
}

/** The directions a shoulder can send the ball, degrees off the facing toward its own side. */
export interface SideWindow {
  readonly MinDegrees: number;
  readonly MaxDegrees: number;
}

export const sideWindowExists = (w: SideWindow): boolean => w.MaxDegrees > w.MinDegrees;

/** How one part passes (S28). */
export interface PassProfile {
  readonly PowerScale: number;
  readonly LoftMinDegrees: number;
  readonly LoftMaxDegrees: number;
  readonly SpinScale: number;
  readonly Side: SideWindow;
}

export interface PassProfiles {
  readonly Foot: PassProfile;
  readonly Backheel: PassProfile;
  readonly Thigh: PassProfile;
  readonly Chest: PassProfile;
  readonly Shoulder: PassProfile;
  readonly Head: PassProfile;
}

export function profileFor(parts: PassProfiles, part: PassPart): PassProfile {
  switch (part) {
    case PassPart.Backheel:
      return parts.Backheel;
    case PassPart.Thigh:
      return parts.Thigh;
    case PassPart.Chest:
      return parts.Chest;
    case PassPart.Shoulder:
      return parts.Shoulder;
    case PassPart.Head:
      return parts.Head;
    case PassPart.Foot:
      return parts.Foot;
    default:
      throw new RangeError(`no such pass part: ${String(part)}`);
  }
}

/** C#'s `default(SideWindow)`: no window. */
export const NO_SIDE: SideWindow = { MinDegrees: 0, MaxDegrees: 0 };

const profileOf = (PowerScale: number, LoftMinDegrees: number, LoftMaxDegrees: number, SpinScale: number, Side: SideWindow = NO_SIDE): PassProfile => ({
  PowerScale,
  LoftMinDegrees,
  LoftMaxDegrees,
  SpinScale,
  Side,
});

/** `PassProfiles.Default`: S28's starting table, for tests. The game reads ball.json. */
export const DEFAULT_PASS_PROFILES: PassProfiles = {
  Foot: profileOf(1.0, -10, 70, 1.0),
  Backheel: profileOf(0.58, 0, 30, 0),
  Thigh: profileOf(0.65, 5, 60, 0.3),
  Chest: profileOf(0.55, -10, 35, 0),
  Shoulder: profileOf(0.53, 0, 40, 0, { MinDegrees: 20, MaxDegrees: 120 }),
  Head: profileOf(0.74, -10, 60, 0),
};

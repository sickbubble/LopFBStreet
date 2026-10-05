import { hasShoulders, type BodyModel } from '../tuning/bodyModel.js';
import { stalls, type CarryLevel } from '../tuning/ballSettings.js';
import { BodySide, Limb, Limbs } from './limb.js';

/**
 * Which part of the torso plays a ball, and whether it holds it (S27). Port of
 * `Torso.cs`.
 */
export const Torso = {
  /** The chest inside the line, the shoulder on the side it is out on. `lateral` is to the owner's right. */
  partFor(lateral: number, line: number): Limb {
    if (line <= 0) return Limb.Chest;
    if (lateral > line) return Limb.RightShoulder;
    return lateral < -line ? Limb.LeftShoulder : Limb.Chest;
  },

  /** Whether this limb holds the ball at this level. The shoulders never do. */
  holds: (limb: Limb, level: CarryLevel): boolean => stalls(level) && !Limbs.isShoulder(limb),
};

const isThigh = (limb: Limb): boolean => limb === Limb.LeftThigh || limb === Limb.RightThigh;

function ownSide(limb: Limb, offset: number): number {
  const lateral = Math.abs(offset);
  switch (Limbs.sideOf(limb)) {
    case BodySide.Left:
      return -lateral;
    case BodySide.Right:
      return lateral;
    default:
      return 0;
  }
}

/**
 * Where, sideways, a part meets the ball and where it sends it (S27, S29).
 * Offsets from the centreline, positive to the owner's right. Port of
 * `ContactSpot.cs`.
 */
export const ContactSpot = {
  arriving(limb: Limb, body: BodyModel): number {
    if (Limbs.isShoulder(limb)) return ownSide(limb, hasShoulders(body) ? body.Shoulder.Lateral : 0);
    return isThigh(limb) ? ownSide(limb, body.ThighSpot) : 0;
  },

  aimed(limb: Limb, body: BodyModel): number {
    if (Limbs.isShoulder(limb)) return ContactSpot.arriving(limb, body);
    return isThigh(limb) ? ownSide(Limbs.mirror(limb), body.ThighSpot) : 0;
  },

  /** A thigh's sideways aim is placed exactly rather than eased by the correction (S29). */
  aimsExactly: (limb: Limb): boolean => isThigh(limb),
};

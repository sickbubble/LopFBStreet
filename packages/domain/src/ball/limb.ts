import { BallVerb } from './ballVerb.js';

/** Which side of the body a limb is on. Port of `BodySide`. */
export const BodySide = { None: 0, Left: 1, Right: 2 } as const;
export type BodySide = (typeof BodySide)[keyof typeof BodySide];

/** The body part that plays a touch, with its side (S16). Port of `Limb.cs`. */
export const Limb = {
  None: 0,
  LeftFoot: 1,
  RightFoot: 2,
  LeftThigh: 3,
  RightThigh: 4,
  Chest: 5,
  Head: 6,
  /** Shares the chest's level; bounces where the chest holds (S27). */
  LeftShoulder: 7,
  RightShoulder: 8,
} as const;
export type Limb = (typeof Limb)[keyof typeof Limb];

export const limbName = (limb: Limb): string =>
  (['None', 'LeftFoot', 'RightFoot', 'LeftThigh', 'RightThigh', 'Chest', 'Head', 'LeftShoulder', 'RightShoulder'] as const)[
    limb
  ];

/** The lookups between a limb, its level and its side. Port of `Limbs`. */
export const Limbs = {
  /** The carry level this limb plays. The shoulders share the chest's (S27). */
  levelOf(limb: Limb): BallVerb {
    switch (limb) {
      case Limb.LeftThigh:
      case Limb.RightThigh:
        return BallVerb.Thigh;
      case Limb.Chest:
      case Limb.LeftShoulder:
      case Limb.RightShoulder:
        return BallVerb.Chest;
      case Limb.Head:
        return BallVerb.Head;
      default:
        return BallVerb.Foot;
    }
  },

  sideOf(limb: Limb): BodySide {
    switch (limb) {
      case Limb.LeftFoot:
      case Limb.LeftThigh:
      case Limb.LeftShoulder:
        return BodySide.Left;
      case Limb.RightFoot:
      case Limb.RightThigh:
      case Limb.RightShoulder:
        return BodySide.Right;
      default:
        return BodySide.None;
    }
  },

  /** The limb that plays this level on this side. A sided level with no side is the right. */
  for(level: BallVerb, side: BodySide): Limb {
    switch (level) {
      case BallVerb.Chest:
        return side === BodySide.Left ? Limb.LeftShoulder : side === BodySide.Right ? Limb.RightShoulder : Limb.Chest;
      case BallVerb.Head:
        return Limb.Head;
      case BallVerb.Thigh:
        return side === BodySide.Left ? Limb.LeftThigh : Limb.RightThigh;
      default:
        return side === BodySide.Left ? Limb.LeftFoot : Limb.RightFoot;
    }
  },

  mirror(limb: Limb): Limb {
    switch (limb) {
      case Limb.LeftFoot:
        return Limb.RightFoot;
      case Limb.RightFoot:
        return Limb.LeftFoot;
      case Limb.LeftThigh:
        return Limb.RightThigh;
      case Limb.RightThigh:
        return Limb.LeftThigh;
      case Limb.LeftShoulder:
        return Limb.RightShoulder;
      case Limb.RightShoulder:
        return Limb.LeftShoulder;
      default:
        return limb;
    }
  },

  isShoulder: (limb: Limb): boolean => limb === Limb.LeftShoulder || limb === Limb.RightShoulder,

  opposite: (side: BodySide): BodySide =>
    side === BodySide.Left ? BodySide.Right : side === BodySide.Right ? BodySide.Left : BodySide.None,
};

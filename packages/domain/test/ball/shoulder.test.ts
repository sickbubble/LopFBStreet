import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { BounceSolver } from '../../src/ball/bounceSolver.js';
import { TouchKind, type BounceInput, type ContactPlan } from '../../src/ball/contactPlan.js';
import { ContactPlanner } from '../../src/ball/contactPlanner.js';
import { BodySide, Limb, Limbs } from '../../src/ball/limb.js';
import { ContactSpot, Torso } from '../../src/ball/torso.js';
import { STANDING } from '../../src/body/strideClock.js';
import {
  holdOffsetFor,
  NO_SHOULDER,
  NO_TRAP,
  stalls,
  touchHeightFor,
  type BounceSettings,
  type CarryLevels,
} from '../../src/tuning/ballSettings.js';
import { hasShoulders, reachForLimb, type BodyModel } from '../../src/tuning/bodyModel.js';
import { add, scale, vec3, withY, ZERO, type Vec3 } from '../../src/vec.js';

/**
 * The chest holds and the shoulders bounce. docs/IMPLEMENTATION.md S27, as
 * tests: which part of the torso plays the ball, which of them stops it,
 * and where a shouldered ball goes back to. Port of `ShoulderTests.cs`.
 */

const Step = 1 / 120;
const Gravity = 9.81;
const Radius = 0.11;

/** The shipped ladder, with the chest holding (S27) and its apex derived from the shoulder. */
const Levels: CarryLevels = {
  Foot: { TouchHeight: 0.25, HoldOffset: 0.3, Apex: 0.6, SpeedFactor: 0.6, LeadFactor: 1.0, Correction: 0.4, BreakRadius: 0, MicroMotion: 0 },
  Thigh: { TouchHeight: 0.85, HoldOffset: 0.23, Apex: 1.2, SpeedFactor: 0.5, LeadFactor: 0.75, Correction: 0.55, BreakRadius: 0, MicroMotion: 0.04 },
  Chest: { TouchHeight: 1.1, HoldOffset: 0.14, Apex: 1.63, SpeedFactor: 0.4, LeadFactor: 0.5, Correction: 0.75, BreakRadius: 0.25, MicroMotion: 0.03 },
  Head: { TouchHeight: 1.55, HoldOffset: 0.03, Apex: 1.9, SpeedFactor: 0.3, LeadFactor: 0.35, Correction: 0.85, BreakRadius: 0, MicroMotion: 0.02 },
};

const Settings: BounceSettings = {
  BounceMaxApex: 2.0,
  BounceChargeTime: 0.6,
  FlightEase: 0.5,
  TouchLeadPerSpeed: 0.05,
  TouchMaxSpeed: 12,
  KeepUpReach: 1.5,
  BehindReach: 0.2,
  CarryRadius: 0.65,
  StallCoupling: 0.08,
  StallRestore: 6,
  StallDamping: 4,
  Levels,
  Trap: NO_TRAP,
  Shoulder: { TouchHeight: 1.28, HoldOffset: 0.06 },
};

/** The same mannequin as S16's, with S27's shoulders on it. */
const Mannequin: BodyModel = {
  Foot: { Height: 0.74, Lateral: 0.1, Reach: 0.55 },
  Thigh: { Height: 0.74, Lateral: 0.1, Reach: 0.4 },
  Chest: { Height: 1.04, Lateral: 0, Reach: 0.3 },
  Head: { Height: 1.45, Lateral: 0, Reach: 0.25 },
  SideDeadband: 0.05,
  Shoulder: { Height: 1.17, Lateral: 0.14, Reach: 0.26 },
  ShoulderLine: 0.1,
  ThighSpot: 0,
};

/** The same body before S27: no shoulders at all. */
const NoShoulders: BodyModel = { ...Mannequin, Shoulder: { Height: 0, Lateral: 0, Reach: 0 }, ShoulderLine: 0 };

/** Godot forward is -Z; the owner's right is then +X. */
const Forward: Vec3 = vec3(0, 0, -1);

const Down: Vec3 = vec3(0, -2.5, 0);

const At = (height: number, ahead: number, right = 0): Vec3 => vec3(right, height, -ahead);

function Input(ballPosition: Vec3, ballVelocity: Vec3 | null = null, body: BodyModel | null = null, ownerIntent: Vec3 = ZERO): BounceInput {
  return {
    BallPosition: ballPosition,
    BallVelocity: ballVelocity ?? Down,
    HasOwner: true,
    OwnerPosition: ZERO,
    OwnerVelocity: ownerIntent,
    OwnerIntent: ownerIntent,
    OwnerFacing: Forward,
    OwnerRise: 0,
    OwnerStride: STANDING,
    OwnerBody: body ?? Mannequin,
    IsGrounded: false,
    BallRadius: Radius,
    Step,
    EffectiveGravity: Gravity,
  };
}

const Plan = (input: BounceInput, kind: TouchKind = TouchKind.KeepUp): ContactPlan =>
  ContactPlanner.plan(input, BallVerb.Chest, false, Limb.None, kind, Settings);

/**
 * Drops a ball straight down onto the torso from clear above it and runs
 * the solver until it does something. The plan, the surface height and the
 * hold are all the solver's own, so this is the real path.
 */
function DropOntoTheTorso(right: number): { solver: BounceSolver; velocity: Vec3 } {
  const solver = new BounceSolver();
  solver.onPickedUp(1.5, Settings, true);

  let position = At(1.5, 0.1, right);
  let velocity = vec3(0, -0.2, 0);
  let result: Vec3 = ZERO;

  for (let i = 0; i < 400 && !solver.stuck && solver.touches === 0; i++) {
    result = solver.solve(Input(position, velocity), Settings);
    velocity = withY(result, result.y - Gravity * Step);
    position = add(position, scale(velocity, Step));
  }

  return { solver, velocity: result };
}

describe('Shoulder', () => {
  // --- Which part of the torso --------------------------------------------------------------

  it('a torso ball down the middle is chested and one out to the side is shouldered', () => {
    const middle = Plan(Input(At(1.6, 0.14, 0)));
    const right = Plan(Input(At(1.6, 0.06, 0.2)));
    const left = Plan(Input(At(1.6, 0.06, -0.2)));

    expect(middle.Limb).toBe(Limb.Chest);
    expect(right.Limb).toBe(Limb.RightShoulder);
    expect(left.Limb).toBe(Limb.LeftShoulder);
  });

  it('a ball just off the centreline is still the chests', () => {
    const plan = Plan(Input(At(1.6, 0.12, 0.06)));

    expect(plan.Limb).toBe(Limb.Chest);
  });

  it('a shouldered ball is carried at the chests level', () => {
    const plan = Plan(Input(At(1.6, 0.06, 0.2)));

    expect(plan.Level).toBe(BallVerb.Chest);
    expect(Limbs.levelOf(plan.Limb)).toBe(BallVerb.Chest);
  });

  it('a shouldered contact happens at the shoulders height not the chests', () => {
    const plan = Plan(Input(At(1.6, 0.06, 0.2)));

    expect(plan.Limb).toBe(Limb.RightShoulder);
    expect(plan.Point.y).toBeCloseTo(Settings.Shoulder.TouchHeight, 3);
  });

  it('a ball already below the shoulders is the chests', () => {
    const plan = Plan(Input(At(1.2, 0.06, 0.2)));

    expect(plan.Limb).toBe(Limb.Chest);
  });

  it('a body with no shoulders chests everything', () => {
    const plan = Plan(Input(At(1.6, 0.06, 0.2), null, NoShoulders));

    expect(plan.Limb).toBe(Limb.Chest);
  });

  it('a ball past the shoulders reach is a miss', () => {
    const plan = Plan(Input(At(1.6, 0.06, 0.9)));

    expect(plan.Limb).toBe(Limb.RightShoulder);
    expect(plan.Reachable).toBe(false);
  });

  // --- The chest holds, the shoulders do not ------------------------------------------------

  it('the chest holds a ball its shoulders do not', () => {
    const chest = Levels.Chest;

    expect(stalls(chest)).toBe(true);
    expect(Torso.holds(Limb.Chest, chest)).toBe(true);
    expect(Torso.holds(Limb.LeftShoulder, chest)).toBe(false);
    expect(Torso.holds(Limb.RightShoulder, chest)).toBe(false);
  });

  it('nothing holds a ball at a level that does not stall', () => {
    expect(Torso.holds(Limb.Chest, Levels.Foot)).toBe(false);
    expect(Torso.holds(Limb.LeftFoot, Levels.Foot)).toBe(false);
  });

  it('a shoulder is planned as a keep up even when its level stalls', () => {
    const chest = Plan(Input(At(1.6, 0.14, 0)), TouchKind.Stall);
    const shoulder = Plan(Input(At(1.6, 0.06, 0.2)), TouchKind.Stall);

    expect(chest.Kind).toBe(TouchKind.Stall);
    expect(shoulder.Kind).toBe(TouchKind.KeepUp);
  });

  // --- Where a shouldered ball goes back to -------------------------------------------------

  it('a shoulder sends the ball back out to its own side', () => {
    const middle = Input(At(1.28, 0.06, 0));

    const rightShoulder = BounceSolver.touchVelocity(0.35, Down, middle, Settings, Levels.Chest, Limb.RightShoulder);
    const leftShoulder = BounceSolver.touchVelocity(0.35, Down, middle, Settings, Levels.Chest, Limb.LeftShoulder);
    const chest = BounceSolver.touchVelocity(0.35, Down, middle, Settings, Levels.Chest, Limb.Chest);

    // A right-shoulder touch sends the ball back out to the right, a left one to the left.
    expect(rightShoulder.x).toBeGreaterThan(0);
    expect(leftShoulder.x).toBeLessThan(0);
    expect(chest.x).toBeCloseTo(0, 4);
  });

  it('a ball already on the shoulder is kept there', () => {
    const velocity = BounceSolver.touchVelocity(
      0.35,
      Down,
      Input(At(1.28, 0.06, 0.14)),
      Settings,
      Levels.Chest,
      Limb.RightShoulder,
    );

    expect(velocity.x).toBeCloseTo(0, 4);
    expect(velocity.z).toBeCloseTo(0, 4);
  });

  it('a shouldered ball comes back down to the same shoulder', () => {
    const onTheSpot = Input(At(1.28, 0.06, 0.14));
    const velocity = BounceSolver.touchVelocity(0.35, Down, onTheSpot, Settings, Levels.Chest, Limb.RightShoulder);

    // Just past the top of that flight, on the way back down.
    const apex = Ballistics.positionAfter(onTheSpot.BallPosition, velocity, Gravity, velocity.y / Gravity);
    const next = Plan(Input(apex, vec3(velocity.x, -0.01, velocity.z)));

    expect(next.Limb).toBe(Limb.RightShoulder);
  });

  it('the chests own spot is on the centreline', () => {
    expect(ContactSpot.aimed(Limb.Chest, Mannequin)).toBeCloseTo(0, 5);
    expect(ContactSpot.aimed(Limb.RightFoot, Mannequin)).toBeCloseTo(0, 5);
    expect(ContactSpot.aimed(Limb.RightShoulder, Mannequin)).toBeCloseTo(0.14, 4);
    expect(ContactSpot.aimed(Limb.LeftShoulder, Mannequin)).toBeCloseTo(-0.14, 4);
  });

  it('a body with no shoulders has no lateral spot', () => {
    expect(ContactSpot.aimed(Limb.RightShoulder, NoShoulders)).toBeCloseTo(0, 5);
  });

  it('a shoulder keeps its own hold offset and touch height', () => {
    expect(holdOffsetFor(Settings, Limb.RightShoulder)).toBeCloseTo(0.06, 4);
    expect(holdOffsetFor(Settings, Limb.Chest)).toBeCloseTo(0.14, 4);
    expect(touchHeightFor(Settings, Limb.LeftShoulder)).toBeCloseTo(1.28, 4);
    expect(touchHeightFor(Settings, Limb.Chest)).toBeCloseTo(1.1, 4);
  });

  it('without shoulders configured a shoulder reads the chests numbers', () => {
    const plain: BounceSettings = { ...Settings, Shoulder: NO_SHOULDER };

    expect(holdOffsetFor(plain, Limb.RightShoulder)).toBeCloseTo(plain.Levels.Chest.HoldOffset, 4);
    expect(touchHeightFor(plain, Limb.RightShoulder)).toBeCloseTo(plain.Levels.Chest.TouchHeight, 4);
  });

  // --- Played out, through the solver ------------------------------------------------------

  it('a ball onto the chest sticks there', () => {
    const { solver } = DropOntoTheTorso(0);

    // The chest holds the ball.
    expect(solver.stuck).toBe(true);
    expect(solver.lastTouch).toBe(TouchKind.Stall);
    expect(solver.lastLimb).toBe(Limb.Chest);
  });

  it('the same ball onto a shoulder bounces', () => {
    const { solver, velocity } = DropOntoTheTorso(0.14);

    // A shoulder never holds the ball.
    expect(solver.stuck).toBe(false);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(solver.lastLimb).toBe(Limb.RightShoulder);
    // It goes back up.
    expect(velocity.y).toBeGreaterThan(0);
  });

  it('the shoulder touch fires at the shoulders height', () => {
    const { solver } = DropOntoTheTorso(0.14);

    expect(solver.touches).toBe(1);
    expect(solver.targetApex).toBeCloseTo(Levels.Chest.Apex, 3);
  });

  // --- The vocabulary -----------------------------------------------------------------------

  it('the shoulders are sided limbs on the chests level', () => {
    expect(Limbs.sideOf(Limb.LeftShoulder)).toBe(BodySide.Left);
    expect(Limbs.sideOf(Limb.RightShoulder)).toBe(BodySide.Right);
    expect(Limbs.mirror(Limb.RightShoulder)).toBe(Limb.LeftShoulder);
    expect(Limbs.mirror(Limb.LeftShoulder)).toBe(Limb.RightShoulder);
    expect(Limbs.levelOf(Limb.LeftShoulder)).toBe(BallVerb.Chest);
    expect(Limbs.isShoulder(Limb.LeftShoulder)).toBe(true);
    expect(Limbs.isShoulder(Limb.Chest)).toBe(false);
  });

  it('the chests level is played by the chest or by a shoulder', () => {
    expect(Limbs.for(BallVerb.Chest, BodySide.None)).toBe(Limb.Chest);
    expect(Limbs.for(BallVerb.Chest, BodySide.Left)).toBe(Limb.LeftShoulder);
    expect(Limbs.for(BallVerb.Chest, BodySide.Right)).toBe(Limb.RightShoulder);
  });

  it('a shoulder reads its own anchor', () => {
    expect(reachForLimb(Mannequin, Limb.RightShoulder)).toEqual(Mannequin.Shoulder);
    expect(reachForLimb(Mannequin, Limb.Chest)).toEqual(Mannequin.Chest);
    expect(hasShoulders(Mannequin)).toBe(true);
    expect(hasShoulders(NoShoulders)).toBe(false);
  });

  it.each([
    [0, Limb.Chest],
    [0.09, Limb.Chest],
    [-0.09, Limb.Chest],
    [0.11, Limb.RightShoulder],
    [-0.11, Limb.LeftShoulder],
  ] as const)('the line divides the chest from the shoulders (lateral %s)', (lateral, expected) => {
    expect(Torso.partFor(lateral, 0.1)).toBe(expected);
  });

  it('a line of zero leaves everything to the chest', () => {
    expect(Torso.partFor(2, 0)).toBe(Limb.Chest);
  });
});

import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { BounceSolver } from '../../src/ball/bounceSolver.js';
import { TouchKind, type BounceInput } from '../../src/ball/contactPlan.js';
import { ContactPlanner } from '../../src/ball/contactPlanner.js';
import { Limb } from '../../src/ball/limb.js';
import { STANDING } from '../../src/body/strideClock.js';
import { NO_SHOULDER, NO_TRAP, type BallSettings, type BounceSettings, type CarryLevels } from '../../src/tuning/ballSettings.js';
import { CarryLevelCheck } from '../../src/tuning/carryLevelCheck.js';
import type { BodyModel } from '../../src/tuning/bodyModel.js';
import { vec3, ZERO, type Vec3 } from '../../src/vec.js';
import { expectVec } from '../support/carrySim.js';
import { TEST_BANDS, TEST_LAUNCH } from '../support/passFixtures.js';

/**
 * S17: the foot keeps the ball up off the instep, not the ground, and a
 * ball on the ground is lifted, not lost. The shipped foot -- touch height
 * 0.25 m, apex 0.60 m -- as tests. Port of `InstepTests.cs`.
 */

const Step = 1 / 120;
const Gravity = 9.81;
const Radius = 0.11;

const Levels: CarryLevels = {
  Foot: { TouchHeight: 0.25, HoldOffset: 0.3, Apex: 0.6, SpeedFactor: 0.6, LeadFactor: 1.0, Correction: 0.4, BreakRadius: 0, MicroMotion: 0 },
  Thigh: { TouchHeight: 0.55, HoldOffset: 0.23, Apex: 0.9, SpeedFactor: 0.5, LeadFactor: 0.75, Correction: 0.55, BreakRadius: 0.35, MicroMotion: 0.04 },
  Chest: { TouchHeight: 1.05, HoldOffset: 0.18, Apex: 1.4, SpeedFactor: 0.4, LeadFactor: 0.5, Correction: 0.75, BreakRadius: 0.25, MicroMotion: 0.03 },
  Head: { TouchHeight: 1.55, HoldOffset: 0.08, Apex: 1.9, SpeedFactor: 0.3, LeadFactor: 0.35, Correction: 0.85, BreakRadius: 0.15, MicroMotion: 0.02 },
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
  Shoulder: NO_SHOULDER,
};

const Mannequin: BodyModel = {
  Foot: { Height: 0.74, Lateral: 0.1, Reach: 0.55 },
  Thigh: { Height: 0.74, Lateral: 0.1, Reach: 0.4 },
  Chest: { Height: 1.04, Lateral: 0, Reach: 0.3 },
  Head: { Height: 1.45, Lateral: 0, Reach: 0.25 },
  SideDeadband: 0.05,
  Shoulder: { Height: 0, Lateral: 0, Reach: 0 },
  ShoulderLine: 0,
  ThighSpot: 0,
};

const Forward: Vec3 = vec3(0, 0, -1);
const Down: Vec3 = vec3(0, -2.5, 0);

const At = (height: number, ahead = 0.3): Vec3 => vec3(0, height, -ahead);

const Input = (ballPosition: Vec3, ballVelocity: Vec3 | null = null, grounded = false): BounceInput => ({
  BallPosition: ballPosition,
  BallVelocity: ballVelocity ?? Down,
  HasOwner: true,
  OwnerPosition: ZERO,
  OwnerVelocity: ZERO,
  OwnerIntent: ZERO,
  OwnerFacing: Forward,
  OwnerRise: 0,
  OwnerStride: STANDING,
  OwnerBody: Mannequin,
  IsGrounded: grounded,
  BallRadius: Radius,
  Step,
  EffectiveGravity: Gravity,
});

function Picked(height: number): BounceSolver {
  const solver = new BounceSolver();
  solver.onPickedUp(height, Settings, true);
  return solver;
}

const RiseSpeed = (rise: number): number => Ballistics.verticalSpeedForApex(rise, Gravity);

describe('Instep', () => {
  it('the foot keeps the ball up off the instep not the ground', () => {
    const solver = Picked(0.4);
    expect(solver.level).toBe(BallVerb.Foot);

    const result = solver.solve(Input(At(0.25)), Settings);

    expect(solver.touches).toBe(1);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(result.y).toBeCloseTo(RiseSpeed(0.6 - 0.25), 4);
    expect(solver.lastLimb).toBe(Limb.RightFoot);
  });

  it('above the instep nothing fires', () => {
    const solver = Picked(0.4);

    const result = solver.solve(Input(At(0.4)), Settings);

    expectVec(result, Down);
    expect(solver.touches).toBe(0);
  });

  it('a missed ball on the ground is scooped back up', () => {
    const solver = Picked(0.4);
    solver.solve(Input(At(0.25, 1.5)), Settings);
    expect(solver.touches).toBe(0);
    expect(solver.inReach).toBe(false);

    const result = solver.solve(Input(At(Radius, 0.3), ZERO, true), Settings);

    expect(solver.touches).toBe(1);
    expect(solver.lastTouch).toBe(TouchKind.Scoop);
    expect(result.y).toBeCloseTo(RiseSpeed(0.6 - Radius), 4);
  });

  it('a chest ball that reaches the ground is scooped as a foot ball', () => {
    const solver = Picked(1.2);

    solver.solve(Input(At(Radius), ZERO, true), Settings);

    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.lastTouch).toBe(TouchKind.Scoop);
  });

  it('a scoop fires once', () => {
    const solver = Picked(0.4);
    const sent = solver.solve(Input(At(Radius), ZERO, true), Settings);
    expect(solver.touches).toBe(1);

    solver.solve(Input(At(Radius), sent, true), Settings);

    expect(solver.touches).toBe(1);
  });

  it('a drop to the feet is met by the instep before the floor', () => {
    const solver = Picked(1.2);
    solver.requestBounce(0.6);
    solver.solve(Input(At(1.05)), Settings);
    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.lastTouch).toBe(TouchKind.Drop);

    solver.solve(Input(At(0.5)), Settings);
    expect(solver.touches).toBe(1);

    const result = solver.solve(Input(At(0.25)), Settings);

    expect(solver.touches).toBe(2);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    // The instep sent it back up.
    expect(result.y).toBeGreaterThan(0);
  });

  it('the plan names the instep crossing and the scoop', () => {
    const falling = Input(At(0.6));
    const resting = Input(At(Radius), ZERO, true);

    const inFlight = ContactPlanner.plan(falling, BallVerb.Foot, false, Limb.None, TouchKind.KeepUp, Settings);
    const onFloor = ContactPlanner.plan(resting, BallVerb.Foot, false, Limb.None, TouchKind.KeepUp, Settings);

    expect(inFlight.Point.y).toBeCloseTo(0.25, 4);
    expect(inFlight.TimeToContact).toBeGreaterThan(0);
    expect(inFlight.Kind).toBe(TouchKind.KeepUp);

    expect(onFloor.Kind).toBe(TouchKind.Scoop);
    expect(onFloor.TimeToContact).toBe(0);
  });

  it('foot touch height zero is the ground again', () => {
    const ground: BounceSettings = {
      ...Settings,
      Levels: { ...Levels, Foot: { ...Levels.Foot, TouchHeight: 0, Apex: 0.4 } },
    };
    const solver = new BounceSolver();
    solver.onPickedUp(Radius, ground, true);

    solver.solve(Input(At(0.25)), ground);
    expect(solver.touches).toBe(0);

    solver.solve(Input(At(Radius), ZERO, true), ground);

    expect(solver.touches).toBe(1);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
  });

  /** The S8 chain, re-derived for the foot: the shipped foot passes every boot check. */
  it('the shipped foot is coherent', () => {
    const settings: BallSettings = {
      Body: { Radius, Mass: 0.43, GravityScale: 1, LinearDamp: 0.1, AngularDamp: 0.1, Bounce: 0.6, Friction: 0.8 },
      Possession: { Radius: 2.5, OwnershipMargin: 0.3, OwnershipDwell: 0.15, TouchCooldown: 0.3 },
      Bounce: Settings,
      Carry: { SlowTime: 0.6, RecoverTime: 0.15 },
      Launch: { ...TEST_LAUNCH, LaunchSpin: 8 },
      Reception: { CatchSpeed: 9, RicochetRestitution: 0.4, CatchWindow: 0.12 },
      Bands: TEST_BANDS,
    };

    expect(CarryLevelCheck.problems(settings, 0.07)).toEqual([]);
  });

  it.each([
    [0.25, true],
    [0, true],
    [0.05, false],
    [0.11, false],
  ])('the foot touch is the instep or the ground (%f m -> %s)', (touchHeight, sound) => {
    expect(CarryLevelCheck.footTouchIsTheInstepOrTheGround(touchHeight, Radius)).toBe(sound);
  });
});

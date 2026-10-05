import { describe, expect, it } from 'vitest';
import {
  add,
  BounceSolver,
  NO_SHOULDER,
  NO_TRAP,
  STANDING,
  ZERO,
  type BodyModel,
  type BounceInput,
  type BounceSettings,
  type CarryLevels,
  type Vec3,
} from '../../src/index.js';
import { expectVec } from '../support/carrySim.js';

/**
 * The regression the Godot build's M1 names: a shove from the hose that lands
 * on the same tick as a touch used to be thrown away, because a touch sets the
 * whole velocity. The jet then worked except on exactly the ticks a keep-up
 * fired, which reads as an unreliable hazard rather than as a bug. Port of
 * `Ball/SweeperPushTests.cs`; it exercises `BounceInput.ExternalPush` only.
 */

const STEP = 1 / 120;
const GRAVITY = 9.81;
const RADIUS = 0.11;

const LEVELS: CarryLevels = {
  Foot: { TouchHeight: 0, HoldOffset: 0.6, Apex: 0.4, SpeedFactor: 0.6, LeadFactor: 1.0, Correction: 0.4, BreakRadius: 0, MicroMotion: 0 },
  Thigh: { TouchHeight: 0.55, HoldOffset: 0.6, Apex: 0.9, SpeedFactor: 0.5, LeadFactor: 0.75, Correction: 0.55, BreakRadius: 0.35, MicroMotion: 0.04 },
  Chest: { TouchHeight: 1.05, HoldOffset: 0.6, Apex: 1.4, SpeedFactor: 0.4, LeadFactor: 0.5, Correction: 0.75, BreakRadius: 0.25, MicroMotion: 0.03 },
  Head: { TouchHeight: 1.55, HoldOffset: 0.6, Apex: 1.9, SpeedFactor: 0.3, LeadFactor: 0.35, Correction: 0.85, BreakRadius: 0.15, MicroMotion: 0.02 },
};

const SETTINGS: BounceSettings = {
  BounceMaxApex: 2.0,
  BounceChargeTime: 0.6,
  FlightEase: 0.5,
  TouchLeadPerSpeed: 0.05,
  TouchMaxSpeed: 12,
  KeepUpReach: 1.5,
  BehindReach: 0.35,
  CarryRadius: 0.65,
  StallCoupling: 0.08,
  StallRestore: 6,
  StallDamping: 4,
  Levels: LEVELS,
  Trap: NO_TRAP,
  Shoulder: NO_SHOULDER,
};

const BODY: BodyModel = {
  Foot: { Height: 0.74, Lateral: 0.1, Reach: 1.2 },
  Thigh: { Height: 0.74, Lateral: 0.1, Reach: 1.2 },
  Chest: { Height: 1.04, Lateral: 0, Reach: 1.2 },
  Head: { Height: 1.45, Lateral: 0, Reach: 1.2 },
  SideDeadband: 0.05,
  Shoulder: { Height: 0, Lateral: 0, Reach: 0 },
  ShoulderLine: 0,
  ThighSpot: 0,
};

const FORWARD: Vec3 = { x: 0, y: 0, z: -1 };

/** A shove across the lane, the size the hose gives at rest. */
const JET: Vec3 = { x: 3, y: 0, z: 0 };

function input(ballVelocity: Vec3, ballPosition: Vec3, grounded: boolean, push: Vec3 = ZERO): BounceInput {
  return {
    BallPosition: ballPosition,
    BallVelocity: ballVelocity,
    HasOwner: true,
    OwnerPosition: ZERO,
    OwnerVelocity: ZERO,
    OwnerIntent: ZERO,
    OwnerFacing: FORWARD,
    OwnerRise: 0,
    OwnerStride: STANDING,
    OwnerBody: BODY,
    IsGrounded: grounded,
    BallRadius: RADIUS,
    Step: STEP,
    EffectiveGravity: GRAVITY,
    ExternalPush: push,
  };
}

/** A ball on the foot's hold point, descending onto the touch. */
const ON_THE_TOUCH: Vec3 = { x: 0, y: RADIUS, z: -0.6 };

describe('an external push', () => {
  it('with no push the solver is exactly as it was', () => {
    const withoutField = new BounceSolver();
    const withZero = new BounceSolver();

    const { ExternalPush: _omitted, ...bare } = input({ x: 0, y: -2.5, z: 0 }, ON_THE_TOUCH, true);
    const a = withoutField.solve(bare, SETTINGS);
    const b = withZero.solve(input({ x: 0, y: -2.5, z: 0 }, ON_THE_TOUCH, true, ZERO), SETTINGS);

    expectVec(b, a);
  });

  /** The regression itself. */
  it('a push on the same tick as a touch survives the touch', () => {
    const quiet = new BounceSolver();
    const shoved = new BounceSolver();

    const touching = input({ x: 0, y: -2.5, z: 0 }, ON_THE_TOUCH, true);

    const untouched = quiet.solve(touching, SETTINGS);
    const pushed = shoved.solve({ ...touching, ExternalPush: JET }, SETTINGS);

    // The touch fired in both cases: the ball leaves upward.
    expect(untouched.y > 0, 'the fixture must actually produce a touch').toBe(true);

    expectVec(pushed, add(untouched, JET));
  });

  it('a push on a tick with no touch still lands', () => {
    const solver = new BounceSolver();

    // Mid-flight, well above the touch height and rising.
    const flying = input({ x: 0, y: 2, z: 0 }, { x: 0, y: 1.2, z: -0.6 }, false);

    const quiet = new BounceSolver().solve(flying, SETTINGS);
    const pushed = solver.solve({ ...flying, ExternalPush: JET }, SETTINGS);

    expectVec(pushed, add(quiet, JET));
  });

  /**
   * The plan published after the step is for the ball as it actually leaves,
   * so the next contact is planned against the pushed ball.
   */
  it('the next contact is planned for where the push sends the ball', () => {
    const quiet = new BounceSolver();
    const shoved = new BounceSolver();

    const touching = input({ x: 0, y: -2.5, z: 0 }, ON_THE_TOUCH, true);

    quiet.solve(touching, SETTINGS);
    shoved.solve({ ...touching, ExternalPush: JET }, SETTINGS);

    // A shove of 3 m/s across the lane cannot leave the planned contact point where it was.
    expect(shoved.plan.Point.x).not.toBeCloseTo(quiet.plan.Point.x, 3);
  });

  it('a push adds to a held ball too', () => {
    const solver = new BounceSolver();

    // A chest hold: the ball cushioned onto the body.
    const held = input({ x: 0, y: -0.2, z: 0 }, { x: 0, y: 1.05, z: -0.6 }, false);

    const quiet = new BounceSolver().solve(held, SETTINGS);
    const pushed = solver.solve({ ...held, ExternalPush: JET }, SETTINGS);

    expectVec(pushed, add(quiet, JET));
  });
});

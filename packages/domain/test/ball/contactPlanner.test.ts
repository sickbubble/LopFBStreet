import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { BounceSolver } from '../../src/ball/bounceSolver.js';
import { planExists, planSide, TouchKind, type BounceInput, type ContactPlan } from '../../src/ball/contactPlan.js';
import { ContactPlanner } from '../../src/ball/contactPlanner.js';
import { LandingPredictor } from '../../src/ball/landingPredictor.js';
import { BodySide, Limb, Limbs } from '../../src/ball/limb.js';
import { STANDING } from '../../src/body/strideClock.js';
import type { FollowSettings } from '../../src/player/followRule.js';
import { NO_SHOULDER, NO_TRAP, type BounceSettings, type CarryLevels } from '../../src/tuning/ballSettings.js';
import type { BodyModel } from '../../src/tuning/bodyModel.js';
import { DEFAULT_PASS_PROFILES } from '../../src/tuning/passProfiles.js';
import { vec3, ZERO, type Vec3 } from '../../src/vec.js';

/**
 * The contact plan: which limb plays the ball, when, where, and whether it
 * can. docs/IMPLEMENTATION.md S16, as tests. Port of `ContactPlannerTests.cs`.
 */

const Step = 1 / 120;
const Gravity = 9.81;
const Radius = 0.11;

/** The shipped ladder's shape: the foot on the ground, the rest in the air. */
const Levels: CarryLevels = {
  Foot: { TouchHeight: 0, HoldOffset: 0.3, Apex: 0.4, SpeedFactor: 0.6, LeadFactor: 1.0, Correction: 0.4, BreakRadius: 0, MicroMotion: 0 },
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

/**
 * The mannequin, as S16 derives it: hips 0.74 m up and 0.10 m off the
 * centreline; the instep 0.55 m from the hip at the ground, the raised
 * thigh 0.40 m, a chest lean 0.30 m, a head tilt 0.25 m.
 */
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

/** Godot forward is -Z; the owner's right is then +X. */
const Forward: Vec3 = vec3(0, 0, -1);

const Down: Vec3 = vec3(0, -2.5, 0);

/** A ball at a height above the feet, some way ahead and some way to the owner's right. */
const At = (height: number, ahead: number, right = 0): Vec3 => vec3(right, height, -ahead);

interface InputOptions {
  ballVelocity?: Vec3;
  grounded?: boolean;
  ownerFacing?: Vec3;
  ownerIntent?: Vec3;
  body?: BodyModel;
  ownerRise?: number;
}

function Input(ballPosition: Vec3, o: InputOptions = {}): BounceInput {
  const intent = o.ownerIntent ?? ZERO;
  return {
    BallPosition: ballPosition,
    BallVelocity: o.ballVelocity ?? Down,
    HasOwner: true,
    OwnerPosition: ZERO,
    OwnerVelocity: intent,
    OwnerIntent: intent,
    OwnerFacing: o.ownerFacing ?? Forward,
    OwnerRise: o.ownerRise ?? 0,
    OwnerStride: STANDING,
    OwnerBody: o.body ?? Mannequin,
    IsGrounded: o.grounded ?? false,
    BallRadius: Radius,
    Step,
    EffectiveGravity: Gravity,
  };
}

const Plan = (input: BounceInput, level: BallVerb, last: Limb = Limb.None, held = false): ContactPlan =>
  ContactPlanner.plan(input, level, held, last, TouchKind.KeepUp, Settings);

function Picked(height: number): BounceSolver {
  const solver = new BounceSolver();
  solver.onPickedUp(height, Settings, true);
  return solver;
}

const Committed = (input: BounceInput, level: BallVerb, committed: Limb, last: Limb = Limb.None): ContactPlan =>
  ContactPlanner.plan(input, level, false, last, TouchKind.KeepUp, Settings, true, committed);

const Follow: FollowSettings = { TopSpeed: 8, MinTime: 0.05, AimSpeed: 0.5, TrapAssist: 0 };

describe('ContactPlanner', () => {
  // --- Which side ---------------------------------------------------------------------------

  it('a ball coming down left of the body is played by the left foot', () => {
    const left = Plan(Input(At(0.3, 0.3, -0.15)), BallVerb.Foot);
    const right = Plan(Input(At(0.3, 0.3, 0.15)), BallVerb.Foot);

    expect(left.Limb).toBe(Limb.LeftFoot);
    expect(right.Limb).toBe(Limb.RightFoot);
    expect(left.Reachable && right.Reachable).toBe(true);
  });

  it('the side turns with the owner', () => {
    const ball = vec3(0.3, 0.3, -0.15);

    const facingForward = Plan(Input(ball), BallVerb.Foot);
    const facingRight = Plan(Input(ball, { ownerFacing: vec3(1, 0, 0) }), BallVerb.Foot);

    expect(facingForward.Limb).toBe(Limb.RightFoot);
    expect(facingRight.Limb).toBe(Limb.LeftFoot);
  });

  it('standing keep ups down the middle alternate feet', () => {
    const middle = Input(At(0.3, 0.3));

    expect(Plan(middle, BallVerb.Foot).Limb).toBe(Limb.RightFoot);
    expect(Plan(middle, BallVerb.Foot, Limb.RightFoot).Limb).toBe(Limb.LeftFoot);
    expect(Plan(middle, BallVerb.Foot, Limb.LeftFoot).Limb).toBe(Limb.RightFoot);
  });

  // --- Commitment (2026-09-23) ---------------------------------------------------------------

  it('a committed limb keeps a ball that drifts across the line', () => {
    const drifted = Input(At(0.3, 0.3, -0.08));

    expect(Plan(drifted, BallVerb.Foot).Limb).toBe(Limb.LeftFoot);
    expect(Committed(drifted, BallVerb.Foot, Limb.RightFoot).Limb).toBe(Limb.RightFoot);
    expect(Committed(drifted, BallVerb.Foot, Limb.RightFoot).Reachable).toBe(true);
  });

  it('a committed limb that cannot reach lets the ball go', () => {
    const farLeft = Input(At(0.3, 0.2, -0.55));

    expect(Committed(farLeft, BallVerb.Foot, Limb.RightFoot).Limb).toBe(Limb.LeftFoot);
  });

  it('a limb of another level commits nothing', () => {
    const drifted = Input(At(0.3, 0.3, -0.08));

    expect(Committed(drifted, BallVerb.Foot, Limb.RightThigh).Limb).toBe(Limb.LeftFoot);
  });

  it('the solver alternates feet touch by touch', () => {
    const solver = Picked(Radius);
    const grounded = Input(At(Radius, 0.3), { grounded: true });

    solver.solve(grounded, Settings);
    const first = solver.lastLimb;
    solver.solve(Input(At(0.3, 0.3), { ballVelocity: vec3(0, 1, 0) }), Settings);
    solver.solve(grounded, Settings);
    const second = solver.lastLimb;
    solver.solve(Input(At(0.3, 0.3), { ballVelocity: vec3(0, 1, 0) }), Settings);
    solver.solve(grounded, Settings);
    const third = solver.lastLimb;

    expect(first).toBe(Limb.RightFoot);
    expect(second).toBe(Limb.LeftFoot);
    expect(third).toBe(Limb.RightFoot);
    expect(solver.touches).toBe(3);
  });

  it('chest and head have no side', () => {
    const chest = Plan(Input(At(1.2, 0.18, 0.2)), BallVerb.Chest);
    const head = Plan(Input(At(1.7, 0.08, -0.2)), BallVerb.Head);

    expect(chest.Limb).toBe(Limb.Chest);
    expect(head.Limb).toBe(Limb.Head);
    expect(planSide(chest)).toBe(BodySide.None);
    expect(planSide(head)).toBe(BodySide.None);
  });

  // --- Reach ----------------------------------------------------------------------------------

  it('a ball beyond the leg is a miss not a stretch', () => {
    const plan = Plan(Input(At(0.3, 0.9)), BallVerb.Foot);

    expect(plan.Limb).toBe(Limb.RightFoot);
    expect(plan.Reachable).toBe(false);
    expect(planExists(plan)).toBe(true);
  });

  it('reach is a circle around the limbs anchor', () => {
    // Right foot: hip at x 0.10. A ball 0.5 m ahead on the centreline is
    // sqrt(0.5^2 + 0.1^2) = 0.51 from it -- in. One 0.55 m ahead is 0.56 -- out.
    expect(Plan(Input(At(0.3, 0.5)), BallVerb.Foot).Reachable).toBe(true);
    expect(Plan(Input(At(0.3, 0.55)), BallVerb.Foot).Reachable).toBe(false);
  });

  it('a ball the preferred foot cannot reach is taken by the other', () => {
    // 0.535 m ahead, 0.04 m right: inside the deadband, and the last
    // touch was the right's, so the left is preferred. From the left hip
    // (x -0.10) it is sqrt(0.535^2 + 0.14^2) = 0.553 -- out of 0.55. From
    // the right hip (x 0.10) it is sqrt(0.535^2 + 0.06^2) = 0.538 -- in.
    const plan = Plan(Input(At(0.3, 0.535, 0.04)), BallVerb.Foot, Limb.RightFoot);

    expect(plan.Limb).toBe(Limb.RightFoot);
    expect(plan.Reachable).toBe(true);
  });

  it('a ball behind the body has no plan', () => {
    const plan = Plan(Input(At(0.3, -0.4)), BallVerb.Foot);

    expect(plan.Reachable).toBe(false);
  });

  it('a ball a little behind is still the foots', () => {
    const plan = Plan(Input(At(Radius, -0.15), { grounded: true }), BallVerb.Foot);

    expect(plan.Reachable).toBe(true);
  });

  it('each limb has its own reach', () => {
    expect(Plan(Input(At(0.3, 0.45)), BallVerb.Foot).Reachable).toBe(true);
    expect(Plan(Input(At(1.2, 0.45)), BallVerb.Chest).Reachable).toBe(false);
    expect(Plan(Input(At(1.2, 0.25)), BallVerb.Chest).Reachable).toBe(true);
  });

  // --- When and where ------------------------------------------------------------------------

  it('the plan knows when and where before the touch fires', () => {
    // From 1.05 m, up at the speed that reaches the chest apex, drifting
    // forward at 0.5 m/s.
    const vy = Ballistics.verticalSpeedForApex(1.4 - 1.05, Gravity);
    const velocity = vec3(0, vy, -0.5);
    const input = Input(At(1.05, 0.18), { ballVelocity: velocity });

    const plan = Plan(input, BallVerb.Chest);

    const flight = Ballistics.timeToReturn(vy, Gravity);
    expect(plan.TimeToContact).toBeCloseTo(flight, 4);
    expect(plan.Point.y).toBeCloseTo(1.05, 4);
    expect(plan.Point.z).toBeCloseTo(-(0.18 + 0.5 * flight), 4);
    expect(plan.Limb).toBe(Limb.Chest);
    expect(plan.Kind).toBe(TouchKind.KeepUp);
  });

  it('the floor is always a foot contact now', () => {
    const plan = Plan(Input(At(Radius, 0.3), { grounded: true }), BallVerb.Chest);

    expect(plan.Level).toBe(BallVerb.Foot);
    expect(plan.Limb).toBe(Limb.RightFoot);
    expect(plan.TimeToContact).toBe(0);
  });

  it('a ball that will not get back up to its level is planned at the ground', () => {
    const input = Input(At(0.6, 0.3), { ballVelocity: vec3(0, -3, -0.4) });

    const plan = Plan(input, BallVerb.Chest);
    const landing = LandingPredictor.predict(input.BallPosition, input.BallVelocity, Gravity, 0, Radius);

    expect(plan.Level).toBe(BallVerb.Foot);
    expect(plan.TimeToContact).toBeCloseTo(landing.TimeToLand, 5);
    expect(plan.Point).toEqual(landing.Point);
  });

  it('a held ball is a contact now on the limb that holds it', () => {
    const plan = Plan(Input(At(0.55, 0.23, 0.2)), BallVerb.Thigh, Limb.LeftThigh, true);

    expect(plan.Limb).toBe(Limb.LeftThigh);
    expect(plan.TimeToContact).toBe(0);
    expect(plan.Reachable).toBe(true);
  });

  it('an unowned ball has no plan', () => {
    const input: BounceInput = { ...Input(At(0.3, 0.3)), HasOwner: false };

    expect(planExists(Plan(input, BallVerb.Foot))).toBe(false);
  });

  // --- One rule, read twice ----------------------------------------------------------------

  it('the touch gate and the plan agree', () => {
    const near = Input(At(0.55, 0.3));
    const far = Input(At(0.55, 0.7));

    const nearSolver = Picked(0.8);
    const farSolver = Picked(0.8);
    nearSolver.solve(near, Settings);
    farSolver.solve(far, Settings);

    expect(Plan(near, BallVerb.Thigh).Reachable).toBe(true);
    expect(nearSolver.inReach).toBe(true);
    expect(nearSolver.touches).toBe(1);

    expect(Plan(far, BallVerb.Thigh).Reachable).toBe(false);
    expect(farSolver.inReach).toBe(false);
    expect(farSolver.touches).toBe(0);
  });

  it('which limb plays it never changes the ball', () => {
    const grounded = Input(At(Radius, 0.3), { grounded: true });
    const rising = Input(At(0.3, 0.3), { ballVelocity: vec3(0, 1, 0) });

    // One solver has played a touch already, so its next foot is the other.
    const fresh = Picked(Radius);
    const played = Picked(Radius);
    played.solve(grounded, Settings);
    played.solve(rising, Settings);

    const fromFresh = fresh.solve(grounded, Settings);
    const fromPlayed = played.solve(grounded, Settings);

    expect(fresh.lastLimb).not.toBe(played.lastLimb);
    expect(fromPlayed).toEqual(fromFresh);
  });

  it('after a touch the plan is for the next contact', () => {
    const solver = Picked(Radius);

    const sent = solver.solve(Input(At(Radius, 0.3), { grounded: true }), Settings);

    expect(solver.touches).toBe(1);
    // The ball has just been sent up; its next contact is a flight away.
    expect(solver.plan.TimeToContact).toBeGreaterThan(0.1);
    expect(solver.plan.Limb).toBe(Limb.LeftFoot);
    expect(sent.y).toBeGreaterThan(0);
  });

  it('the plan names the kind of touch from the queue', () => {
    const falling = Input(At(0.8, 0.3));

    const plain = Picked(0.8);
    plain.solve(falling, Settings);
    expect(plain.plan.Kind).toBe(TouchKind.Stall);

    const bouncing = Picked(0.8);
    bouncing.requestBounce(1.4);
    bouncing.solve(falling, Settings);
    expect(bouncing.plan.Kind).toBe(TouchKind.Bounce);

    const launching = Picked(0.8);
    launching.requestLaunch(
      { Aim: vec3(0, 3, -5), Facing: vec3(0, 0, -1), ChargeSeconds: 1, BallHeight: 1.05, Limb: Limb.None },
      { MinSpeed: 3.5, MaxSpeed: 12, ChargeTime: 1, LaunchSpin: 6, Parts: DEFAULT_PASS_PROFILES, AimLoftOffset: 0, AimLoftGain: 1 },
      { FootMax: 0.5, ThighMax: 0.95, ChestMax: 1.45 },
    );
    launching.solve(falling, Settings);
    expect(launching.plan.Kind).toBe(TouchKind.Launch);
  });

  // --- Limbs, as data ---------------------------------------------------------------------

  it.each([
    [Limb.LeftFoot, BallVerb.Foot, BodySide.Left],
    [Limb.RightFoot, BallVerb.Foot, BodySide.Right],
    [Limb.LeftThigh, BallVerb.Thigh, BodySide.Left],
    [Limb.RightThigh, BallVerb.Thigh, BodySide.Right],
    [Limb.Chest, BallVerb.Chest, BodySide.None],
    [Limb.Head, BallVerb.Head, BodySide.None],
  ] as const)('a limb knows its level and side (%s, %s, %s)', (limb, level, side) => {
    expect(Limbs.levelOf(limb)).toBe(level);
    expect(Limbs.sideOf(limb)).toBe(side);
    expect(Limbs.for(level, side)).toBe(limb);
  });

  it('a limbs mirror is the other side and the chest is its own', () => {
    expect(Limbs.mirror(Limb.LeftFoot)).toBe(Limb.RightFoot);
    expect(Limbs.mirror(Limb.RightThigh)).toBe(Limb.LeftThigh);
    expect(Limbs.mirror(Limb.Chest)).toBe(Limb.Chest);
    expect(Limbs.mirror(Limb.Head)).toBe(Limb.Head);
  });

  // --- S23: reach where the owner will be -----------------------------------------------------

  it('reach is measured where the owner will be', () => {
    const input: BounceInput = {
      ...Input(At(0.4, 0.8), { ballVelocity: vec3(0, 0, -3), ownerIntent: vec3(0, 0, -3) }),
      OwnerFollow: Follow,
    };

    const now = ContactPlanner.plan(input, BallVerb.Foot, false, Limb.None, TouchKind.KeepUp, Settings, false);
    const followed = ContactPlanner.plan(input, BallVerb.Foot, false, Limb.None, TouchKind.KeepUp, Settings, true);

    expect(now.Reachable).toBe(false);
    expect(now.Following).toBe(false);

    expect(followed.Reachable).toBe(true);
    expect(followed.Following).toBe(true);
    expect(followed.Forward).toEqual(Forward);
    expect(followed.Stand.z).toBeCloseTo(followed.Point.z + Levels.Foot.HoldOffset, 3);
  });

  it('a contact beyond the top speed is not followed', () => {
    const input: BounceInput = {
      ...Input(At(0.4, 3), { ballVelocity: vec3(0, 0, -12) }),
      OwnerFollow: { ...Follow, TopSpeed: 2 },
    };

    const plan = ContactPlanner.plan(input, BallVerb.Foot, false, Limb.None, TouchKind.KeepUp, Settings, true);

    expect(plan.Following).toBe(false);
    expect(plan.Reachable).toBe(false);
  });

  it('at the contact the owner now is where the follow would have them', () => {
    const input: BounceInput = {
      ...Input(At(Radius, 0.3), { ballVelocity: Down, grounded: true }),
      OwnerFollow: Follow,
    };

    const plan = ContactPlanner.plan(input, BallVerb.Foot, false, Limb.None, TouchKind.KeepUp, Settings, true);

    expect(plan.TimeToContact).toBe(0);
    expect(plan.Following).toBe(false);
    expect(plan.Reachable).toBe(true);
  });
});

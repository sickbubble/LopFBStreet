import { describe, expect, it } from 'vitest';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { TouchKind, type BounceInput } from '../../src/ball/contactPlan.js';
import { ContactPlanner } from '../../src/ball/contactPlanner.js';
import { BodySide, Limb } from '../../src/ball/limb.js';
import {
  STANDING,
  StrideClock,
  strideAfter,
  strideLengthAt,
  swinging,
  type StrideSettings,
  type StrideState,
} from '../../src/body/strideClock.js';
import { NO_SHOULDER, NO_TRAP, type BounceSettings, type CarryLevels } from '../../src/tuning/ballSettings.js';
import type { BodyModel } from '../../src/tuning/bodyModel.js';
import { vec3, ZERO, type Vec3 } from '../../src/vec.js';

/**
 * S18: the stride is the domain's, and on the move the foot swinging
 * forward at the contact plays it. Port of `StrideClockTests.cs`.
 */

const Stride: StrideSettings = { WalkStride: 1.3, RunStride: 2.4, WalkSpeed: 1.6, RunSpeed: 5.0, MovingAbove: 0.2 };

const strideState = (Phase: number, Length: number, Moving: boolean): StrideState => ({ Phase, Length, Moving });

// --- The planner reads it ----------------------------------------------------------------

const Step = 1 / 120;
const Gravity = 9.81;
const Radius = 0.11;

const level = (
  TouchHeight: number,
  HoldOffset: number,
  Apex: number,
  SpeedFactor: number,
  LeadFactor: number,
  Correction: number,
  BreakRadius: number,
  MicroMotion: number,
) => ({ TouchHeight, HoldOffset, Apex, SpeedFactor, LeadFactor, Correction, BreakRadius, MicroMotion });

const Levels: CarryLevels = {
  Foot: level(0.25, 0.3, 0.6, 0.6, 1.0, 0.4, 0, 0),
  Thigh: level(0.55, 0.23, 0.9, 0.5, 0.75, 0.55, 0.35, 0.04),
  Chest: level(1.05, 0.18, 1.4, 0.4, 0.5, 0.75, 0.25, 0.03),
  Head: level(1.55, 0.08, 1.9, 0.3, 0.35, 0.85, 0.15, 0.02),
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

const Moving = (ball: Vec3, ballVelocity: Vec3, speed: number, stride: StrideState): BounceInput => ({
  BallPosition: ball,
  BallVelocity: ballVelocity,
  HasOwner: true,
  OwnerPosition: ZERO,
  OwnerVelocity: vec3(0, 0, -speed),
  OwnerIntent: vec3(0, 0, -speed),
  OwnerFacing: vec3(0, 0, -1),
  OwnerRise: 0,
  OwnerStride: stride,
  OwnerBody: Mannequin,
  IsGrounded: false,
  BallRadius: Radius,
  Step,
  EffectiveGravity: Gravity,
});

describe('StrideClock', () => {
  it('the phase advances by distance over the cycle length', () => {
    const clock = new StrideClock();

    const state = clock.advance(0.65, 1.6, Stride);

    expect(state.Phase).toBeCloseTo(0.5, 4);
    expect(state.Length).toBeCloseTo(1.3, 4);
    expect(state.Moving).toBe(true);
  });

  it('the phase wraps', () => {
    const clock = new StrideClock();
    clock.advance(1.0, 1.6, Stride);

    const state = clock.advance(0.5, 1.6, Stride);

    expect(state.Phase).toBeCloseTo(1.5 / 1.3 - 1, 4);
  });

  it.each([
    [0.0, BodySide.Right],
    [0.49, BodySide.Right],
    [0.5, BodySide.Left],
    [0.99, BodySide.Left],
  ] as const)('the right foot swings first (phase %s)', (phase, side) => {
    expect(swinging(strideState(phase, 1.3, true))).toBe(side);
  });

  it('standing holds the phase', () => {
    const clock = new StrideClock();
    clock.advance(0.4, 1.6, Stride);

    const still = clock.advance(0, 0, Stride);
    const again = clock.advance(0.1, 0.1, Stride);

    expect(still.Moving).toBe(false);
    expect(again.Moving).toBe(false);
    expect(again.Phase).toBeCloseTo(0.4 / 1.3, 4);
  });

  it.each([
    [0.5, 1.3],
    [1.6, 1.3],
    [3.3, 1.85],
    [5.0, 2.4],
    [8.0, 2.4],
  ] as const)('the cycle lengthens with speed (%s m/s is %s m)', (speed, length) => {
    expect(strideLengthAt(speed, Stride)).toBeCloseTo(length, 3);
  });

  it('after projects the stride forward', () => {
    const state = strideState(0.3, 2.0, true);

    expect(strideAfter(state, 1.0).Phase).toBeCloseTo(0.8, 4);
    expect(strideAfter(state, 2.0).Phase).toBeCloseTo(0.3, 4);
  });

  // --- The planner reads it ----------------------------------------------------------------

  it('on the move the foot swinging at the contact plays the touch', () => {
    // From 0.25 + 0.2 s of fall under gravity: h = 0.25 + v t + g t^2 / 2 with v = 0 at the top.
    const t = 0.2;
    const height = 0.25 + 0.5 * Gravity * t * t;
    const ball = vec3(0, height, -(0.3 + 5 * t));
    const falling = vec3(0, 0, -5);
    const stride = strideState(0.1, 2.4, true);

    const plan = ContactPlanner.plan(Moving(ball, falling, 5, stride), BallVerb.Foot, false, Limb.LeftFoot, TouchKind.KeepUp, Settings);

    expect(plan.TimeToContact).toBeCloseTo(t, 2);
    expect(plan.Limb).toBe(Limb.LeftFoot);
  });

  it('earlier in the stride it is the other foot', () => {
    const t = 0.2;
    const height = 0.25 + 0.5 * Gravity * t * t;
    const ball = vec3(0, height, -(0.3 + 5 * t));
    const falling = vec3(0, 0, -5);
    const stride = strideState(0.9, 2.4, true);

    const plan = ContactPlanner.plan(Moving(ball, falling, 5, stride), BallVerb.Foot, false, Limb.RightFoot, TouchKind.KeepUp, Settings);

    // 0.9 + 0.42 wraps to 0.32: the right is swinging.
    expect(plan.Limb).toBe(Limb.RightFoot);
  });

  it('standing the feet still alternate', () => {
    const ball = vec3(0, 0.4, -0.3);

    const plan = ContactPlanner.plan(
      Moving(ball, vec3(0, -2, 0), 0, STANDING),
      BallVerb.Foot,
      false,
      Limb.RightFoot,
      TouchKind.KeepUp,
      Settings,
    );

    expect(plan.Limb).toBe(Limb.LeftFoot);
  });

  it('a wide ball is its sides on the move too', () => {
    const ball = vec3(0.3, 0.4, -0.3);
    const stride = strideState(0.7, 2.4, true);

    const plan = ContactPlanner.plan(Moving(ball, vec3(0, -2, -5), 5, stride), BallVerb.Foot, false, Limb.None, TouchKind.KeepUp, Settings);

    expect(plan.Limb).toBe(Limb.RightFoot);
  });
});

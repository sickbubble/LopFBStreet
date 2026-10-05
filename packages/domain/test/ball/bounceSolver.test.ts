import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { BounceSolver } from '../../src/ball/bounceSolver.js';
import { TouchKind, type BounceInput } from '../../src/ball/contactPlan.js';
import type { LaunchRequest } from '../../src/ball/launchSolver.js';
import { Limb } from '../../src/ball/limb.js';
import { STANDING } from '../../src/body/strideClock.js';
import { moveToward } from '../../src/mathUtil.js';
import {
  levelForApex,
  levelForHeight,
  NO_SHOULDER,
  NO_TRAP,
  type BounceSettings,
  type CarryLevel,
  type CarryLevels,
  type LaunchSettings,
  type VerbBands,
} from '../../src/tuning/ballSettings.js';
import type { BodyModel } from '../../src/tuning/bodyModel.js';
import { DEFAULT_PASS_PROFILES, PassPart } from '../../src/tuning/passProfiles.js';
import { add, length, neg, scale, vec3, ZERO, type Vec3 } from '../../src/vec.js';

/**
 * The feel of carrying, bouncing and passing, as numbers. If M0 ever stops
 * feeling right after a change, this is the file that says what changed.
 * Port of `BounceSolverTests.cs` at godot-final.
 */

const STEP = 1 / 120; // the project's physics tick
const GRAVITY = 9.81;
const RADIUS = 0.11; // a grounded ball's centre height

const PASS_SETTINGS: LaunchSettings = {
  MinSpeed: 3.5,
  MaxSpeed: 12,
  ChargeTime: 1,
  LaunchSpin: 6,
  Parts: DEFAULT_PASS_PROFILES,
  AimLoftOffset: 0,
  AimLoftGain: 1,
};
const PASS_BANDS: VerbBands = { FootMax: 0.5, ThighMax: 0.95, ChestMax: 1.45 };

/** Godot forward is -Z; the owner faces that way unless a test says otherwise. */
const FORWARD: Vec3 = vec3(0, 0, -1);
const UNIT_X: Vec3 = vec3(1, 0, 0);
const UNIT_Z: Vec3 = vec3(0, 0, 1);

const DOWN: Vec3 = vec3(0, -2.5, 0);

const request = (aim: Vec3, facing: Vec3, chargeSeconds: number, ballHeight: number, limb: Limb = Limb.None): LaunchRequest => ({
  Aim: aim,
  Facing: facing,
  ChargeSeconds: chargeSeconds,
  BallHeight: ballHeight,
  Limb: limb,
});

/** Queue a pass the way LaunchInput does: the request, solved when it fires (S28). */
function queuePass(solver: BounceSolver, aim: Vec3, chargeSeconds = 1): void {
  solver.requestLaunch(request(aim, FORWARD, chargeSeconds, 0.2), PASS_SETTINGS, PASS_BANDS);
}

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

/**
 * The pre-stall model: no level holds the ball, every level bounce-dribbles.
 * The tests that pin keep-up geometry above the foot use this, because the
 * shipping thigh/chest/head cushion instead of popping.
 */
const BOUNCING: BounceSettings = {
  ...SETTINGS,
  Levels: {
    Foot: LEVELS.Foot,
    Thigh: { ...LEVELS.Thigh, BreakRadius: 0 },
    Chest: { ...LEVELS.Chest, BreakRadius: 0 },
    Head: { ...LEVELS.Head, BreakRadius: 0 },
  },
};

/**
 * The same levels with a whole correction and an unscaled lead, for the
 * tests that pin where a touch *aims* rather than how much of the gap it
 * closes. Nothing ships with these.
 */
const IDEAL: BounceSettings = {
  ...SETTINGS,
  Levels: {
    Foot: { ...LEVELS.Foot, LeadFactor: 1, Correction: 1 },
    Thigh: { ...LEVELS.Thigh, LeadFactor: 1, Correction: 1, BreakRadius: 0 },
    Chest: { ...LEVELS.Chest, LeadFactor: 1, Correction: 1, BreakRadius: 0 },
    Head: { ...LEVELS.Head, LeadFactor: 1, Correction: 1, BreakRadius: 0 },
  },
};

/**
 * A body whose every limb reaches further than any hold point in this
 * fixture, so the tests above the reach section see the pre-S16 gate.
 * Hips 0.1 m off the centreline, a 0.05 m deadband.
 */
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

/** A ball at the given height above the feet, on the hold point ahead of a standing owner. */
const at = (height: number, ahead = 0.6): Vec3 => vec3(0, height, -ahead);

interface InputOptions {
  ballPosition?: Vec3;
  grounded?: boolean;
  hasOwner?: boolean;
  ownerPosition?: Vec3;
  ownerIntent?: Vec3;
  ownerFacing?: Vec3;
  ownerRise?: number;
}

function input(ballVelocity: Vec3, o: InputOptions = {}): BounceInput {
  const intent = o.ownerIntent ?? ZERO;
  return {
    BallPosition: o.ballPosition ?? at(RADIUS),
    BallVelocity: ballVelocity,
    HasOwner: o.hasOwner ?? true,
    OwnerPosition: o.ownerPosition ?? ZERO,
    OwnerVelocity: intent,
    OwnerIntent: intent,
    OwnerFacing: o.ownerFacing ?? FORWARD,
    OwnerRise: o.ownerRise ?? 0,
    OwnerStride: STANDING,
    OwnerBody: BODY,
    IsGrounded: o.grounded ?? false,
    BallRadius: RADIUS,
    Step: STEP,
    EffectiveGravity: GRAVITY,
  };
}

/**
 * A solver carrying the ball at this height: handed over under control,
 * so its next touch is the level's own.
 */
const picked = (height: number): BounceSolver => pickedIn(SETTINGS, height);

function pickedIn(settings: BounceSettings, height: number): BounceSolver {
  const solver = new BounceSolver();
  solver.onPickedUp(height, settings, true);
  return solver;
}

const riseSpeed = (rise: number): number => Ballistics.verticalSpeedForApex(rise, GRAVITY);

const flatLength = (v: Vec3): number => Math.sqrt(v.x * v.x + v.z * v.z);

/** `Assert.Equal(Vector3, Vector3)`, within the float noise a double port carries. */
function expectVec(actual: Vec3, expected: Vec3, digits = 5): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

// --- The hold ---------------------------------------------------------------

describe('the hold', () => {
  it('a tap asks for the foot apex', () => {
    expect(BounceSolver.apexForHold(0, SETTINGS)).toBeCloseTo(0.4, 5);
  });

  it('a full hold asks for the max apex', () => {
    expect(BounceSolver.apexForHold(0.6, SETTINGS)).toBeCloseTo(2.0, 5);
  });

  it.each([
    [0.075, BallVerb.Foot],
    [0.225, BallVerb.Thigh],
    [0.375, BallVerb.Chest],
    [0.525, BallVerb.Head],
  ] as const)('each level gets an equal slice of the charge (%s s)', (seconds, expected) => {
    expect(levelForApex(LEVELS, BounceSolver.apexForHold(seconds, SETTINGS))).toBe(expected);
  });

  it.each([
    [0.15, 0.75], // thigh 0.55 + PopMargin
    [0.3, 1.25], // chest 1.05 + PopMargin
    [0.45, 1.75], // head 1.55 + PopMargin
  ] as const)('each slice starts on its bands edge (%s s -> %s m)', (seconds, edge) => {
    expect(BounceSolver.apexForHold(seconds, SETTINGS)).toBeCloseTo(edge, 4);
  });

  it('the hold is linear within its slice', () => {
    expect(BounceSolver.apexForHold(0.075, SETTINGS)).toBeCloseTo((0.4 + 0.75) / 2, 4);
  });

  it('the charge never goes down', () => {
    const broken: BounceSettings = {
      ...SETTINGS,
      Levels: { ...LEVELS, Thigh: { ...LEVELS.Thigh, TouchHeight: 1.5 } }, // above the chest
    };

    let last = 0;
    for (let i = 0; i <= 60; i++) {
      const apex = BounceSolver.apexForHold(i * 0.01, broken);
      expect(apex >= last - 0.0001).toBe(true);
      last = apex;
    }
  });

  it('a hold past the charge time is clamped to the max', () => {
    expect(BounceSolver.apexForHold(5, SETTINGS)).toBeCloseTo(2.0, 5);
  });
});

// --- The levels, as data ----------------------------------------------------

describe('the levels, as data', () => {
  it.each([
    [0.4, BallVerb.Foot],
    [0.74, BallVerb.Foot],
    [0.75, BallVerb.Thigh],
    [1.0, BallVerb.Thigh],
    [1.24, BallVerb.Thigh],
    [1.25, BallVerb.Chest],
    [1.74, BallVerb.Chest],
    [1.75, BallVerb.Head],
    [2.0, BallVerb.Head],
  ] as const)('a commanded apex lands in a band with a pop margin (%s m)', (apex, expected) => {
    expect(levelForApex(LEVELS, apex)).toBe(expected);
  });

  it.each([
    [0.11, BallVerb.Foot],
    [0.6, BallVerb.Thigh],
    [1.2, BallVerb.Chest],
    [1.7, BallVerb.Head],
  ] as const)('a ball belongs to the highest level below it (%s m)', (height, expected) => {
    expect(levelForHeight(LEVELS, height)).toBe(expected);
  });
});

// --- Foot level: the ground is the touch ------------------------------------

describe('foot level: the ground is the touch', () => {
  it('a grounded foot ball is kept up to the foot apex', () => {
    const solver = new BounceSolver();

    const result = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(result.y).toBeCloseTo(riseSpeed(0.4 - RADIUS), 4);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.commanded).toBe(false);
    expect(solver.touches).toBe(1);
  });

  it('a foot keep up is not re fired while still touching', () => {
    const solver = new BounceSolver();
    const sent = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    const result = solver.solve(input(sent, { grounded: true }), SETTINGS);

    expect(result.y).toBeCloseTo(sent.y, 5);
    expect(solver.touches).toBe(1);
  });

  it('a foot ball in the air is left alone vertically', () => {
    const solver = new BounceSolver();

    const result = solver.solve(input(DOWN, { ballPosition: at(0.3) }), SETTINGS);

    expect(result.y).toBeCloseTo(DOWN.y, 5);
    expect(solver.touches).toBe(0);
  });

  it('a rebound the engine already flipped is still a landing', () => {
    const solver = new BounceSolver();
    solver.solve(input(DOWN, { ballPosition: at(0.3) }), SETTINGS);

    const result = solver.solve(input(vec3(0, 2, 0), { grounded: true }), SETTINGS);

    expect(result.y).toBeCloseTo(riseSpeed(0.4 - RADIUS), 4);
  });

  it('a resting ball under a standing owner bounces in place', () => {
    const solver = new BounceSolver();

    const result = solver.solve(input(ZERO, { grounded: true }), SETTINGS);

    expect(result.y > 0).toBe(true);
    expect(result.x).toBeCloseTo(0, 4);
    expect(result.z).toBeCloseTo(0, 4);
  });
});

// --- Air levels: keep-ups at a height ---------------------------------------

describe('air levels: keep-ups at a height', () => {
  it('a thigh ball descending through the thigh height is kept up', () => {
    const solver = pickedIn(BOUNCING, 0.8);
    expect(solver.level).toBe(BallVerb.Thigh);

    const result = solver.solve(input(DOWN, { ballPosition: at(0.55) }), BOUNCING);

    expect(result.y).toBeCloseTo(riseSpeed(0.9 - 0.55), 4);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(solver.level).toBe(BallVerb.Thigh);
    expect(solver.commanded).toBe(false);
  });

  it('a thigh ball above the thigh height is left alone', () => {
    const solver = picked(0.8);

    const result = solver.solve(input(DOWN, { ballPosition: at(0.8) }), SETTINGS);

    expect(result.y).toBeCloseTo(DOWN.y, 5);
    expect(solver.touches).toBe(0);
  });

  it('a keep up fires once per crossing', () => {
    const solver = pickedIn(BOUNCING, 0.8);
    const sent = solver.solve(input(DOWN, { ballPosition: at(0.55) }), BOUNCING);

    const stillBelow = solver.solve(input(sent, { ballPosition: at(0.54) }), BOUNCING);

    expect(stillBelow.y).toBeCloseTo(sent.y, 5);
    expect(solver.touches).toBe(1);
  });

  it('a keep up re arms only above the touch height', () => {
    const solver = pickedIn(BOUNCING, 0.8);
    const sent = solver.solve(input(DOWN, { ballPosition: at(0.55) }), BOUNCING);

    solver.solve(input(sent, { ballPosition: at(0.54) }), BOUNCING);
    solver.solve(input(sent, { ballPosition: at(0.55) }), BOUNCING);
    expect(solver.touches).toBe(1);

    solver.solve(input(sent, { ballPosition: at(0.56) }), BOUNCING); // clear: arms
    solver.solve(input(DOWN, { ballPosition: at(0.55) }), BOUNCING); // back down: fires

    expect(solver.touches).toBe(2);
  });

  it('a keep up returns to the touch height where the owner will be', () => {
    const solver = picked(0.8);
    const intent = vec3(0, 0, -5);
    const i = input(DOWN, { ballPosition: at(0.55), ownerIntent: intent });

    const touch = solver.solve(i, IDEAL);
    const flight = Ballistics.timeToReturn(touch.y, GRAVITY);
    const landing = Ballistics.positionAfter(i.BallPosition, touch, GRAVITY, flight);

    // Thigh pace is x0.5: the keep-up aims at 2.5 m/s, lead 0.6 + 0.05 * 2.5.
    const expected = add(scale(intent, 0.5 * flight), scale(FORWARD, 0.725));
    expect(landing.y).toBeCloseTo(0.55, 3);
    expect(landing.x).toBeCloseTo(expected.x, 3);
    expect(landing.z).toBeCloseTo(expected.z, 3);
  });

  it('a ball that reaches the ground becomes a foot ball', () => {
    const solver = picked(1.2);
    expect(solver.level).toBe(BallVerb.Chest);

    const result = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(solver.level).toBe(BallVerb.Foot);
    expect(result.y).toBeCloseTo(riseSpeed(0.4 - RADIUS), 4);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
  });

  it('a ball below its touch height never hovers', () => {
    const solver = pickedIn(BOUNCING, 0.8);
    solver.solve(input(DOWN, { ballPosition: at(0.55) }), BOUNCING);

    for (const height of [0.5, 0.45, 0.4, 0.3]) {
      const falling = vec3(0, -1, 0);
      const result = solver.solve(input(falling, { ballPosition: at(height) }), BOUNCING);
      expect(result.y).toBeCloseTo(falling.y, 5);
    }

    expect(solver.touches).toBe(1);
  });
});

// --- Commanded: the bounce button -------------------------------------------

describe('commanded: the bounce button', () => {
  it('a commanded bounce from the ground sets the level it will arm at', () => {
    const solver = new BounceSolver();
    solver.requestBounce(1.4);

    const result = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(result.y).toBeCloseTo(riseSpeed(1.4 - RADIUS), 4);
    expect(solver.level).toBe(BallVerb.Chest);
    expect(solver.commanded).toBe(true);
    expect(solver.lastTouch).toBe(TouchKind.Bounce);
    expect(solver.pendingApex).toBeNull();
  });

  it('the first keep up at the new level fires at its touch height', () => {
    const solver = new BounceSolver();
    solver.requestBounce(1.4);
    const sent = solver.solve(input(DOWN, { grounded: true }), BOUNCING);

    solver.solve(input(sent, { ballPosition: at(0.5) }), BOUNCING); // rising, below chest height
    solver.solve(input(sent, { ballPosition: at(1.2) }), BOUNCING); // clear: arms
    expect(solver.touches).toBe(1);

    const result = solver.solve(input(DOWN, { ballPosition: at(1.05) }), BOUNCING);

    expect(solver.touches).toBe(2);
    expect(result.y).toBeCloseTo(riseSpeed(1.4 - 1.05), 4);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(solver.commanded).toBe(false);
  });

  it('a tap at chest level drops the ball to the feet', () => {
    const solver = picked(1.2);
    solver.requestBounce(0.4);

    const dropped = solver.solve(input(vec3(0, -2, 0), { ballPosition: at(1.05) }), SETTINGS);

    expect(dropped.y).toBeCloseTo(-2, 5);
    expect(solver.lastTouch).toBe(TouchKind.Drop);
    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.commanded).toBe(true);

    const landed = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(landed.y).toBeCloseTo(riseSpeed(0.4 - RADIUS), 4);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(solver.touches).toBe(2);
  });

  it('a drop to a lower level fires at that level on the way down', () => {
    const solver = pickedIn(BOUNCING, 1.2);
    solver.requestBounce(0.9);

    solver.solve(input(vec3(0, -2, 0), { ballPosition: at(1.05) }), BOUNCING);
    expect(solver.lastTouch).toBe(TouchKind.Drop);
    expect(solver.level).toBe(BallVerb.Thigh);

    const passing = solver.solve(input(DOWN, { ballPosition: at(0.8) }), BOUNCING);
    expect(passing.y).toBeCloseTo(DOWN.y, 5);

    const result = solver.solve(input(DOWN, { ballPosition: at(0.55) }), BOUNCING);

    expect(result.y).toBeCloseTo(riseSpeed(0.9 - 0.55), 4);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
  });

  it('a request made in the air waits for the next touch', () => {
    const solver = new BounceSolver();
    solver.requestBounce(1.0);

    const inAir = solver.solve(input(DOWN, { ballPosition: at(0.3) }), SETTINGS);
    expect(inAir.y).toBeCloseTo(DOWN.y, 5);
    expect(solver.pendingApex).toBe(1.0);

    const landed = solver.solve(input(DOWN, { grounded: true }), SETTINGS);
    expect(landed.y).toBeCloseTo(riseSpeed(1.0 - RADIUS), 4);
    expect(solver.pendingApex).toBeNull();
  });

  it('a newer request replaces an older one', () => {
    const solver = new BounceSolver();
    solver.requestBounce(0.5);
    solver.requestBounce(1.8);

    const result = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(result.y).toBeCloseTo(riseSpeed(1.8 - RADIUS), 4);
    expect(solver.level).toBe(BallVerb.Head);
  });

  it('clearing requests makes the next touch an automatic keep up', () => {
    const solver = new BounceSolver();
    solver.requestBounce(1.5);
    solver.clearRequests();

    solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(solver.commanded).toBe(false);
  });
});

// --- The aim: where the owner will be ---------------------------------------

describe('the aim: where the owner will be', () => {
  it('an automatic keep up aims at the capped intent', () => {
    const solver = picked(1.7);
    const intent = vec3(0, 0, -8);
    const i = input(DOWN, { ballPosition: at(1.55), ownerIntent: intent });

    const touch = solver.solve(i, IDEAL);
    const flight = Ballistics.timeToReturn(touch.y, GRAVITY);
    const landing = Ballistics.positionAfter(i.BallPosition, touch, GRAVITY, flight);

    // Head pace is x0.3: 2.4 m/s, lead 0.6 + 0.05 * 2.4.
    const expected = add(scale(intent, 0.3 * flight), scale(FORWARD, 0.72));
    expect(landing.z).toBeCloseTo(expected.z, 3);
    expect(landing.z > -2.5, `a head keep-up must stay within the radius, landed at ${landing.z}`).toBe(true);
  });

  it('a commanded touch aims at full intent', () => {
    const solver = new BounceSolver();
    solver.requestBounce(0.4);
    const intent = vec3(0, 0, -8);
    const i = input(DOWN, { grounded: true, ownerIntent: intent });

    const touch = solver.solve(i, IDEAL);
    const flight = Ballistics.timeToReturn(touch.y, GRAVITY);
    const landing = Ballistics.positionAfter(i.BallPosition, touch, GRAVITY, flight);

    const expected = add(scale(intent, flight), scale(FORWARD, 1.0));
    expect(landing.z).toBeCloseTo(expected.z, 3);
    expect(landing.y).toBeCloseTo(RADIUS, 3);
    expect(landing.z < -4, `a sprint touch is a knock-on, landed at ${landing.z}`).toBe(true);
  });

  it('in flight easing targets the capped intent', () => {
    const solver = picked(1.7);
    const intent = vec3(0, 0, -8);

    const result = solver.solve(input(vec3(0, 1, 0), { ballPosition: at(1.7), ownerIntent: intent }), SETTINGS);

    // One tick at ease 0.5 toward -8 * 0.3.
    expect(result.z).toBeCloseTo(-8 * 0.3 * 0.5 * STEP, 4);
  });

  it('a ball ahead of its owner is never pulled back', () => {
    const solver = new BounceSolver();
    const intent = vec3(0, 0, -5);
    const pace = scale(intent, 0.6); // foot level

    const result = solver.solve(
      input({ ...pace, y: 1 }, { ballPosition: at(0.3, 3), ownerIntent: intent }),
      SETTINGS,
    );

    expect(result.z).toBeCloseTo(pace.z, 5);
    expect(result.x).toBeCloseTo(0, 5);
  });

  it('a grounded ball is not eased at all', () => {
    const solver = new BounceSolver();
    solver.solve(input(DOWN, { grounded: true }), SETTINGS); // touched; the contact steps follow
    const rising = vec3(1, 2, 0);

    const result = solver.solve(input(rising, { grounded: true, ownerIntent: vec3(0, 0, -5) }), SETTINGS);

    expectVec(result, rising);
  });

  it('a standing owner gathers a drifted ball over several touches', () => {
    const hold = vec3(0, RADIUS, -0.6);
    let ball = vec3(-1.6, RADIUS, 0.5);

    const offset = (b: Vec3, h: Vec3): number => Math.hypot(b.x - h.x, b.z - h.z);

    let previous = offset(ball, hold);
    expect(previous > 1.5, 'the ball must start well out of position').toBe(true);

    for (let touch = 1; touch <= 4; touch++) {
      const i = input(ZERO, { ballPosition: ball, grounded: true });

      const velocity = BounceSolver.touchVelocity(0.4 - RADIUS, ZERO, i, SETTINGS, LEVELS.Foot);
      const flight = Ballistics.timeToReturn(velocity.y, GRAVITY);
      ball = Ballistics.positionAfter(ball, velocity, GRAVITY, flight);

      const now = offset(ball, hold);
      expect(now < previous, `touch ${touch} must close the gap, not open it`).toBe(true);
      previous = now;
    }

    // 0.6^4 of a 1.94 m start. It converges, which is what keeps pillar 3.
    expect(previous < 0.3, `four foot touches should have it back near the feet, was ${previous}`).toBe(true);
  });

  it('a high level gathers the ball far harder than the foot', () => {
    const ball = vec3(-0.4, 1.55, 0);
    const i = input(ZERO, { ballPosition: ball });

    const sideways = (b: Vec3, velocity: Vec3, rise: number): number => {
      const flight = Ballistics.timeToReturn(Ballistics.verticalSpeedForApex(rise, GRAVITY), GRAVITY);
      return Math.abs(Ballistics.positionAfter(b, velocity, GRAVITY, flight).x);
    };

    const head = sideways(ball, BounceSolver.touchVelocity(1.9 - 1.55, ZERO, i, SETTINGS, LEVELS.Head), 1.9 - 1.55);
    const foot = sideways(ball, BounceSolver.touchVelocity(1.9 - 1.55, ZERO, i, SETTINGS, LEVELS.Foot), 1.9 - 1.55);

    expect(head < foot, 'a head touch settles the ball; a foot touch lets it run').toBe(true);
    expect(head < 0.1, `a head touch should all but kill a 0.4 m drift, left ${head}`).toBe(true);
  });

  it('the lead grows with aimed speed', () => {
    const leadFor = (speed: number): number => {
      const intent = vec3(0, 0, -speed);
      const i = input(ZERO, { grounded: true, ownerIntent: intent });
      const touch = BounceSolver.touchVelocity(0.4 - RADIUS, ZERO, i, IDEAL, IDEAL.Levels.Foot);
      const flight = Ballistics.timeToReturn(touch.y, GRAVITY);
      const landing = Ballistics.positionAfter(i.BallPosition, touch, GRAVITY, flight);
      const lead = add(landing, neg(scale(intent, flight)));
      return flatLength(lead);
    };

    expect(leadFor(0)).toBeCloseTo(0.6, 3);
    expect(leadFor(5)).toBeCloseTo(0.6 + 0.05 * 5, 3);
    expect(leadFor(8)).toBeCloseTo(0.6 + 0.05 * 8, 3);
  });

  it('a touch never exceeds the max speed', () => {
    const intent = vec3(0, 0, -8);
    const i = input(intent, { ballPosition: vec3(0, RADIUS, 2.5), grounded: true, ownerIntent: intent });

    const touch = BounceSolver.touchVelocity(0.4 - RADIUS, intent, i, IDEAL, IDEAL.Levels.Foot);

    expect(flatLength(touch)).toBeCloseTo(12, 3);
    expect(touch.z < 0).toBe(true);
  });

  it('a drop keeps its fall and travels with the owner', () => {
    const intent = vec3(3, 0, -4);
    const i = input(ZERO, { ballPosition: at(1.05), ownerIntent: intent });

    const falling = BounceSolver.touchVelocity(-0.5, vec3(0, -2, 0), i, SETTINGS, LEVELS.Chest);
    expectVec(falling, vec3(3, -2, -4));

    const rising = BounceSolver.touchVelocity(-0.5, vec3(0, 1, 0), i, SETTINGS, LEVELS.Chest);
    expect(rising.y).toBeCloseTo(0, 5);
  });
});

// --- The stall: the ball is held, not bounced (S10) -------------------------

/** A solver that has just cushioned the ball at this level's height. */
function stalled(height: number, expected: BallVerb): BounceSolver {
  const solver = picked(height + 0.3);
  solver.solve(input(DOWN, { ballPosition: at(height) }), SETTINGS);

  expect(solver.stuck, 'the ball should have been cushioned').toBe(true);
  expect(solver.level).toBe(expected);
  expect(solver.lastTouch).toBe(TouchKind.Stall);
  return solver;
}

/**
 * The player's velocity as `PlayerMotor` would actually produce it: moved
 * toward the target at the motor's ground acceleration, never teleported.
 */
const MOTOR_ACCEL = 45;

const toward = (velocity: Vec3, target: Vec3): Vec3 =>
  vec3(moveToward(velocity.x, target.x, MOTOR_ACCEL * STEP), 0, moveToward(velocity.z, target.z, MOTOR_ACCEL * STEP));

describe('the stall: the ball is held, not bounced (S10)', () => {
  it('a ball arriving at the chest is cushioned and held', () => {
    const solver = stalled(1.05, BallVerb.Chest);

    const velocity = solver.solve(input(ZERO, { ballPosition: at(1.05) }), SETTINGS);

    expect(solver.stuck).toBe(true);
    expect(Math.abs(velocity.y) < 1, `a held ball is not launched upward, got ${velocity.y}`).toBe(true);
  });

  it('the rest point of a chest carry sits ahead of the feet at chest height', () => {
    const rest = BounceSolver.restPoint(ZERO, FORWARD, 0.65, 1.05);
    expectVec(rest, vec3(0, 1.05, -0.65));

    const lookingUp = BounceSolver.restPoint(ZERO, vec3(0, 5, -1), 0.65, 1.05);
    expectVec(lookingUp, rest);

    const noFacing = BounceSolver.restPoint(vec3(3, 0, 4), ZERO, 0.65, 1.05);
    expectVec(noFacing, vec3(3, 1.05, 4));
  });

  it('a held ball already on the rest point is left where it is', () => {
    const rest = BounceSolver.restPoint(ZERO, FORWARD, LEVELS.Chest.HoldOffset, 1.05);
    expectVec(rest, at(1.05));

    const solver = stalled(1.05, BallVerb.Chest);
    const velocity = solver.solve(input(ZERO, { ballPosition: rest }), SETTINGS);

    // Horizontally nothing: the ball is where the hold wants it.
    const sideways = flatLength(velocity);
    expect(sideways < 0.001, `a ball on the rest point should not be moved sideways, got ${sideways}`).toBe(true);
  });

  it('a stall rests the ball at its own levels offset', () => {
    const settings: BounceSettings = {
      ...SETTINGS,
      Levels: {
        Foot: LEVELS.Foot,
        Thigh: LEVELS.Thigh,
        Chest: { ...LEVELS.Chest, HoldOffset: 0.25 },
        Head: { ...LEVELS.Head, HoldOffset: 0.08 },
      },
    };

    // Each arrives exactly on its own point, so the balance starts centred.
    const chest = pickedIn(settings, 1.35);
    chest.solve(input(DOWN, { ballPosition: at(1.05, 0.25) }), settings);
    expect(chest.stuck).toBe(true);

    const head = pickedIn(settings, 1.85);
    head.solve(input(DOWN, { ballPosition: at(1.55, 0.08) }), settings);
    expect(head.stuck).toBe(true);

    // Nudged 0.1 m further out, each is pulled back by 0.1 m -- toward its own point.
    const chestPull = chest.solve(input(ZERO, { ballPosition: at(1.05, 0.35) }), settings);
    const headPull = head.solve(input(ZERO, { ballPosition: at(1.55, 0.18) }), settings);

    expect(chestPull.z).toBeCloseTo(0.1 / STEP, 1);
    expect(headPull.z).toBeCloseTo(0.1 / STEP, 1);
  });

  it('a foot touch leads from the foot offset not the chests', () => {
    const settings: BounceSettings = {
      ...IDEAL,
      Levels: {
        Foot: { ...IDEAL.Levels.Foot, HoldOffset: 0.3 },
        Thigh: IDEAL.Levels.Thigh,
        Chest: { ...IDEAL.Levels.Chest, HoldOffset: 0.25 },
        Head: IDEAL.Levels.Head,
      },
    };

    const velocity = BounceSolver.touchVelocity(0.4 - RADIUS, DOWN, input(DOWN, { grounded: true }), settings, settings.Levels.Foot);

    const flight = Ballistics.timeToReturn(velocity.y, GRAVITY);
    const landsAhead = -(at(RADIUS).z + velocity.z * flight);

    expect(landsAhead).toBeCloseTo(0.3, 3);
  });

  it('the foot never stalls it bounce dribbles', () => {
    const solver = new BounceSolver();

    const result = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(solver.stuck).toBe(false);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
    expect(result.y).toBeCloseTo(riseSpeed(0.4 - RADIUS), 4);
  });

  it('running in a straight line never loses a stall', () => {
    const solver = stalled(1.05, BallVerb.Chest);
    const cruise = vec3(0, 0, -4);

    for (let tick = 0; tick < 600; tick++) {
      solver.solve(input(ZERO, { ballPosition: at(1.05), ownerIntent: cruise }), SETTINGS);
    }

    expect(solver.stuck, 'a steady run must never shake the ball off').toBe(true);
    expect(solver.strain < 0.05, `and the balance should sit quiet, strain was ${solver.strain}`).toBe(true);
  });

  it('a hard cut shakes a head stall loose', () => {
    const solver = stalled(1.55, BallVerb.Head);

    const sprint = vec3(0, 0, -8);
    let velocity = ZERO;

    for (let tick = 0; tick < 120; tick++) {
      velocity = toward(velocity, sprint);
      solver.solve(input(ZERO, { ballPosition: at(1.55), ownerIntent: velocity }), SETTINGS);
    }

    expect(solver.stuck, 'getting up to speed in a straight line must not lose it').toBe(true);

    const cut = neg(sprint);
    let broke = false;
    for (let tick = 0; tick < 240 && !broke; tick++) {
      velocity = toward(velocity, cut);
      solver.solve(input(ZERO, { ballPosition: at(1.55), ownerIntent: velocity }), SETTINGS);
      broke = !solver.stuck;
    }

    expect(broke, 'a full reversal at sprint pace must lose a head stall').toBe(true);
    expect(solver.lastTouch).toBe(TouchKind.Break);
  });

  it('the same cut does not lose a chest stall', () => {
    const solver = stalled(1.05, BallVerb.Chest);

    const sprint = vec3(0, 0, -8);
    let velocity = ZERO;

    for (let tick = 0; tick < 120; tick++) {
      velocity = toward(velocity, sprint);
      solver.solve(input(ZERO, { ballPosition: at(1.05), ownerIntent: velocity }), SETTINGS);
    }

    for (let tick = 0; tick < 240; tick++) {
      velocity = toward(velocity, neg(sprint));
      solver.solve(input(ZERO, { ballPosition: at(1.05), ownerIntent: velocity }), SETTINGS);
    }

    expect(solver.stuck, 'the chest holds what the head drops').toBe(true);
  });

  it('the higher the level the sooner it breaks', () => {
    // Held at the motor's own acceleration, sustained: the hardest push a
    // player can actually apply, kept up until something gives.
    const ticksToBreak = (height: number, level: BallVerb): number => {
      const solver = stalled(height, level);
      let velocity = ZERO;

      for (let tick = 1; tick <= 600; tick++) {
        velocity = add(velocity, vec3(MOTOR_ACCEL * STEP, 0, 0));
        solver.solve(input(ZERO, { ballPosition: at(height), ownerIntent: velocity }), SETTINGS);

        if (!solver.stuck) {
          return tick;
        }
      }

      return Number.MAX_SAFE_INTEGER;
    };

    const thigh = ticksToBreak(0.55, BallVerb.Thigh);
    const chest = ticksToBreak(1.05, BallVerb.Chest);
    const head = ticksToBreak(1.55, BallVerb.Head);

    expect(head < chest, `head (${head}) must break before chest (${chest})`).toBe(true);
    expect(chest < thigh, `chest (${chest}) must break before thigh (${thigh})`).toBe(true);
  });

  it('a broken stall leaves with the velocity it had', () => {
    const solver = stalled(1.55, BallVerb.Head);

    const cut = vec3(3, 0, 0);
    let outgoing = ZERO;

    for (let tick = 1; tick <= 600 && solver.stuck; tick++) {
      outgoing = solver.solve(input(ZERO, { ballPosition: at(1.55), ownerIntent: scale(cut, tick) }), SETTINGS);
    }

    expect(solver.stuck, 'the shove must eventually take it off').toBe(false);
    expect(solver.lastTouch).toBe(TouchKind.Break);

    // It carries the owner's motion on, and it is not stopped dead.
    expect(flatLength(outgoing) > 0.1, "a broken ball keeps moving; it is not parked at the owner's feet").toBe(true);
    expect(outgoing.y).toBeCloseTo(0, 5);
  });

  it('tapping the level you are on re settles a drifting stall', () => {
    const solver = stalled(1.05, BallVerb.Chest);

    const shove = vec3(5, 0, 0);
    for (let tick = 1; tick <= 12; tick++) {
      solver.solve(input(ZERO, { ballPosition: at(1.05), ownerIntent: scale(shove, tick) }), SETTINGS);
    }

    expect(solver.stuck).toBe(true);
    const strained = solver.strain;
    expect(strained > 0.05, `the ball should be visibly off-centre first, was ${strained}`).toBe(true);

    solver.requestBounce(1.4); // the chest band: the level it is already on
    solver.solve(input(ZERO, { ballPosition: at(1.05) }), SETTINGS);

    expect(solver.stuck, 'a re-settle keeps the ball').toBe(true);
    expect(solver.strain < strained, 'and puts it back toward the rest point').toBe(true);
  });

  it('tapping another level pops the ball off the body', () => {
    const solver = stalled(1.55, BallVerb.Head);

    solver.requestBounce(0.4);
    const sent = solver.solve(input(ZERO, { ballPosition: at(1.55) }), SETTINGS);

    expect(solver.stuck).toBe(false);
    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.lastTouch).toBe(TouchKind.Drop);
    expect(sent.y <= 0, 'a drop has no lift').toBe(true);
  });

  it('a launch from a stall fires immediately', () => {
    const solver = stalled(1.05, BallVerb.Chest);

    queuePass(solver, vec3(2, 7, -9));
    const result = solver.solve(input(ZERO, { ballPosition: at(1.05) }), SETTINGS);

    expect(solver.launchFired).toBe(true);
    expectVec(result, solver.firedLaunch.Velocity);
    expect(length(result) > PASS_SETTINGS.MinSpeed).toBe(true);
    expect(solver.stuck).toBe(false);
  });

  it('losing the ball releases a stall', () => {
    const solver = stalled(1.05, BallVerb.Chest);

    solver.clearRequests();

    expect(solver.stuck).toBe(false);
    expect(solver.strain).toBeCloseTo(0, 5);
  });

  it('strain rises before a stall breaks', () => {
    const solver = stalled(1.05, BallVerb.Chest);
    const shove = vec3(4, 0, 0);

    let previous = solver.strain;
    let rose = false;

    for (let tick = 1; tick <= 20 && solver.stuck; tick++) {
      solver.solve(input(ZERO, { ballPosition: at(1.05), ownerIntent: scale(shove, tick) }), SETTINGS);

      rose ||= solver.strain > previous;
      previous = solver.strain;
    }

    expect(rose, 'the warning must be visible before the ball is lost').toBe(true);
    expect(previous).toBeGreaterThanOrEqual(0);
    expect(previous).toBeLessThanOrEqual(1);
  });
});

// --- Speed: pressing is how you go fast -------------------------------------

describe('speed: pressing is how you go fast', () => {
  it('the factor is the levels after an automatic keep up', () => {
    const solver = picked(0.8);

    solver.solve(input(DOWN, { ballPosition: at(0.55) }), SETTINGS);

    expect(solver.speedFactor).toBeCloseTo(0.5, 5);
  });

  it('a knock on frees the legs once the ball is away', () => {
    const solver = new BounceSolver();
    solver.requestBounce(0.4);

    solver.solve(input(DOWN, { grounded: true }), SETTINGS);
    expect(solver.speedFactor).toBeCloseTo(0.6, 5);

    solver.solve(input(ZERO, { ballPosition: vec3(0, 0.3, -2.2) }), SETTINGS);
    expect(solver.speedFactor).toBeCloseTo(1, 5);
  });

  it.each([
    [0.0, 0.6],
    [0.65, 0.6],
    [1.075, 0.8],
    [1.5, 1],
    [3.0, 1],
  ] as const)('the cap ramps with how far the ball has got away (%s m -> %s)', (distance, expected) => {
    const solver = new BounceSolver();

    solver.solve(input(ZERO, { ballPosition: vec3(0, 0.3, -distance) }), SETTINGS);

    expect(solver.speedFactor).toBeCloseTo(expected, 4);
  });

  it('tapping at head level never buys speed', () => {
    const solver = picked(1.7);
    expect(solver.level).toBe(BallVerb.Head);

    for (let touch = 1; touch <= 10; touch++) {
      solver.requestBounce(1.9);

      solver.solve(input(DOWN, { ballPosition: at(1.55) }), SETTINGS);
      expect(solver.speedFactor <= 0.3 + 1e-4, `touch ${touch} lifted the cap to ${solver.speedFactor}`).toBe(true);

      // Up at the apex and still on you: re-arms for the next one.
      solver.solve(input(ZERO, { ballPosition: at(1.9) }), SETTINGS);
      expect(solver.speedFactor <= 0.3 + 1e-4, `flight ${touch} lifted the cap to ${solver.speedFactor}`).toBe(true);
    }
  });

  it('the next automatic keep up restores the levels factor', () => {
    const solver = new BounceSolver();
    solver.requestBounce(0.4);
    const sent = solver.solve(input(DOWN, { grounded: true }), SETTINGS);
    solver.solve(input(sent, { ballPosition: at(0.3) }), SETTINGS);

    solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(solver.speedFactor).toBeCloseTo(0.6, 5);
  });

  it('a ball out of reach lifts the factor too', () => {
    const solver = picked(0.8);
    solver.solve(input(DOWN, { ballPosition: at(0.55) }), SETTINGS);
    expect(solver.speedFactor).toBeCloseTo(0.5, 5);

    solver.solve(input(DOWN, { ballPosition: at(0.7, 2) }), SETTINGS);

    expect(solver.inReach).toBe(false);
    expect(solver.speedFactor).toBeCloseTo(1, 5);
  });
});

// --- Pickup: the ball tells you where it is ---------------------------------

describe('pickup: the ball tells you where it is', () => {
  it('a pickup on the ground is a foot ball', () => {
    const solver = picked(RADIUS);

    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.speedFactor).toBeCloseTo(0.6, 5);
    expect(solver.targetApex).toBeCloseTo(0.4, 5);
  });

  it('a pickup at chest height is a chest ball armed for the first crossing', () => {
    const solver = pickedIn(BOUNCING, 1.2);
    expect(solver.level).toBe(BallVerb.Chest);

    const result = solver.solve(input(DOWN, { ballPosition: at(1.05) }), BOUNCING);

    expect(result.y).toBeCloseTo(riseSpeed(1.4 - 1.05), 4);
    expect(solver.lastTouch).toBe(TouchKind.KeepUp);
  });

  it('a pickup clears the commanded flag', () => {
    const solver = new BounceSolver();
    solver.requestBounce(0.4);
    solver.solve(input(DOWN, { grounded: true }), SETTINGS);
    expect(solver.commanded).toBe(true);

    solver.onPickedUp(RADIUS, SETTINGS);

    expect(solver.commanded).toBe(false);
  });
});

// --- Reach: a miss costs a level, never the ball ----------------------------

describe('reach: a miss costs a level, never the ball', () => {
  it('out of reach a crossing is a miss and the ball keeps falling', () => {
    const solver = picked(0.8);

    const result = solver.solve(input(DOWN, { ballPosition: at(0.55, 2) }), SETTINGS);

    expect(result.y).toBeCloseTo(DOWN.y, 5);
    expect(solver.touches).toBe(0);
    expect(solver.inReach).toBe(false);
  });

  it('a missed ball is picked up by the foot when grounded within reach', () => {
    const solver = picked(0.8);
    solver.solve(input(DOWN, { ballPosition: at(0.55, 2) }), SETTINGS);

    const result = solver.solve(input(DOWN, { ballPosition: at(RADIUS, 1), grounded: true }), SETTINGS);

    expect(solver.level).toBe(BallVerb.Foot);
    expect(result.y).toBeCloseTo(riseSpeed(0.4 - RADIUS), 4);
    expect(solver.touches).toBe(1);
    expect(solver.inReach).toBe(true);
  });

  it('a grounded ball out of reach is left to roll', () => {
    const solver = new BounceSolver();
    const rolling = vec3(1, 0, 0);

    const result = solver.solve(input(rolling, { ballPosition: at(RADIUS, 2), grounded: true }), SETTINGS);

    expectVec(result, rolling);
    expect(solver.touches).toBe(0);
  });

  it('KeepUpReach no longer gates the touch', () => {
    const solver = picked(0.8);
    const settings: BounceSettings = { ...SETTINGS, KeepUpReach: 0 };

    solver.solve(input(DOWN, { ballPosition: at(0.55, 3) }), settings);

    expect(solver.inReach).toBe(false);
    expect(solver.touches).toBe(0);
  });
});

// --- S14: the hold rides the jump -------------------------------------------

describe('S14: the hold rides the jump', () => {
  it('a chest stall rides the jump', () => {
    const solver = stalled(1.05, BallVerb.Chest);

    const velocity = solver.solve(input(ZERO, { ballPosition: at(1.05), ownerRise: 0.8 }), SETTINGS);

    // Micro-motion is a few centimetres; the rise is 0.8 m.
    expect(velocity.y * STEP).toBeGreaterThanOrEqual(0.75);
    expect(velocity.y * STEP).toBeLessThanOrEqual(0.85);
    expect(solver.stuck).toBe(true);
  });

  it('a held ball never leaves the body across a full parabola', () => {
    const solver = stalled(1.05, BallVerb.Chest);
    let ball = at(1.05);
    let velocity = ZERO;
    const jump = 5.2;
    const flight = (2 * jump) / GRAVITY;

    for (let t = 0; t < flight; t += STEP) {
      const rise = Math.max(jump * t - 0.5 * GRAVITY * t * t, 0);
      velocity = solver.solve(input(velocity, { ballPosition: ball, ownerRise: rise }), SETTINGS);
      ball = add(ball, scale(velocity, STEP));

      expect(solver.stuck, `the ball came off at t = ${t.toFixed(2)}`).toBe(true);
      const off = ball.y - (rise + 1.05);
      expect(off).toBeGreaterThanOrEqual(-0.06);
      expect(off).toBeLessThanOrEqual(0.06);
    }
  });

  it('no chest touch fires early mid jump', () => {
    const solver = picked(1.2);

    solver.solve(input(DOWN, { ballPosition: at(1.3), ownerRise: 0.6 }), SETTINGS);

    expect(solver.touches).toBe(0);
    expect(solver.stuck).toBe(false);
  });
});

// --- S15: the body part is read from the body -------------------------------

describe('S15: the body part is read from the body', () => {
  it('a jump under a dropping ball meets it at the chest not the head', () => {
    const solver = picked(1.7);
    expect(solver.level).toBe(BallVerb.Head);

    solver.solve(input(DOWN, { ballPosition: at(1.55), ownerRise: 0.5 }), SETTINGS);

    expect(solver.touches).toBe(1);
    expect(solver.level).toBe(BallVerb.Chest);
    expect(solver.stuck).toBe(true);
  });

  it('a grounded touch is never demoted', () => {
    const solver = picked(1.2);

    solver.solve(input(DOWN, { ballPosition: at(1.05) }), SETTINGS);

    expect(solver.touches).toBe(1);
    expect(solver.level).toBe(BallVerb.Chest);
  });

  it.each([
    [BallVerb.Foot, 0.5, BallVerb.Foot],
    [BallVerb.Thigh, 0, BallVerb.Thigh],
    [BallVerb.Chest, 0, BallVerb.Chest],
    [BallVerb.Head, 0, BallVerb.Head],
    [BallVerb.Head, 0.5, BallVerb.Chest],
    [BallVerb.Head, 1.0, BallVerb.Thigh],
    [BallVerb.Chest, 0.3, BallVerb.Thigh],
    [BallVerb.Chest, 1.0, BallVerb.Foot],
    [BallVerb.Thigh, 0.1, BallVerb.Foot],
  ] as const)('no promotion under any rise (level %s, rise %s m)', (level, rise, expected) => {
    expect(BounceSolver.partUnderTheBall(level, rise, SETTINGS)).toBe(expected);
  });

  it('a mid jump chest touch lands the ball on the chest not the floor', () => {
    const solver = picked(1.2);

    const velocity = solver.solve(input(DOWN, { ballPosition: at(1.05), ownerRise: 0.5 }), SETTINGS);

    expect(solver.level).toBe(BallVerb.Thigh);
    expect(solver.stuck).toBe(true);
    expect(velocity.y * STEP).toBeGreaterThanOrEqual(-0.06);
    expect(velocity.y * STEP).toBeLessThanOrEqual(0.06);
  });

  it('a ball caught above its part settles down onto it', () => {
    const solver = picked(1.2);
    let ball = at(1.05);

    let velocity = solver.solve(input(DOWN, { ballPosition: ball, ownerRise: 0.3 }), SETTINGS);
    expect(solver.level).toBe(BallVerb.Thigh);
    expect(Math.abs(velocity.y) < 3, `the first step snapped at ${velocity.y} m/s`).toBe(true);

    for (let i = 0; i < 240; i++) {
      ball = add(ball, scale(velocity, STEP));
      velocity = solver.solve(input(velocity, { ballPosition: ball, ownerRise: 0.3 }), SETTINGS);
    }

    expect(ball.y).toBeGreaterThanOrEqual(0.85 - 0.06);
    expect(ball.y).toBeLessThanOrEqual(0.85 + 0.06);
    expect(solver.stuck).toBe(true);
  });
});

// --- S13: reach is a forward arc, not a cylinder ----------------------------

describe('S13: reach is a forward arc, not a cylinder', () => {
  it('a ball behind is out of reach and untouched', () => {
    const solver = picked(0.8);

    const result = solver.solve(input(DOWN, { ballPosition: at(0.55, -0.7) }), SETTINGS);

    expect(solver.inReach).toBe(false);
    expect(solver.touches).toBe(0);
    expectVec(result, DOWN);
  });

  it('the same ball is played after turning onto it', () => {
    const solver = new BounceSolver();
    const rolling = vec3(0.2, 0, 0);
    const behind = at(RADIUS, -0.7);

    solver.solve(input(rolling, { ballPosition: behind, grounded: true }), SETTINGS);
    expect(solver.touches).toBe(0);

    solver.solve(input(rolling, { ballPosition: behind, grounded: true, ownerFacing: UNIT_Z }), SETTINGS);

    expect(solver.inReach).toBe(true);
    expect(solver.touches).toBe(1);
  });

  it('a chest stall survives a full pivot', () => {
    const solver = stalled(1.05, BallVerb.Chest);

    const velocity = solver.solve(input(ZERO, { ballPosition: at(1.05), ownerFacing: UNIT_Z }), SETTINGS);

    expect(solver.inReach).toBe(false);
    expect(solver.stuck).toBe(true);
    expect(solver.lastTouch).toBe(TouchKind.Stall);
    expect(velocity.z > 0, `the ball should be pulled round to the new front, got ${velocity.z}`).toBe(true);
  });

  it('a ball a little behind a standing player is still playable', () => {
    const solver = new BounceSolver();
    const rolling = vec3(0.2, 0, 0);

    solver.solve(input(rolling, { ballPosition: at(RADIUS, -0.2), grounded: true }), SETTINGS);

    expect(solver.inReach).toBe(true);
    expect(solver.touches).toBe(1);
  });

  it('behind never frees the legs', () => {
    const behind = picked(0.8);
    const ahead = picked(0.8);

    behind.solve(input(DOWN, { ballPosition: at(0.8, -1.2) }), SETTINGS);
    ahead.solve(input(DOWN, { ballPosition: at(0.8, 1.2) }), SETTINGS);

    expect(behind.speedFactor).toBeCloseTo(LEVELS.Thigh.SpeedFactor, 5);
    expect(ahead.speedFactor > LEVELS.Thigh.SpeedFactor, 'the same distance in front is on the ramp').toBe(true);
  });

  it('the line turns with the owner', () => {
    const solver = picked(0.8);
    const toTheirLeft = vec3(-1, 0.55, 0);

    solver.solve(input(DOWN, { ballPosition: toTheirLeft, ownerFacing: UNIT_X }), SETTINGS);

    expect(solver.inReach).toBe(false);
  });

  it('a ball wide and a little behind is playable', () => {
    const solver = picked(0.8);
    const wide = vec3(1.0, 0.55, 0.2);

    solver.solve(input(DOWN, { ballPosition: wide }), SETTINGS);

    expect(solver.inReach).toBe(true);
    expect(solver.touches).toBe(1);
  });

  it('an owner facing nowhere reaches all round', () => {
    const solver = picked(0.8);

    solver.solve(input(DOWN, { ballPosition: at(0.55, -1), ownerFacing: ZERO }), SETTINGS);

    expect(solver.inReach).toBe(true);
  });
});

// --- The launch fires on the next touch -------------------------------------

describe('the launch fires on the next touch', () => {
  it('a queued launch fires on the next touch with its own velocity', () => {
    const solver = new BounceSolver();
    queuePass(solver, vec3(3, 4, -5));

    const result = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(solver.launchFired).toBe(true);
    expectVec(result, solver.firedLaunch.Velocity);
    expect(length(result)).toBeCloseTo(12, 3);
    expect(solver.lastTouch).toBe(TouchKind.Launch);
  });

  it('a launch waits for the touch like a bounce', () => {
    const solver = new BounceSolver();
    queuePass(solver, vec3(3, 4, -5));

    const result = solver.solve(input(DOWN, { ballPosition: at(0.3) }), SETTINGS);

    expect(result.y).toBeCloseTo(DOWN.y, 5);
    expect(solver.launchPending).toBe(true);
    expect(solver.launchFired).toBe(false);
  });

  it('a launch beats a queued bounce', () => {
    const solver = new BounceSolver();
    solver.requestBounce(1.4);
    queuePass(solver, vec3(3, 4, -5));

    const result = solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    expect(solver.lastTouch).toBe(TouchKind.Launch);
    expectVec(result, solver.firedLaunch.Velocity);
    expect(solver.pendingApex).toBeNull();
  });

  it('NoteLaunched clears the flag and the queue', () => {
    const solver = new BounceSolver();
    queuePass(solver, vec3(3, 4, -5));
    solver.solve(input(DOWN, { grounded: true }), SETTINGS);

    solver.noteLaunched();

    expect(solver.launchFired).toBe(false);
    expect(solver.launchPending).toBe(false);
    expect(solver.commanded).toBe(false);
  });
});

// --- The pass is solved at fire time (S28) ----------------------------------

describe('the pass is solved at fire time (S28)', () => {
  it('a queued pass solves with the limb at fire time not at release', () => {
    const solver = stalled(1.05, BallVerb.Chest);
    solver.requestLaunch(request(vec3(0, 0.3, -1), FORWARD, 1, 1.8, Limb.Head), PASS_SETTINGS, PASS_BANDS);

    const result = solver.solve(input(ZERO, { ballPosition: at(1.05) }), SETTINGS);

    expect(solver.firedLaunch.Limb).toBe(Limb.Chest);
    expect(solver.firedLaunch.Part).toBe(PassPart.Chest);
    expect(length(result)).toBeCloseTo(12 * DEFAULT_PASS_PROFILES.Chest.PowerScale, 3);
  });

  it('a stalled chest pass fires immediately', () => {
    const solver = stalled(1.05, BallVerb.Chest);
    queuePass(solver, vec3(0, 1, -1));

    const result = solver.solve(input(ZERO, { ballPosition: at(1.05) }), SETTINGS);

    expect(solver.launchFired).toBe(true);
    expect(solver.firedLaunch.Part).toBe(PassPart.Chest);
    expect((Math.asin(result.y / length(result)) * 180) / Math.PI).toBeCloseTo(35, 2);
  });

  it('the backheel is judged on the facing at the contact', () => {
    const solver = new BounceSolver();
    solver.requestLaunch(request(vec3(0, 0.5, -1), UNIT_Z, 1, 0.2), PASS_SETTINGS, PASS_BANDS);

    solver.solve(input(DOWN, { grounded: true, ownerFacing: FORWARD }), SETTINGS);

    expect(solver.launchFired).toBe(true);
    expect(solver.firedLaunch.Part).toBe(PassPart.Foot);
    expect(length(solver.firedLaunch.Velocity)).toBeCloseTo(12, 3);
  });

  it('the queued request is readable until it fires', () => {
    const solver = new BounceSolver();
    queuePass(solver, vec3(3, 4, -5), 0.4);

    expect(solver.pendingLaunch?.ChargeSeconds).toBe(0.4);

    solver.solve(input(DOWN, { grounded: true }), SETTINGS);
    solver.noteLaunched();

    expect(solver.pendingLaunch).toBeNull();
  });
});

// --- Edges ------------------------------------------------------------------

describe('edges', () => {
  it('an unowned ball is never touched', () => {
    const solver = new BounceSolver();

    const result = solver.solve(input(DOWN, { grounded: true, hasOwner: false }), SETTINGS);

    expectVec(result, DOWN);
    expect(solver.touches).toBe(0);
  });

  it('easing never overshoots even at an absurd step', () => {
    const solver = new BounceSolver();
    const i: BounceInput = { ...input(ZERO, { ballPosition: at(0.3), ownerIntent: vec3(0, 0, -8) }), Step: 10 };

    const result = solver.solve(i, SETTINGS);

    expect(result.z).toBeCloseTo(-8 * 0.6, 4);
  });

  it('flight ease closes about a quarter of the gap over a tap flight', () => {
    const solver = new BounceSolver();
    let velocity = vec3(0, 1, -5);

    for (let tick = 0; tick < 69; tick++) {
      velocity = solver.solve(input(velocity, { ballPosition: at(0.3) }), SETTINGS);
    }

    expect(velocity.z).toBeGreaterThanOrEqual(-3.85);
    expect(velocity.z).toBeLessThanOrEqual(-3.65);
  });

  it('with flight ease off an airborne ball is pure ballistics', () => {
    const solver = new BounceSolver();
    const settings: BounceSettings = { ...SETTINGS, FlightEase: 0 };
    const velocity = vec3(2, 1, -5);

    const result = solver.solve(input(velocity, { ballPosition: at(0.3), ownerIntent: vec3(0, 0, -8) }), settings);

    expectVec(result, velocity);
  });
});

// --- S25: every level keeps up, on its own spot -----------------------------

describe('S25: every level keeps up, on its own spot', () => {
  it('the lead factor scales only the travel', () => {
    const chest: CarryLevel = { ...LEVELS.Chest, HoldOffset: 0.18 }; // LeadFactor 0.5

    expect(BounceSolver.keepUpLead(chest, 0, SETTINGS)).toBeCloseTo(0.18, 5);
    expect(BounceSolver.keepUpLead(chest, 3, SETTINGS)).toBeCloseTo(0.18 + 0.05 * 3 * 0.5, 5);
    expect(BounceSolver.keepUpLead(chest, -1, SETTINGS)).toBeCloseTo(0.18, 5);
  });

  it('a chest keep up lands on the sternum not inside it', () => {
    // Correction 1 so the landing is the aim itself; the lead factor is the shipped 0.5.
    const settings: BounceSettings = {
      ...BOUNCING,
      Levels: { ...BOUNCING.Levels, Chest: { ...BOUNCING.Levels.Chest, HoldOffset: 0.18, Correction: 1 } },
    };
    const chest = settings.Levels.Chest;
    const ball = vec3(0, chest.TouchHeight, 0); // straight above the owner

    const v = BounceSolver.touchVelocity(chest.Apex - chest.TouchHeight, DOWN, input(DOWN, { ballPosition: ball }), settings, chest);
    const flight = Ballistics.timeToReturn(v.y, GRAVITY);
    const ahead = -(ball.z + v.z * flight); // forward is -Z

    expect(ahead).toBeCloseTo(0.18, 3);
    expect(ahead >= 0.07 + RADIUS).toBe(true);
  });
});

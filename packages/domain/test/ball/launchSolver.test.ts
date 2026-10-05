import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { Limb } from '../../src/ball/limb.js';
import { LaunchSolver, type Launch } from '../../src/ball/launchSolver.js';
import { cross, dot, length, normalize, scale, ZERO, type Vec3 } from '../../src/vec.js';
import { FORWARD, TEST_BANDS, TEST_LAUNCH } from '../support/passFixtures.js';

// Port of LaunchSolverTests.cs.
const GRAVITY = 9.81;
const UNIT_Y: Vec3 = { x: 0, y: 1, z: 0 };
const UNIT_Z: Vec3 = { x: 0, y: 0, z: 1 };

const solve = (aim: Vec3, chargeSeconds: number, ballHeight = 0.2, facing: Vec3 = FORWARD): Launch =>
  LaunchSolver.solve({ Aim: aim, Facing: facing, ChargeSeconds: chargeSeconds, BallHeight: ballHeight, Limb: Limb.None }, TEST_LAUNCH, TEST_BANDS);

/** `Launch.Speed` in C#: the velocity's length. */
const speedOf = (launch: Launch): number => length(launch.Velocity);

/** A unit aim pitched up from the horizontal, facing -Z. */
function pitched(degrees: number): Vec3 {
  const r = (degrees * Math.PI) / 180;
  return { x: 0, y: Math.sin(r), z: -Math.cos(r) };
}

describe('LaunchSolver', () => {
  // --- power ---

  it.each([
    [0, 3.5],
    [0.5, 7.75],
    [1, 12],
  ])('hold time maps linearly to speed (%f s -> %f m/s)', (seconds, expectedSpeed) => {
    expect(speedOf(solve(FORWARD, seconds))).toBeCloseTo(expectedSpeed, 4);
  });

  // Releasing early gives a weaker shot, never a failure; holding past the charge time gives full power.
  it.each([
    [-0.5, 0],
    [3, 1],
  ])('charge ratio clamps to 0 1 (%f s -> %f)', (seconds, expectedRatio) => {
    expect(solve(FORWARD, seconds).ChargeRatio).toBe(expectedRatio);
  });

  it('a zero charge time cannot divide by zero', () => {
    const degenerate = { ...TEST_LAUNCH, ChargeTime: 0 };
    const ratio = LaunchSolver.chargeRatio(0.5, degenerate);

    expect(Number.isFinite(ratio)).toBe(true);
    expect(ratio).toBe(1);
  });

  // --- aim ---

  it('velocity points along the aim at the charged speed', () => {
    const aim: Vec3 = { x: 3, y: 4, z: 0 }; // deliberately not unit length
    const launch = solve(aim, 1);
    const speed = speedOf(launch);

    expect(speed).toBeCloseTo(12, 4);
    expect(launch.Velocity.x / speed).toBeCloseTo(normalize(aim).x, 4);
    expect(launch.Velocity.y / speed).toBeCloseTo(normalize(aim).y, 4);
  });

  // The S1 sanity check: at 50 degrees a tap is a dribble (0.37 m) and a full hold clears a wall (4.3 m).
  it.each([
    [0, 0.37],
    [1, 4.3],
  ])('at 50 degrees the S1 apexes hold (%f s -> %f m)', (seconds, expectedApex) => {
    const launch = solve(pitched(50), seconds);
    const apex = Ballistics.apexForVerticalSpeed(launch.Velocity.y, GRAVITY);

    expect(apex).toBeGreaterThanOrEqual(expectedApex - 0.01);
    expect(apex).toBeLessThanOrEqual(expectedApex + 0.01);
  });

  // Looking up lofts; looking down drives.
  it('the same charge aimed higher reaches higher', () => {
    const low = solve(pitched(20), 0.5).Velocity.y;
    const high = solve(pitched(70), 0.5).Velocity.y;

    expect(high).toBeGreaterThan(low);
  });

  it('no aim falls back to the body facing', () => {
    const facing = normalize({ x: 1, y: 0, z: -1 });
    const launch = solve(ZERO, 1, 0.2, facing);

    expect(launch.Velocity.x).toBeCloseTo(facing.x * 12, 4);
    expect(launch.Velocity.y).toBeCloseTo(0, 4);
    expect(launch.Velocity.z).toBeCloseTo(facing.z * 12, 4);
  });

  it('no aim and no facing still launches forward', () => {
    const launch = solve(ZERO, 1, 0.2, ZERO);

    expect(speedOf(launch)).toBeCloseTo(12, 4);
    expect(launch.Velocity.z).toBeLessThan(0);
  });

  // --- verb ---

  it.each([
    [0.2, BallVerb.Foot],
    [0.7, BallVerb.Thigh],
    [1.2, BallVerb.Chest],
    [1.8, BallVerb.Head],
  ])('verb comes from the ball height not the charge (%f m -> %i)', (height, expected) => {
    expect(solve(FORWARD, 0, height).Verb).toBe(expected);
    expect(solve(FORWARD, 1, height).Verb).toBe(expected);
  });

  it('aiming behind a foot height ball is a backheel', () => {
    // The body faces -Z.
    expect(solve(UNIT_Z, 0.5, 0.2).Verb).toBe(BallVerb.Backheel);
  });

  // A header is a header whichever way you are facing.
  it.each([
    [0.7, BallVerb.Thigh],
    [1.2, BallVerb.Chest],
    [1.8, BallVerb.Head],
  ])('aiming behind a higher ball keeps its height verb (%f m -> %i)', (height, expected) => {
    expect(solve(UNIT_Z, 0.5, height).Verb).toBe(expected);
  });

  // The threshold is about 110 degrees from facing.
  it.each([
    [90, false],
    [100, false],
    [120, true],
    [180, true],
  ])('behind begins past 110 degrees from facing (%f degrees -> %s)', (degreesFromFacing, expected) => {
    const r = (degreesFromFacing * Math.PI) / 180;
    // Rotate the facing (-Z) about Y by the given angle.
    const aim: Vec3 = { x: Math.sin(r), y: 0, z: -Math.cos(r) };

    expect(LaunchSolver.isBehind(aim, FORWARD)).toBe(expected);
  });

  it('backheel ignores pitch and uses only the flat aim', () => {
    const behindAndUp = normalize({ x: 0, y: 1, z: 1 });
    expect(LaunchSolver.isBehind(behindAndUp, FORWARD)).toBe(true);
  });

  it('straight up is never behind', () => {
    expect(LaunchSolver.isBehind(UNIT_Y, FORWARD)).toBe(false);
    expect(solve(UNIT_Y, 0.5, 0.2).Verb).toBe(BallVerb.Foot);
  });

  // --- spin ---

  it('spin scales with charge', () => {
    expect(length(solve(FORWARD, 0).Spin)).toBeCloseTo(0, 4);
    expect(length(solve(FORWARD, 0.5).Spin)).toBeCloseTo(3, 4);
    expect(length(solve(FORWARD, 1).Spin)).toBeCloseTo(6, 4);
  });

  it('spin axis is horizontal and perpendicular to the aim', () => {
    const aim = normalize({ x: 1, y: 0.5, z: -1 });
    const spin = solve(aim, 1).Spin;

    expect(spin.y).toBeCloseTo(0, 5);
    expect(dot(spin, aim)).toBeCloseTo(0, 4);
  });

  // GDD 3.3: a foot drive carries topspin, so it kicks on when it lands instead of checking up.
  it.each([
    [0, 0, -1],
    [1, 0, 0],
    [1, 0.4, 1],
  ])('spin is topspin (%f, %f, %f)', (ax, ay, az) => {
    const aim = normalize({ x: ax, y: ay, z: az });

    // Faced the way it is aimed: a ball aimed behind is a backheel, and a backheel has no topspin (S28).
    const spin = solve(aim, 1, 0.2, { x: ax, y: 0, z: az }).Spin;

    const topOfBall = scale(UNIT_Y, 0.11);
    const topVelocity = cross(spin, topOfBall);
    const travelFlat: Vec3 = { x: aim.x, y: 0, z: aim.z };

    expect(dot(topVelocity, travelFlat)).toBeGreaterThan(0);
  });

  // Straight up is not a foot pass: the foot's loft window tops out at 70 degrees (S28).
  it('a vertical aim is clamped to the foot loft ceiling', () => {
    const launch = solve(UNIT_Y, 1);
    const pitch = (Math.asin(launch.Velocity.y / speedOf(launch)) * 180) / Math.PI;

    expect(pitch).toBeCloseTo(70, 3);
    expect(length(launch.Spin)).toBeGreaterThanOrEqual(0.01);
    expect(length(launch.Spin)).toBeLessThanOrEqual(length(solve(FORWARD, 1).Spin));
  });
});

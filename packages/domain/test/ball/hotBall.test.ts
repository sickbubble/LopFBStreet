import { describe, expect, it } from 'vitest';
import {
  BallState,
  NO_OWNER,
  PossessionArbiter,
  ReceptionSolver,
  ZERO,
  type PossessionCandidate,
  type PossessionSettings,
  type ReceptionSettings,
  type Vec3,
} from '../../src/index.js';

/**
 * A ball too hot to catch: the ricochet off the body, and the timed tap that
 * catches it anyway. The Godot build's S5, as tests. Port of
 * `Ball/HotBallTests.cs`.
 */

const GRAVITY = 9.81;
const BALL_RADIUS = 0.11;
const BODY_RADIUS = 0.35;
const BODY_HEIGHT = 1.8;
const RESTITUTION = 0.4;
const STEP = 1 / 120;

const POSSESSION: PossessionSettings = { Radius: 2.5, OwnershipMargin: 0.5, OwnershipDwell: 0.2, TouchCooldown: 0.15 };
const RECEPTION: ReceptionSettings = { CatchSpeed: 9, RicochetRestitution: RESTITUTION, CatchWindow: 0.12 };

const ricochet = (position: Vec3, velocity: Vec3, bodyVelocity: Vec3 = ZERO): Vec3 | null =>
  ReceptionSolver.ricochet(position, velocity, BALL_RADIUS, ZERO, bodyVelocity, BODY_RADIUS, BODY_HEIGHT, RESTITUTION);

describe('a hot ball', () => {
  // --- closest approach

  it('a ball coming straight in passes closest when it reaches the player', () => {
    const a = ReceptionSolver.closestApproach({ x: 0, y: 1, z: -6 }, { x: 0, y: 0, z: 12 }, GRAVITY, 1, 0.12);

    expect(a.Time).toBeCloseTo(0.5, 4);
    expect(a.Separation).toBeCloseTo(0, 4);
    expect(a.Height).toBeCloseTo(1 - 0.5 * GRAVITY * 0.25, 4);
  });

  it('a ball passing by keeps its miss distance', () => {
    const a = ReceptionSolver.closestApproach({ x: 1.5, y: 1, z: -4 }, { x: 0, y: 0, z: 10 }, GRAVITY, 1, 0.12);

    expect(a.Time).toBeCloseTo(0.4, 4);
    expect(a.Separation).toBeCloseTo(1.5, 4);
  });

  /** Only the window matters: a moment further ahead than it is clamped, and one long past is clamped behind. */
  it('the approach is clamped into the window', () => {
    const far = ReceptionSolver.closestApproach({ x: 0, y: 1, z: -20 }, { x: 0, y: 0, z: 10 }, GRAVITY, 0.3, 0.12);
    const past = ReceptionSolver.closestApproach({ x: 0, y: 1, z: 5 }, { x: 0, y: 0, z: 10 }, GRAVITY, 0.3, 0.12);

    expect(far.Time).toBeCloseTo(0.3, 5);
    expect(past.Time).toBeCloseTo(-0.12, 5);
  });

  /** A ball dropped straight on the player has no flat motion: its closest approach is now. */
  it('a ball with no flat motion is closest now', () => {
    expect(ReceptionSolver.closestApproach({ x: 0.2, y: 3, z: 0 }, { x: 0, y: -11, z: 0 }, GRAVITY, 1, 0.12).Time + 0).toBe(0);
  });

  // --- the timed catch

  it.each([
    [10.0, 0.1, 10.0, true], // tapped just now, contact 0.10 s away
    [10.0, 0.2, 10.0, false], // too early
    [10.0, 0.05, 9.95, true], // tapped a little before, contact soon
    [10.0, -0.05, 10.0, true], // tapped just after it went by
    [10.0, -0.1, 9.7, false], // an old tap
  ])('a tap inside the window of the approach is a catch (now %s, approach in %s, tap %s)', (now, approachIn, tap, expected) => {
    expect(ReceptionSolver.isTimedCatch(now, approachIn, tap, 0.12)).toBe(expected);
  });

  it('no tap is no catch', () => {
    expect(ReceptionSolver.isTimedCatch(10.0, 0, null, 0.12)).toBe(false);
  });

  /** Over CatchSpeed, a hot ball in flight is refused -- unless the nearest player timed a tap to it. */
  it('a timed tap catches a ball too hot to catch', () => {
    const candidates: PossessionCandidate[] = [{ PlayerId: 1, Distance: 1.0 }];

    const untimed = new PossessionArbiter();
    untimed.step(candidates, {
      State: BallState.Flight,
      BallSpeed: 12,
      Clock: 5.0,
      Delta: STEP,
      Settings: POSSESSION,
      Reception: RECEPTION,
    });

    const timed = new PossessionArbiter();
    timed.step(candidates, {
      State: BallState.Flight,
      BallSpeed: 12,
      Clock: 5.0,
      Delta: STEP,
      Settings: POSSESSION,
      Reception: RECEPTION,
      TimedCatcher: 1,
    });

    expect(untimed.ownerId).toBe(NO_OWNER);
    expect(timed.ownerId).toBe(1);
  });

  /** Someone else's timing catches nothing for you. */
  it('only the player who timed it catches it', () => {
    const candidates: PossessionCandidate[] = [
      { PlayerId: 1, Distance: 1.0 },
      { PlayerId: 2, Distance: 2.0 },
    ];
    const arbiter = new PossessionArbiter();

    arbiter.step(candidates, {
      State: BallState.Flight,
      BallSpeed: 12,
      Clock: 5.0,
      Delta: STEP,
      Settings: POSSESSION,
      Reception: RECEPTION,
      TimedCatcher: 2,
    });

    expect(arbiter.ownerId).toBe(NO_OWNER);
  });

  // --- the ricochet

  it('a hot ball into the chest comes back off it softer', () => {
    const after = ricochet({ x: 0, y: 1.2, z: -0.4 }, { x: 0, y: -1, z: 12 });

    expect(after).not.toBeNull();
    expect(after!.z).toBeCloseTo(-12 * RESTITUTION, 4);
    expect(after!.y).toBeCloseTo(-1, 4);
  });

  /** The body's own motion counts: running into a ball hits it harder. */
  it('the ricochet is in the body frame', () => {
    const run: Vec3 = { x: 0, y: 0, z: -5 };
    const after = ricochet({ x: 0, y: 1.2, z: -0.4 }, { x: 0, y: 0, z: 10 }, run);

    // Relative 15 m/s in, 6 m/s out, plus the body's own -5.
    expect(after).not.toBeNull();
    expect(after!.z).toBeCloseTo(-5 - 15 * RESTITUTION, 4);
  });

  /** A glancing ball keeps its sideways travel and loses only what went into the body. */
  it('a glancing ball keeps its tangent', () => {
    const after = ricochet({ x: -0.4, y: 1.2, z: 0 }, { x: 10, y: 0, z: 5 });

    expect(after).not.toBeNull();
    expect(after!.x).toBeCloseTo(-10 * RESTITUTION, 4);
    expect(after!.z).toBeCloseTo(5, 4);
  });

  it.each([
    [1.0, 1.2, 0], // wide of the body
    [0, 2.1, -0.3], // over the head
  ])('a ball clear of the body is left alone (%s, %s, %s)', (x, y, z) => {
    expect(ricochet({ x, y, z }, { x: 0, y: 0, z: 12 })).toBeNull();
  });

  /** Once it is coming off, it is not hit again while it still overlaps: one ricochet, not one per step. */
  it('a ball already leaving is not ricocheted again', () => {
    expect(ricochet({ x: 0, y: 1.2, z: -0.4 }, { x: 0, y: 0, z: -4.8 })).toBeNull();
  });
});

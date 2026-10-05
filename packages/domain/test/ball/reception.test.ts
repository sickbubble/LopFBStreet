import { describe, expect, it } from 'vitest';
import {
  Ballistics,
  BallVerb,
  BounceSolver,
  ContactPlanner,
  length,
  Limb,
  ReceptionSolver,
  STANDING,
  TouchKind,
  ZERO,
  type BounceInput,
  type ContactPlan,
  type Vec3,
} from '../../src/index.js';
import {
  expectVec,
  GRAVITY,
  MANNEQUIN,
  RADIUS,
  SHIPPED_BOUNCE,
  SHIPPED_FOLLOW,
  SHIPPED_LEVELS,
  SHIPPED_TRAP,
  SPRINT_SPEED,
  STEP,
} from '../support/carrySim.js';
import { CarryLevelCheck } from '../../src/tuning/carryLevelCheck.js';

/**
 * The first touch of a ball not under control: the Godot build's S24. The trap
 * is automatic and by height; a bounce released as the ball arrives makes it
 * the perfect reception. Shipped numbers throughout. Port of
 * `Ball/ReceptionTests.cs`.
 */

const SETTINGS = SHIPPED_BOUNCE;
const TRAP = SHIPPED_TRAP;

const ahead = (height: number, distance: number): Vec3 => ({ x: 0, y: height, z: -distance });

/** Godot forward is -Z. */
const FORWARD: Vec3 = { x: 0, y: 0, z: -1 };

const input = (ball: Vec3, velocity: Vec3, ownerVelocity: Vec3 = ZERO, grounded = false): BounceInput => ({
  BallPosition: ball,
  BallVelocity: velocity,
  HasOwner: true,
  OwnerPosition: ZERO,
  OwnerVelocity: ownerVelocity,
  OwnerIntent: ownerVelocity,
  OwnerFacing: FORWARD,
  OwnerRise: 0,
  OwnerStride: STANDING,
  OwnerBody: MANNEQUIN,
  IsGrounded: grounded,
  BallRadius: RADIUS,
  Step: STEP,
  EffectiveGravity: GRAVITY,
  OwnerFollow: SHIPPED_FOLLOW,
});

/** A real pickup: the ball is owned, not yet under control. */
function picked(height: number): BounceSolver {
  const solver = new BounceSolver();
  solver.onPickedUp(height, SETTINGS);
  expect(solver.controlled).toBe(false);
  return solver;
}

const trapPlan = (i: BounceInput): ContactPlan =>
  ContactPlanner.plan(i, BallVerb.Head, false, Limb.None, TouchKind.Trap, SETTINGS, false);

/** The same, with no last step: which part reaches from where the owner stands. */
const trapPlanStanding = (i: BounceInput): ContactPlan =>
  trapPlan({ ...i, OwnerFollow: { ...SHIPPED_FOLLOW, ...i.OwnerFollow, TrapAssist: 0 } });

/** At the instep, on the way down: the first touch of a picked-up ball. */
function trapAtTheFoot(incoming: number): { solver: BounceSolver; velocity: Vec3 } {
  const solver = picked(0.8);
  const velocity = solver.solve(input(ahead(0.249, 0.3), { x: 0, y: -2, z: incoming }), SETTINGS);
  return { solver, velocity };
}

describe('the reception', () => {
  // --- The rebound

  it('the rebound goes back the way the ball came', () => {
    const back = ReceptionSolver.rebound({ x: 0, y: 3, z: 4 }, TRAP);

    expectVec(back, { x: 0, y: 0, z: -1.2 });
  });

  it('the rebound is capped', () => {
    const back = ReceptionSolver.rebound({ x: 0, y: 0, z: 20 }, TRAP);

    expect(length(back)).toBeCloseTo(TRAP.MaxResidual, 4);
  });

  it('a ball arriving with the owner is a clean trap', () => {
    expectVec(ReceptionSolver.rebound(ZERO, TRAP), ZERO);
  });

  // --- The plan

  /**
   * The highest part that can reach it on the way down, from where the owner
   * stands. Straight ahead and close, the chest; a little further, past the
   * chest's 0.30 m, the thigh; and a ball dropping from above the head is
   * still met at the chest.
   */
  it.each([
    [0.2, BallVerb.Chest],
    [0.36, BallVerb.Thigh],
    [0.05, BallVerb.Chest],
  ])(
    'a dropping ball is trapped at the highest part that reaches it never the head (%s m ahead)',
    (distance, expected) => {
      const plan = trapPlanStanding(input(ahead(2.0, distance), ZERO));

      expect(plan.Reachable).toBe(true);
      expect(plan.Level).toBe(expected);
      expect(plan.Kind).toBe(TouchKind.Trap);
    },
  );

  /** With the last step: the chest ball just past the chest's reach is still the chest's. */
  it('the last step brings the higher part to the ball', () => {
    const plan = trapPlan(input(ahead(2.0, 0.36), ZERO));

    expect(plan.Reachable).toBe(true);
    expect(plan.Following).toBe(true);
    expect(plan.Level).toBe(BallVerb.Chest);
  });

  /** Beyond every part's reach, and beyond the last step: the plan is the landing, shown as a miss. */
  it('a ball out of every reach is planned at its landing', () => {
    const plan = trapPlan(input(ahead(1.2, 1.5), ZERO));

    expect(plan.Reachable).toBe(false);
    expect(plan.Following).toBe(false);
    expect(plan.Level).toBe(BallVerb.Foot);
    expect(plan.Kind).toBe(TouchKind.Scoop);
    const landing = Ballistics.timeToDescendTo(1.2 - RADIUS, 0, GRAVITY);
    expect(landing).not.toBeNull();
    expect(plan.TimeToContact).toBeCloseTo(landing!, 3);
  });

  /** No chase. Two metres away the ball is the player's to go and get; a hair beyond reach, the body takes the last step. */
  it('a loose ball two metres away is never followed but the last step is taken', () => {
    const far = trapPlan(input(ahead(1.2, 2.0), ZERO));
    const near = trapPlan(input(ahead(1.2, 0.62), ZERO));

    expect(far.Following).toBe(false);
    expect(far.Reachable).toBe(false);

    expect(near.Following).toBe(true);
    expect(near.Reachable).toBe(true);
  });

  // --- The untimed trap

  it('an untimed trap takes the ball to the feet under control', () => {
    const { solver } = trapAtTheFoot(3);

    expect(solver.touches).toBe(1);
    expect(solver.lastTouch).toBe(TouchKind.Trap);
    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.controlled).toBe(true);
  });

  /** A ball coming in hard is a heavier touch: it pops higher and comes off further ahead. */
  it('an untimed trap pops ahead worse the faster it comes', () => {
    const slow = trapAtTheFoot(1).velocity;
    const fast = trapAtTheFoot(6).velocity;

    expect(fast.y > slow.y, 'a hard ball pops higher').toBe(true);
    expect(fast.z < slow.z, 'and comes off further ahead (forward is -Z)').toBe(true);
  });

  it('an untimed chest trap drops to the feet', () => {
    const solver = picked(1.5);

    // Just under the chest's own surface, so the chest is the highest part
    // that can still take it. Read from the table rather than written down.
    const atTheChest = SHIPPED_LEVELS.Chest.TouchHeight - 0.001;

    const velocity = solver.solve(input(ahead(atTheChest, 0.14), { x: 0, y: -2, z: 0 }), SETTINGS);

    expect(solver.lastTouch).toBe(TouchKind.Trap);
    expect(solver.lastLimb).toBe(Limb.Chest);
    expect(solver.level).toBe(BallVerb.Foot);
    expect(velocity.y <= 0, 'it falls to the feet rather than being popped back up').toBe(true);
  });

  it('the trap fires once', () => {
    const { solver } = trapAtTheFoot(2);

    solver.solve(input(ahead(0.25, 0.3), { x: 0, y: 2, z: 0 }), SETTINGS);

    expect(solver.touches).toBe(1);
  });

  // --- The perfect reception

  it('a tap just before the contact is a perfect reception', () => {
    const solver = picked(0.8);
    const apex = 1.15; // inside the thigh band, 1.05-1.25

    solver.requestBounce(apex);
    for (let i = 0; i < 10; i++) {
      solver.solve(input(ahead(3, 0.3), ZERO), SETTINGS); // 0.08 s, the ball still high
    }

    const velocity = solver.solve(input(ahead(0.249, 0.3), { x: 0, y: -2, z: 4 }), SETTINGS);

    expect(solver.lastTouch).toBe(TouchKind.Reception);
    expect(solver.level).toBe(BallVerb.Thigh);
    expect(velocity.y).toBeCloseTo(Ballistics.verticalSpeedForApex(apex - 0.249, GRAVITY), 3);
    expect(solver.pendingApex).toBeNull();
  });

  /**
   * Clean: the whole gap closed, no rebound. A standing owner's perfect
   * reception lands the ball on the level's own spot whatever it came in at.
   */
  it('a perfect reception has no rebound', () => {
    const solver = picked(0.8);
    solver.requestBounce(0.6); // a tap: the foot

    const ball = ahead(0.249, 0.3);
    const v = solver.solve(input(ball, { x: 0, y: -2, z: 6 }), SETTINGS);

    const flight = Ballistics.timeToReturn(v.y, GRAVITY);
    const landsAhead = -(ball.z + v.z * flight);
    expect(landsAhead).toBeCloseTo(SETTINGS.Levels.Foot.HoldOffset, 2);
  });

  it('a tap older than the window is dropped and the trap is untimed', () => {
    const solver = picked(0.8);
    solver.requestBounce(1.15);

    for (let i = 0; i < 20; i++) {
      solver.solve(input(ahead(3, 0.3), ZERO), SETTINGS); // 0.17 s: past the 0.12 s window
    }

    solver.solve(input(ahead(0.249, 0.3), { x: 0, y: -2, z: 4 }), SETTINGS);

    expect(solver.lastTouch).toBe(TouchKind.Trap);
    expect(solver.level).toBe(BallVerb.Foot);
    expect(solver.pendingApex).toBeNull();
  });

  /** A tap a fraction late still counts: the second touch that settles it. */
  it('a tap just after an untimed trap is perfect', () => {
    const { solver, velocity: trapped } = trapAtTheFoot(4);

    solver.requestBounce(0.6);
    solver.solve(input(ahead(0.26, 0.3), trapped), SETTINGS);

    expect(solver.touches).toBe(2);
    expect(solver.lastTouch).toBe(TouchKind.Reception);
  });

  it('past the window after a trap the tap waits for the next touch', () => {
    const { solver, velocity: trapped } = trapAtTheFoot(4);
    const rising = { ...trapped, y: 1 };

    for (let i = 0; i < 20; i++) {
      solver.solve(input(ahead(0.5, 0.3), rising), SETTINGS);
    }

    solver.requestBounce(0.6);
    solver.solve(input(ahead(0.5, 0.3), rising), SETTINGS);

    expect(solver.touches).toBe(1);
    expect(solver.pendingApex).toBe(0.6);
  });

  // --- The floor is kept

  it('the shipped trap stays inside the follow', () => {
    expect(CarryLevelCheck.untimedTrapStaysInsideTheFollow(TRAP, SETTINGS.Levels.Foot, SPRINT_SPEED)).toBe(true);
    expect(CarryLevelCheck.untimedTrapStaysInsideTheFollow({ ...TRAP, MaxResidual: 3.5 }, SETTINGS.Levels.Foot, SPRINT_SPEED)).toBe(false);
  });
});

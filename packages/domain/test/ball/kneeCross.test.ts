import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { BounceSolver } from '../../src/ball/bounceSolver.js';
import { TouchKind, type BounceInput } from '../../src/ball/contactPlan.js';
import { ContactPlanner } from '../../src/ball/contactPlanner.js';
import { BodySide, Limb, Limbs } from '../../src/ball/limb.js';
import { ContactSpot } from '../../src/ball/torso.js';
import { STANDING } from '../../src/body/strideClock.js';
import { FollowRule } from '../../src/player/followRule.js';
import type { BodyModel } from '../../src/tuning/bodyModel.js';
import { CarryLevelCheck } from '../../src/tuning/carryLevelCheck.js';
import { cross, dot, sub, UP, vec3, ZERO, type Vec3 } from '../../src/vec.js';
import {
  CarrySim,
  expectVec,
  GRAVITY,
  MANNEQUIN,
  RADIUS,
  SHIPPED_BOUNCE,
  SHIPPED_FOLLOW,
  SHIPPED_LEVELS,
  STEP,
} from '../support/carrySim.js';

/**
 * The knees cross. docs/IMPLEMENTATION.md S29, as tests: a thigh keep-up
 * sends the ball across to the other knee, each knee meets it in front of
 * its own hip, and the body does not sway to re-centre it. Port of
 * `KneeCrossTests.cs`.
 */

const Spot = 0.07;

/** The mannequin with S29's spot on. Its hips are 0.07 m out, so the spot is straight in front of each hip. */
const Crossing: BodyModel = { ...MANNEQUIN, ThighSpot: Spot };

const Centreline: BodyModel = { ...Crossing, ThighSpot: 0 };

/** Godot forward is -Z; the owner's right is then +X. */
const Forward: Vec3 = vec3(0, 0, -1);

const Down: Vec3 = vec3(0, -2.5, 0);

const Standing = (ball: Vec3, body: BodyModel): BounceInput => ({
  BallPosition: ball,
  BallVelocity: Down,
  HasOwner: true,
  OwnerPosition: ZERO,
  OwnerVelocity: ZERO,
  OwnerIntent: ZERO,
  OwnerFacing: Forward,
  OwnerRise: 0,
  OwnerStride: STANDING,
  OwnerBody: body,
  IsGrounded: false,
  BallRadius: RADIUS,
  Step: STEP,
  EffectiveGravity: GRAVITY,
});

/** Where a standing touch comes back down, sideways: the owner's right is +X. */
function LandsSideways(ball: Vec3, limb: Limb, body: BodyModel): number {
  const thigh = SHIPPED_LEVELS.Thigh;
  const v = BounceSolver.touchVelocity(thigh.Apex - thigh.TouchHeight, Down, Standing(ball, body), SHIPPED_BOUNCE, thigh, limb);
  const flight = Ballistics.timeToReturn(v.y, GRAVITY);

  return ball.x + v.x * flight;
}

describe('KneeCross', () => {
  // --- Where the spot is --------------------------------------------------------------------

  it('a thigh sends the ball to the other knee and meets it in front of its own', () => {
    expect(ContactSpot.aimed(Limb.LeftThigh, Crossing)).toBeCloseTo(Spot, 4);
    expect(ContactSpot.aimed(Limb.RightThigh, Crossing)).toBeCloseTo(-Spot, 4);
    expect(ContactSpot.arriving(Limb.LeftThigh, Crossing)).toBeCloseTo(-Spot, 4);
    expect(ContactSpot.arriving(Limb.RightThigh, Crossing)).toBeCloseTo(Spot, 4);
  });

  it('the feet the chest and the head still aim down the middle', () => {
    for (const limb of [Limb.LeftFoot, Limb.RightFoot, Limb.Chest, Limb.Head, Limb.None]) {
      expect(ContactSpot.aimed(limb, Crossing)).toBeCloseTo(0, 5);
      expect(ContactSpot.arriving(limb, Crossing)).toBeCloseTo(0, 5);
    }
  });

  // --- The touch ----------------------------------------------------------------------------

  it('a right knee touch lands the ball on the left knees spot exactly', () => {
    const onTheRightKnee = vec3(Spot, 0.85, -0.23);

    expect(LandsSideways(onTheRightKnee, Limb.RightThigh, Crossing)).toBeCloseTo(-Spot, 3);
    expect(LandsSideways({ ...onTheRightKnee, x: -Spot }, Limb.LeftThigh, Crossing)).toBeCloseTo(Spot, 3);
  });

  it('a zero spot is the centreline touch as before', () => {
    const ball = vec3(Spot, 0.85, -0.23);
    const correction = SHIPPED_LEVELS.Thigh.Correction;

    expect(LandsSideways(ball, Limb.RightThigh, Centreline)).toBeCloseTo(Spot * (1 - correction), 3);
  });

  it('a foot touch is unchanged by the knee spot', () => {
    const foot = SHIPPED_LEVELS.Foot;
    const ball = vec3(0.04, 0.25, -0.3);

    const crossing = BounceSolver.touchVelocity(
      foot.Apex - foot.TouchHeight,
      Down,
      Standing(ball, Crossing),
      SHIPPED_BOUNCE,
      foot,
      Limb.RightFoot,
    );
    const centre = BounceSolver.touchVelocity(
      foot.Apex - foot.TouchHeight,
      Down,
      Standing(ball, Centreline),
      SHIPPED_BOUNCE,
      foot,
      Limb.RightFoot,
    );

    expectVec(crossing, centre);
  });

  // --- The follow ---------------------------------------------------------------------------

  it('the follow stands the body so the ball arrives on the knee not the middle', () => {
    const point = vec3(1, 0.85, -2);

    const stand = FollowRule.standSpot(point, Forward, 0.23, 0, Spot);

    // The ball is 0.07 m to the right of where the body stands.
    expect(stand.x).toBeCloseTo(1 - Spot, 4);
    expect(stand.z).toBeCloseTo(-2 + 0.23, 4);
  });

  // --- End to end ---------------------------------------------------------------------------

  it('standing thigh keep ups swing the ball knee to knee', () => {
    const sim = new CarrySim({ body: Crossing });
    sim.run(1.2, ZERO);
    sim.solver.requestBounce(SHIPPED_LEVELS.Thigh.Apex);
    sim.run(2, ZERO);
    expect(sim.solver.level).toBe(BallVerb.Thigh);

    const sides: BodySide[] = [];
    const laterals: number[] = [];
    let leftmost = sim.owner.x;
    let rightmost = sim.owner.x;

    let seen = sim.solver.touches;
    for (let i = 0; i < 12 * 120 && sides.length < 20; i++) {
      const before = sim.ball;
      const owner = sim.owner;
      const right = cross(sim.facing, UP);
      sim.tick(ZERO, false);

      leftmost = Math.min(leftmost, sim.owner.x);
      rightmost = Math.max(rightmost, sim.owner.x);

      if (sim.solver.touches !== seen) {
        seen = sim.solver.touches;
        sides.push(Limbs.sideOf(sim.solver.lastLimb));
        laterals.push(dot(sub(before, owner), right));
      }
    }

    expect(sides.length).toBe(20);
    expect(sim.floorHits).toBe(0);
    expect(sim.solver.level).toBe(BallVerb.Thigh);

    for (let i = 0; i < sides.length; i++) {
      const side = sides[i]!;
      const lateral = laterals[i]!;
      expect(side).not.toBe(BodySide.None);
      if (i > 0) {
        expect(side).not.toBe(sides[i - 1]);
      }

      const expected = side === BodySide.Right ? Spot : -Spot;
      expect(
        Math.abs(lateral - expected),
        `touch ${i} by the ${side === BodySide.Right ? 'Right' : 'Left'} knee met the ball ${lateral.toFixed(3)} m out, not ${expected.toFixed(3)}`,
      ).toBeLessThan(0.015);
    }

    expect(rightmost - leftmost, `the body swayed ${(rightmost - leftmost).toFixed(3)} m sideways`).toBeLessThan(0.03);
  });

  it('walking thigh keep ups cross and are kept up', () => {
    const sim = new CarrySim({ body: Crossing });
    sim.run(1.2, ZERO);
    sim.solver.requestBounce(SHIPPED_LEVELS.Thigh.Apex);
    sim.run(1.5, ZERO);

    const before = sim.solver.touches;
    sim.run(6, Forward);

    expect(sim.solver.level).toBe(BallVerb.Thigh);
    expect(sim.floorHits).toBe(0);
    expect(sim.shownMisses).toBe(0);
    expect(sim.solver.touches - before, `only ${sim.solver.touches - before} touches in 6 s`).toBeGreaterThanOrEqual(8);
  });

  it('a ball coming down outside one knee is that knees whoever played last', () => {
    const input: BounceInput = { ...Standing(vec3(-0.09, 1.0, -0.23), Crossing), OwnerFollow: SHIPPED_FOLLOW };

    const plan = ContactPlanner.plan(input, BallVerb.Thigh, false, Limb.LeftThigh, TouchKind.KeepUp, SHIPPED_BOUNCE);

    expect(plan.Limb).toBe(Limb.LeftThigh);
  });

  // --- The boot check -----------------------------------------------------------------------

  it.each([
    [0.06, true],
    [0.07, true], // on the hip: straight up in front of it
    [0, true],
    [0.04, false], // inside the deadband: on neither side
    [0.09, false], // outside the hip: the knee reaches out for it
  ])('the knee spot sits between the deadband and the hip (%f m -> %s)', (spot, fits) => {
    const body: BodyModel = { ...Crossing, ThighSpot: spot };

    expect(CarryLevelCheck.kneeSpotSitsBetweenTheLineAndTheHip(body)).toBe(fits);
  });
});

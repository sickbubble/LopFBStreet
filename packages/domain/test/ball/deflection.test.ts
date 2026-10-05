import { describe, expect, it } from 'vitest';
import { BallVerb, BounceSolver, TouchKind, ZERO, type BounceInput, type Vec3 } from '../../src/index.js';
import {
  BallOnlyBox,
  CarrySim,
  DEFAULT_STRIDE,
  GRAVITY,
  MANNEQUIN,
  RADIUS,
  say,
  SHIPPED_BOUNCE,
  SHIPPED_FOLLOW,
  SHIPPED_LEVELS,
  STEP,
} from '../support/carrySim.js';

/**
 * A deflection breaks the follow: the Godot build's S34. The developer's words
 * at the washing line were "when the ball hits the curtains it can't get
 * loose, player can't move forward while bouncing the ball on the knee". Each
 * test walks a carry into the laundry at 120 Hz on the shipped numbers. Port
 * of `Ball/DeflectionTests.cs`.
 */

const AHEAD: Vec3 = { x: 0, y: 0, z: -1 };

/** The shipped washing line (underside 0.95, top 2.60, span 4.0), its near face two metres ahead. */
const LINE = new BallOnlyBox(-2.0, -6.0, 0.95, 2.6);

/** A few touches standing, then a commanded bounce up to the given apex and a touch or two there. */
function carryingAt(apex: number, level: BallVerb, reportDeflections = true): CarrySim {
  const sim = new CarrySim({ laundry: LINE, reportDeflections });
  sim.run(1.2, ZERO);
  expect(sim.solver.controlled).toBe(true);

  sim.solver.requestBounce(apex);
  sim.run(1.5, ZERO);

  expect(sim.solver.level).toBe(level);
  expect(sim.laundryContacts).toBe(0);
  return sim;
}

const kneeCarry = (reportDeflections = true): CarrySim =>
  carryingAt(SHIPPED_LEVELS.Thigh.Apex, BallVerb.Thigh, reportDeflections);

const restingInput = (velocity: Vec3): BounceInput => ({
  BallPosition: { x: 0, y: 1.1, z: -0.3 },
  BallVelocity: velocity,
  HasOwner: true,
  OwnerPosition: ZERO,
  OwnerVelocity: ZERO,
  OwnerIntent: ZERO,
  OwnerFacing: AHEAD,
  OwnerRise: 0,
  OwnerStride: DEFAULT_STRIDE,
  OwnerBody: MANNEQUIN,
  IsGrounded: false,
  BallRadius: RADIUS,
  Step: STEP,
  EffectiveGravity: GRAVITY,
  OwnerFollow: SHIPPED_FOLLOW,
});

describe('a deflection', () => {
  it('before S34 a knee carry into the laundry never gets past it', () => {
    // The report, reproduced: the ball comes back off the sheet, the body
    // follows it back, and the next touch sends it in again.
    const sim = kneeCarry(false);

    sim.run(8, AHEAD);

    expect(sim.laundryContacts > 0, 'the knee ball should meet the laundry').toBe(true);
    expect(
      sim.owner.z > LINE.FarZ,
      say('the loop should hold the player short of the far edge; they reached z {0}', sim.owner.z),
    ).toBe(true);
  });

  it('a knee carry into the laundry comes out the far side at the foot', () => {
    const sim = kneeCarry();

    sim.run(8, AHEAD);

    expect(sim.laundryContacts > 0, 'the knee ball should meet the laundry').toBe(true);
    expect(sim.owner.z < LINE.FarZ - 1, say('the player should be past the laundry; they reached z {0}', sim.owner.z)).toBe(true);
    expect(sim.ball.z < LINE.FarZ, say('the ball should be past the laundry; it reached z {0}', sim.ball.z)).toBe(true);
    expect(sim.solver.level).toBe(BallVerb.Foot);
    expect(sim.solver.controlled, 'the ball should be back under control at the foot').toBe(true);
    expect(
      sim.furthestAway < 2.5,
      'the ball left the possession radius: a deflection costs a level, never the ball',
    ).toBe(true);
  });

  it('a ball off a hard box is still followed and its next touch is the trap', () => {
    const sim = kneeCarry();

    for (let i = 0; i < 1200 && sim.laundryContacts === 0; i++) {
      sim.tick(AHEAD, false);
    }

    // The contact reaches the solver on the step after it, as in the engine.
    const touches = sim.solver.touches;
    sim.tick(AHEAD, false);

    // A hard obstacle sends the ball back past the body, and the body walks
    // back to it. Only cloth keeps the body off the stick's back (S35).
    expect(sim.solver.controlled).toBe(true);
    expect(sim.solver.plan.Following, 'the body should meet the ball coming back').toBe(true);
    expect(sim.solver.plan.Kind).toBe(TouchKind.Trap);

    for (let i = 0; i < 1200 && sim.solver.touches === touches; i++) {
      sim.tick(AHEAD, false);
    }

    expect(sim.solver.lastTouch).toBe(TouchKind.Trap);
    expect(sim.solver.level).toBe(BallVerb.Foot);
  });

  it('a held chest ball into the laundry comes off it', () => {
    const sim = carryingAt(SHIPPED_LEVELS.Chest.Apex, BallVerb.Chest);
    expect(sim.solver.stuck, 'the chest should be holding the ball').toBe(true);
    const breaks = sim.solver.breaks;

    sim.run(8, AHEAD);

    expect(sim.solver.breaks > breaks, 'the held ball should have come off at the sheet').toBe(true);
    expect(sim.owner.z < LINE.FarZ - 1, say('the player should be past the laundry; they reached z {0}', sim.owner.z)).toBe(true);
    expect(sim.ball.z < LINE.FarZ, say('the ball should be past the laundry; it reached z {0}', sim.ball.z)).toBe(true);
    expect(sim.furthestAway < 2.5, 'the ball left the possession radius').toBe(true);
  });

  it('a foot carry passes under the laundry untouched', () => {
    const sim = new CarrySim({ laundry: LINE });
    sim.run(1.2, ZERO);

    sim.run(8, AHEAD);

    expect(sim.laundryContacts).toBe(0);
    expect(sim.floorHits).toBe(0);
    expect(sim.owner.z).toBeLessThan(LINE.FarZ - 1);
    expect(sim.solver.level).toBe(BallVerb.Foot);
  });

  it('a deflection changes the next touch and nothing else', () => {
    // Two solvers in the same state; one hears of a deflection. The velocity
    // it returns that step is the ball's own, eased as any flight is, and
    // only the plan's kind differs.
    const input = restingInput({ x: 0, y: 1, z: 0.5 });

    const plain = new BounceSolver();
    const deflected = new BounceSolver();

    const a = plain.solve(input, SHIPPED_BOUNCE);
    const b = deflected.solve({ ...input, Deflected: true }, SHIPPED_BOUNCE);

    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    expect(b.z).toBeCloseTo(a.z, 5);
    expect(deflected.controlled).toBe(plain.controlled);
    expect(deflected.breaks).toBe(0);
    expect(plain.plan.Kind).not.toBe(TouchKind.Trap);
    expect(deflected.plan.Kind).toBe(TouchKind.Trap);
  });

  it('a pickup forgets a deflection', () => {
    const solver = new BounceSolver();
    const input = restingInput(ZERO);

    solver.solve({ ...input, Deflected: true }, SHIPPED_BOUNCE);
    solver.onPickedUp(1.1, SHIPPED_BOUNCE, true);
    solver.solve(input, SHIPPED_BOUNCE);

    expect(solver.plan.Kind).not.toBe(TouchKind.Trap);
  });
});

import { describe, expect, it } from 'vitest';
import { BallVerb, BounceSolver, dot, FOLLOW_OFF, scale, ZERO, type Vec3 } from '../../src/index.js';
import { CarrySim, RADIUS, say } from '../support/carrySim.js';

/**
 * The body follows the ball, touch after touch: the Godot build's S23 played
 * out at 120 Hz on the shipped numbers. The developer's words at the first
 * play of the body were "walk, jog, sprints, hard cuts make the ball lose";
 * each test is one of those, and in each the ball stays up. Port of
 * `Ball/CarryFollowTests.cs`.
 */

const AHEAD: Vec3 = { x: 0, y: 0, z: -1 };
const RIGHT: Vec3 = { x: 1, y: 0, z: 0 };
const BACK: Vec3 = { x: 0, y: 0, z: 1 };

/** A few touches standing, so every scenario starts from a ball under control. */
function settled(): CarrySim {
  const sim = new CarrySim();
  sim.run(1.2, ZERO);

  expect(sim.solver.controlled).toBe(true);
  expect(sim.solver.touches).toBeGreaterThanOrEqual(2);
  return sim;
}

/**
 * Kept up the whole way: never on the floor, never shown as a miss, never far
 * off, and no gap between touches longer than a flight.
 */
function keptUp(sim: CarrySim, longestFlight = 0.7): void {
  expect(sim.floorHits).toBe(0);
  expect(sim.shownMisses).toBe(0);
  expect(sim.furthestAway < 2.5, 'left the possession radius').toBe(true);
  expect(sim.longestGap < longestFlight, say('a flight went by without a touch: {0} s', sim.longestGap)).toBe(true);
}

describe('the carry follow', () => {
  it('a walk carry never misses', () => {
    const sim = settled();

    sim.run(8, AHEAD);

    keptUp(sim);
    expect(-sim.owner.z > 15, "the carry should have covered ground at the foot's pace").toBe(true);
    expect(sim.solver.level).toBe(BallVerb.Foot);
  });

  it('a sprint carry never misses', () => {
    const sim = settled();

    sim.run(6, AHEAD, true);

    keptUp(sim);
  });

  it.each([0.05, 0.2, 0.4])('starting to walk mid flight waits for the next touch (%s s in)', (into) => {
    const sim = settled();
    sim.runIntoNextFlight(into, ZERO);

    const touches = sim.solver.touches;
    const before = sim.owner.z;
    let moved = 0;
    while (sim.solver.touches === touches) {
      sim.tick(AHEAD, false);
      moved = Math.max(moved, Math.abs(sim.owner.z - before));
    }

    expect(moved < 0.25, say('the body left the ball before the touch: {0} m', moved, 3)).toBe(true);

    sim.run(3, AHEAD);
    keptUp(sim);
    expect(-sim.owner.z).toBeGreaterThan(4);
  });

  it.each([0.05, 0.25, 0.45])('start stop start keeps the ball (%s s in)', (into) => {
    const sim = settled();

    sim.run(2, AHEAD);
    sim.runIntoNextFlight(into, AHEAD);
    sim.run(1.5, ZERO);
    sim.run(2, AHEAD);

    keptUp(sim);
  });

  it.each([0.05, 0.25, 0.45])('a 90 degree cut takes one touch (%s s in)', (into) => {
    const sim = settled();

    sim.run(3, AHEAD);
    sim.runIntoNextFlight(into, AHEAD);
    const x = sim.owner.x;
    sim.run(3, RIGHT);

    keptUp(sim);
    expect(sim.owner.x - x > 4, 'the carry should have turned right').toBe(true);
    expect(dot(sim.facing, RIGHT)).toBeGreaterThan(0.9);
  });

  it.each([0.05, 0.25, 0.45])('a 180 degree reversal takes one touch (%s s in)', (into) => {
    const sim = settled();

    sim.run(3, AHEAD);
    sim.runIntoNextFlight(into, AHEAD);
    const z = sim.owner.z;
    sim.run(3, BACK);

    keptUp(sim);
    expect(sim.owner.z - z > 4, 'the carry should have come back').toBe(true);
    expect(dot(sim.facing, BACK)).toBeGreaterThan(0.9);
  });

  it('a sprint cut keeps the ball', () => {
    const sim = settled();

    sim.run(3, AHEAD, true);
    sim.runIntoNextFlight(0.25, AHEAD, true);
    sim.run(3, RIGHT, true);

    keptUp(sim);
  });

  /**
   * The commanded pop-and-run (S10): a full hold while walking sends the ball
   * high and on, and the body runs onto it and keeps it up at the level the
   * apex landed in.
   */
  it('a pop and run is run onto', () => {
    const sim = settled();
    sim.run(2, AHEAD);

    sim.solver.requestBounce(BounceSolver.apexForHold(0.6, sim.settings));
    sim.run(4, AHEAD);

    keptUp(sim, 1.1);
    expect(sim.solver.level).toBe(BallVerb.Head);
  });

  /** Standing, turning on the spot: the body steps round the ball rather than off it. */
  it('a standing turn keeps the ball', () => {
    const sim = settled();

    sim.runIntoNextFlight(0.1, ZERO);
    sim.run(0.4, scale(RIGHT, 0.3)); // a nudge of the stick, not a walk
    sim.run(2, ZERO);

    keptUp(sim);
    expect(dot(sim.facing, RIGHT)).toBeGreaterThan(0.9);
  });

  /** The follow is the fix: switched off, the same walk-and-cut loses the ball. */
  it('without the follow a cut loses the ball', () => {
    const sim = new CarrySim({ follow: FOLLOW_OFF });
    sim.run(1.2, ZERO);

    sim.run(3, AHEAD);
    sim.runIntoNextFlight(0.25, AHEAD);
    sim.run(3, BACK);

    expect(sim.floorHits > 0 || sim.furthestAway >= 2.5).toBe(true);
  });

  // --- S24: the first touch, then the carry

  /**
   * Dropped from knee-high a metre ahead, and the player walks straight at it.
   * The trap meets it on the way down and the carry goes on from there.
   */
  it('a ball dropped in front of a walking player is trapped and kept', () => {
    const sim = new CarrySim({ ball: { x: 0, y: 1.2, z: -1.0 } });

    sim.run(5, AHEAD);

    expect(sim.solver.controlled).toBe(true);
    expect(sim.solver.touches).toBeGreaterThanOrEqual(6);
    expect(sim.floorHits).toBe(0);
    expect(sim.furthestAway).toBeLessThan(2.5);
  });

  /**
   * An untimed trap of a ball rolled in at the catch speed pops it ahead,
   * hard, and it is kept, because after the trap it is under control and the
   * body follows it.
   */
  it('an untimed trap of a ball rolled in at catch speed is never lost', () => {
    const sim = new CarrySim({ ball: { x: 0, y: RADIUS, z: -2.4 }, ballVelocity: { x: 0, y: 0, z: 8.9 } });

    sim.run(4, ZERO);

    expect(sim.solver.controlled).toBe(true);
    expect(sim.solver.touches).toBeGreaterThanOrEqual(5);
    expect(sim.floorHits).toBe(0);
    expect(sim.furthestAway).toBeLessThan(2.5);
  });
});

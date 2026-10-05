import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import type { Vec3 } from '../../src/vec.js';
import { TEST_LAUNCH } from '../support/passFixtures.js';

// Port of BallisticsTests.cs.
const GRAVITY = 9.81;

describe('Ballistics', () => {
  it.each([
    [0, 3.5],
    [1, 12],
    [0.5, 7.75],
  ])('speed for charge spans the tuned range (%f -> %f)', (ratio, expected) => {
    expect(Ballistics.speedForCharge(TEST_LAUNCH, ratio)).toBeCloseTo(expected, 4);
  });

  // Releasing early gives a weaker shot, never a failure (GDD pillar 2): an out-of-range ratio clamps.
  it.each([
    [-1, 3.5],
    [2, 12],
  ])('speed for charge clamps out of range input (%f -> %f)', (ratio, expected) => {
    expect(Ballistics.speedForCharge(TEST_LAUNCH, ratio)).toBeCloseTo(expected, 4);
  });

  it('apex and vertical speed round trip', () => {
    const g = Ballistics.effectiveGravity(GRAVITY, 1);
    for (const apex of [0.4, 1, 2, 4.5]) {
      const speed = Ballistics.verticalSpeedForApex(apex, g);
      expect(Ballistics.apexForVerticalSpeed(speed, g)).toBeCloseTo(apex, 4);
    }
  });

  // v = sqrt(2gh): 0.40 m is 2.801 m/s at standard gravity.
  it('the foot apex needs the expected launch speed', () => {
    const g = Ballistics.effectiveGravity(GRAVITY, 1);
    expect(Ballistics.verticalSpeedForApex(0.4, g)).toBeCloseTo(Math.sqrt(2 * 9.81 * 0.4), 4);
    expect(Ballistics.verticalSpeedForApex(0.4, g)).toBeCloseTo(2.8014, 3);
  });

  it.each([[0], [-5]])('a ball moving downward has no apex (vy %f)', (verticalSpeed) => {
    expect(Ballistics.apexForVerticalSpeed(verticalSpeed, GRAVITY)).toBe(0);
  });

  it('a negative apex is treated as ground level', () => {
    expect(Ballistics.verticalSpeedForApex(-1, GRAVITY)).toBe(0);
  });

  // gravity_scale is live-editable and zero is one drag away; every apex conversion divides by gravity.
  it('gravity can never reach zero', () => {
    expect(Ballistics.effectiveGravity(9.81, 0)).toBe(Ballistics.MinGravity);
    expect(Ballistics.effectiveGravity(9.81, -1)).toBe(Ballistics.MinGravity);
    expect(Number.isFinite(Ballistics.apexForVerticalSpeed(5, 0))).toBe(true);
  });

  it('gravity scale multiplies project gravity', () => {
    expect(Ballistics.effectiveGravity(9.81, 2)).toBeCloseTo(19.62, 4);
  });

  // After TimeToReturn the ball is back at the height it left from.
  it('time to return brings the ball back to its launch height', () => {
    for (const apex of [0.4, 1.2, 2]) {
      const vy = Ballistics.verticalSpeedForApex(apex, GRAVITY);
      const flight = Ballistics.timeToReturn(vy, GRAVITY);
      const start: Vec3 = { x: 0, y: 0.11, z: 0 };

      const end = Ballistics.positionAfter(start, { x: 0, y: vy, z: 0 }, GRAVITY, flight);

      expect(end.y).toBeCloseTo(start.y, 4);
      expect(flight).toBeGreaterThan(0);
    }
  });

  // A tap (0.4 m) is in the air for about 0.57 s.
  it('a tap bounce flies for just over half a second', () => {
    const vy = Ballistics.verticalSpeedForApex(0.4, GRAVITY);
    expect(Ballistics.timeToReturn(vy, GRAVITY)).toBeCloseTo(0.571, 3);
  });

  it('a ball not going up has no flight', () => {
    expect(Ballistics.timeToReturn(-2, GRAVITY)).toBe(0);
  });

  // --- The crossing: when the ball next comes down through a height ---

  it('time to descend to from the height itself is the time to return', () => {
    const vy = Ballistics.verticalSpeedForApex(1, GRAVITY);
    expect(Ballistics.timeToDescendTo(0, vy, GRAVITY)).toBeCloseTo(Ballistics.timeToReturn(vy, GRAVITY), 5);
  });

  it('time to descend to agrees with the flight equation', () => {
    const start: Vec3 = { x: 0, y: 1.3, z: 0 };
    const velocity: Vec3 = { x: 0, y: 1.5, z: 0 };
    const target = 0.55;

    const time = Ballistics.timeToDescendTo(start.y - target, velocity.y, GRAVITY);
    expect(time).not.toBeNull();
    const end = Ballistics.positionAfter(start, velocity, GRAVITY, time as number);

    expect(time as number).toBeGreaterThan(0);
    expect(end.y).toBeCloseTo(target, 4);
  });

  // Below the height and falling: it came through a moment ago, and the time says how long ago.
  it('time to descend to is negative once the ball has passed the height', () => {
    const time = Ballistics.timeToDescendTo(-0.02, -2.5, GRAVITY);

    expect(time).not.toBeNull();
    expect(time as number).toBeLessThan(0);
    expect(time as number).toBeCloseTo(-0.008, 3);
  });

  it('time to descend to is null when the ball will never get there', () => {
    expect(Ballistics.timeToDescendTo(-1, 1, GRAVITY)).toBeNull();
  });
});

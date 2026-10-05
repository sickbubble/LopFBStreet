import { describe, expect, it } from 'vitest';
import { inverseLerp, lerpAngle, lerpf, moveToward } from '../src/mathUtil.js';

// Port of MathUtilTests.cs (godot-final).
describe('MathUtil', () => {
  it.each([
    [0, 10, 0, 0],
    [0, 10, 1, 10],
    [0, 10, 0.5, 5],
    [3.5, 12, 0.5, 7.75],
  ])('lerp interpolates (%f, %f, %f -> %f)', (from, to, weight, expected) => {
    expect(lerpf(from, to, weight)).toBeCloseTo(expected, 5);
  });

  // GDScript's lerpf does not clamp, and several call sites rely on that.
  it.each([
    [0, 10, 1.5, 15],
    [0, 10, -0.5, -5],
  ])('lerp does not clamp (%f, %f, %f -> %f)', (from, to, weight, expected) => {
    expect(lerpf(from, to, weight)).toBeCloseTo(expected, 5);
  });

  it('inverse lerp is the inverse of lerp', () => {
    const value = lerpf(3.5, 12, 0.37);
    expect(inverseLerp(3.5, 12, value)).toBeCloseTo(0.37, 5);
  });

  it('inverse lerp returns zero for a degenerate range', () => {
    expect(inverseLerp(5, 5, 9)).toBe(0);
  });

  it.each([
    [0, 10, 3, 3],
    [10, 0, 3, 7],
  ])('move toward steps by delta (%f -> %f by %f is %f)', (from, to, delta, expected) => {
    expect(moveToward(from, to, delta)).toBeCloseTo(expected, 5);
  });

  it.each([
    [0, 1, 5],
    [1, 0, 5],
  ])('move toward never overshoots (%f -> %f by %f)', (from, to, delta) => {
    expect(moveToward(from, to, delta)).toBeCloseTo(to, 5);
  });

  // Interpolating from just below +pi to just above -pi must take the short way.
  it('lerp angle takes the short way across the wrap', () => {
    const pi = 3.14159265;
    const result = lerpAngle(pi - 0.1, -pi + 0.1, 0.5);
    // Halfway is pi (equivalently -pi), not 0.
    expect(Math.abs(result)).toBeGreaterThan(3.0);
  });

  it('lerp angle at zero weight returns the start', () => {
    expect(lerpAngle(0.7, -2.1, 0)).toBeCloseTo(0.7, 5);
  });
});

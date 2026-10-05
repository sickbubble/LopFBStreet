import { describe, expect, it } from 'vitest';
import { CameraBias } from '../../src/camera/cameraModes.js';

// Port of CameraBiasTests.cs.
const BIAS_HEIGHT = 1.6;
const BIAS = 0.22;

describe('CameraBias', () => {
  // Ground play is left alone entirely (GDD 7).
  it.each([[0], [1.6], [-3]])('no lean until the ball is above the threshold (%f m)', (height) => {
    expect(CameraBias.strength(height, BIAS_HEIGHT, BIAS)).toBe(0);
  });

  it('lean ramps in over two metres', () => {
    expect(CameraBias.strength(BIAS_HEIGHT + 1, BIAS_HEIGHT, BIAS)).toBeCloseTo(BIAS * 0.5, 5);
    expect(CameraBias.strength(BIAS_HEIGHT + 2, BIAS_HEIGHT, BIAS)).toBeCloseTo(BIAS, 5);
  });

  // The lean never exceeds the bias, however high the ball goes.
  it('lean is capped at the bias', () => {
    expect(CameraBias.strength(50, BIAS_HEIGHT, BIAS)).toBeCloseTo(BIAS, 5);
  });

  it('zero strength keeps the players pitch', () => {
    expect(CameraBias.pitchToward(-8, 60, 0, -70, 75)).toBe(-8);
  });

  it('full strength pulls toward the ball', () => {
    expect(CameraBias.pitchToward(-8, 60, 0.5, -70, 75)).toBeCloseTo(26, 4);
  });

  // A ball straight overhead must not ask for a pitch the rig cannot reach.
  it('the ball pitch is clamped to the rig limits', () => {
    expect(CameraBias.pitchToward(0, 89, 1, -70, 75)).toBe(75);
  });
});

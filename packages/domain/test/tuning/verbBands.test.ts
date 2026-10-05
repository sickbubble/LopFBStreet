import { describe, expect, it } from 'vitest';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { verbFor, type VerbBands } from '../../src/tuning/ballSettings.js';

// Port of VerbBandsTests.cs.
const BANDS: VerbBands = { FootMax: 0.5, ThighMax: 0.95, ChestMax: 1.45 };

describe('VerbBands', () => {
  it.each([
    [0, BallVerb.Foot],
    [0.25, BallVerb.Foot],
    [0.75, BallVerb.Thigh],
    [1.2, BallVerb.Chest],
    [1.5, BallVerb.Head],
    [10, BallVerb.Head],
  ])('verb for picks the band (%f m -> %i)', (height, expected) => {
    expect(verbFor(BANDS, height)).toBe(expected);
  });

  // Each boundary belongs to the lower band: the GDScript used height <= band_max.
  it.each([
    [0.5, BallVerb.Foot],
    [0.95, BallVerb.Thigh],
    [1.45, BallVerb.Chest],
  ])('band boundaries belong to the lower band (%f m -> %i)', (height, expected) => {
    expect(verbFor(BANDS, height)).toBe(expected);
  });

  it.each([
    [0.5001, BallVerb.Thigh],
    [0.9501, BallVerb.Chest],
    [1.4501, BallVerb.Head],
  ])('just past a boundary is the next band up (%f m -> %i)', (height, expected) => {
    expect(verbFor(BANDS, height)).toBe(expected);
  });
});

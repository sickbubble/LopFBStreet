import { describe, expect, it } from 'vitest';
import { CarrySpeed, type CarrySettings } from '../../src/index.js';

/**
 * Inaction is safe but slow (GDD pillar 3), as numbers. The factor here is
 * what the player's speed cap is multiplied by, following the carry level.
 * Port of `Player/CarrySpeedTests.cs`.
 */

const STEP = 1 / 120;

const SETTINGS: CarrySettings = { SlowTime: 0.6, RecoverTime: 0.4 };

function run(carry: CarrySpeed, target: number, ticks: number, settings: CarrySettings): number {
  let factor = carry.factor;
  for (let tick = 0; tick < ticks; tick++) {
    factor = carry.update(target, STEP, settings);
  }

  return factor;
}

describe('the carry speed', () => {
  it('starts at full speed', () => {
    expect(new CarrySpeed().factor).toBe(1);
  });

  /** SlowTime is the time across the whole range: 0.6 s at 120 Hz is 72 steps from 1 to 0. */
  it('the full range is crossed in the slow time', () => {
    const carry = new CarrySpeed();

    expect(run(carry, 0, 72, SETTINGS)).toBeCloseTo(0, 4);
  });

  /** Foot level, x0.6: the 0.4 gap takes 0.4 * 0.6 s = 29 steps. */
  it('a foot carry reaches its factor in proportion', () => {
    const carry = new CarrySpeed();

    expect(run(carry, 0.6, 28, SETTINGS)).toBeGreaterThan(0.6);
    expect(run(carry, 0.6, 2, SETTINGS)).toBeCloseTo(0.6, 4);
  });

  it('holding the target never overshoots it', () => {
    const carry = new CarrySpeed();

    expect(run(carry, 0.3, 600, SETTINGS)).toBeCloseTo(0.3, 5);
  });

  it('a lower target mid ramp keeps ramping down', () => {
    const carry = new CarrySpeed();
    const atFoot = run(carry, 0.6, 15, SETTINGS);

    const later = run(carry, 0.3, 15, SETTINGS);

    expect(later < atFoot, `expected to keep falling from ${atFoot}, got ${later}`).toBe(true);
  });

  it('recovers to full speed in the recover time', () => {
    const carry = new CarrySpeed();
    run(carry, 0, 120, SETTINGS);

    expect(run(carry, 1, 48, SETTINGS)).toBeCloseTo(1, 4);
  });

  /**
   * The one-to-three contact steps of a touch may leak through as a different
   * target. Against a 0.6 s ramp that is a dip nobody feels.
   */
  it('a two step blip barely moves it', () => {
    const carry = new CarrySpeed();

    const dipped = run(carry, 0.6, 2, SETTINGS);
    expect(dipped > 0.97, `expected a dip under 3%, got ${dipped}`).toBe(true);

    expect(run(carry, 1, 2, SETTINGS)).toBeCloseTo(1, 5);
  });

  it('zero times snap', () => {
    const carry = new CarrySpeed();
    const instant: CarrySettings = { SlowTime: 0, RecoverTime: 0 };

    expect(carry.update(0.3, STEP, instant)).toBeCloseTo(0.3, 5);
    expect(carry.update(1, STEP, instant)).toBeCloseTo(1, 5);
  });
});

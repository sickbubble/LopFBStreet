import { describe, expect, it } from 'vitest';
import { BallHistory } from '../../src/ball/ballHistory.js';
import { ZERO, type Vec3 } from '../../src/vec.js';

// Port of BallHistoryTests.cs.
const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function filled(samples: number, capacity = 8): BallHistory {
  const history = new BallHistory(capacity);
  for (let i = 0; i < samples; i++) {
    history.push(v3(i, i * 0.5, 0), v3(0, 0, -i), i * 0.1);
  }
  return history;
}

describe('BallHistory', () => {
  it('a new buffer is empty', () => {
    const history = new BallHistory(8);

    expect(history.count).toBe(0);
    expect(history.positionAt(0, 0)).toEqual(ZERO);
  });

  it('capacity is never less than two', () => {
    expect(new BallHistory(0).capacity).toBe(2);
  });

  it('count stops at capacity', () => {
    expect(filled(30, 8).count).toBe(8);
  });

  it('the newest sample is returned for zero seconds ago', () => {
    expect(filled(5).positionAt(0.4, 0)).toEqual(v3(4, 2, 0));
  });

  it('an exact past sample is returned unchanged', () => {
    expect(filled(5).positionAt(0.4, 0.2)).toEqual(v3(2, 1, 0));
  });

  // The lag-compensation case: an RTT almost never lands exactly on a sample.
  it('a time between samples is interpolated', () => {
    const midway = filled(5).positionAt(0.4, 0.25);

    expect(midway.x).toBeCloseTo(1.5, 4);
    expect(midway.y).toBeCloseTo(0.75, 4);
  });

  // Reaching further back than the buffer holds degrades to the oldest sample rather than throwing.
  it('reaching past the oldest sample returns the oldest', () => {
    expect(filled(5).positionAt(0.4, 99)).toEqual(v3(0, 0, 0));
  });

  it('a negative seconds ago is treated as now', () => {
    const history = filled(5);

    expect(history.positionAt(0.4, -5)).toEqual(history.positionAt(0.4, 0));
  });

  // Once the ring has wrapped, the index arithmetic has to keep working across the seam.
  it('interpolation still works after the ring wraps', () => {
    const history = filled(20, 8);

    // Samples 12..19 survive, at times 1.2 .. 1.9.
    expect(history.positionAt(1.9, 0.25).x).toBeCloseTo(16.5, 3);
  });

  it('the oldest surviving sample is correct after a wrap', () => {
    expect(filled(20, 8).positionAt(1.9, 99).x).toBeCloseTo(12, 4);
  });

  it('apex since finds the highest point in the window', () => {
    const history = new BallHistory(16);
    history.push(v3(0, 0.4, 0), ZERO, 0.0);
    history.push(v3(0, 2.6, 0), ZERO, 0.1);
    history.push(v3(0, 1.1, 0), ZERO, 0.2);

    expect(history.apexSince(0.2, 1.0)).toBeCloseTo(2.6, 4);
  });

  it('apex since ignores samples older than the window', () => {
    const history = new BallHistory(16);
    history.push(v3(0, 9, 0), ZERO, 0.0);
    history.push(v3(0, 0.4, 0), ZERO, 1.0);
    history.push(v3(0, 0.5, 0), ZERO, 1.1);

    expect(history.apexSince(1.1, 0.5)).toBeCloseTo(0.5, 4);
  });

  it('apex since on an empty buffer is zero', () => {
    expect(new BallHistory(8).apexSince(1, 1)).toBe(0);
  });

  it('newest velocity is the last pushed', () => {
    expect(filled(5).newestVelocity).toEqual(v3(0, 0, -4));
  });

  it('clear empties the buffer', () => {
    const history = filled(5);

    history.clear();

    expect(history.count).toBe(0);
    expect(history.positionAt(0.4, 0.1)).toEqual(ZERO);
  });

  // After an hour at 120 Hz the buffer still resolves single ticks.
  it('timestamps still resolve a single tick after an hour of play', () => {
    const history = new BallHistory(8);
    const oneHour = 3600.0;
    const tick = 1.0 / 120.0;

    for (let i = 0; i < 5; i++) {
      history.push(v3(i, 0, 0), ZERO, oneHour + i * tick);
    }

    const now = oneHour + 4 * tick;

    expect(history.positionAt(now, tick).x).toBeCloseTo(3, 3);
    expect(history.positionAt(now, tick * 2).x).toBeCloseTo(2, 3);
  });
});

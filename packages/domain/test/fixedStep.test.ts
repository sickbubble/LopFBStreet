import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/fixedStep.js';

describe('FixedStep', () => {
  it('runs one step for exactly one step of time', () => {
    const clock = new FixedStep(120, 8);
    expect(clock.advance(1 / 120)).toBe(1);
  });

  it('runs 120 steps over one second fed at 60 Hz', () => {
    const clock = new FixedStep(120, 8);
    let total = 0;
    for (let i = 0; i < 60; i++) total += clock.advance(1 / 60);
    expect(total).toBe(120);
  });

  it('runs 120 steps over one second fed at 144 Hz, some frames running none', () => {
    const clock = new FixedStep(120, 8);
    const perFrame: number[] = [];
    for (let i = 0; i < 144; i++) perFrame.push(clock.advance(1 / 144));
    expect(perFrame.reduce((a, b) => a + b, 0)).toBe(120);
    expect(perFrame).toContain(0);
  });

  it('carries the remainder to the next frame', () => {
    const clock = new FixedStep(120, 8);
    expect(clock.advance(0.5 / 120)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.5, 9);
    expect(clock.advance(0.5 / 120)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0, 6);
  });

  it('drops time beyond maxSteps instead of spiralling', () => {
    const clock = new FixedStep(120, 8);
    expect(clock.advance(5)).toBe(8);
    expect(clock.advance(1 / 120)).toBe(1);
  });

  it('ignores negative and non-finite time', () => {
    const clock = new FixedStep(120, 8);
    expect(clock.advance(-1)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
    expect(clock.advance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  it('refuses a clock that cannot tick', () => {
    expect(() => new FixedStep(0, 8)).toThrow(RangeError);
    expect(() => new FixedStep(120, 0)).toThrow(RangeError);
  });
});

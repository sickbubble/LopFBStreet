import { describe, expect, it } from 'vitest';
import { add, cross, dot, flat, length, lerp, normalize, scale, sub, vec3 } from '../src/vec.js';

describe('vec', () => {
  it('does the arithmetic', () => {
    expect(add(vec3(1, 2, 3), vec3(4, 5, 6))).toEqual(vec3(5, 7, 9));
    expect(sub(vec3(4, 5, 6), vec3(1, 2, 3))).toEqual(vec3(3, 3, 3));
    expect(scale(vec3(1, -2, 3), 2)).toEqual(vec3(2, -4, 6));
    expect(dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
    expect(length(vec3(3, 4, 0))).toBe(5);
  });

  it('crosses right-handed: x cross y is z', () => {
    expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
  });

  it('normalizes, and a zero vector has no direction', () => {
    const n = normalize(vec3(0, 3, 4));
    expect(n.y).toBeCloseTo(0.6, 12);
    expect(n.z).toBeCloseTo(0.8, 12);
    expect(Number.isNaN(normalize(vec3(0, 0, 0)).x)).toBe(true);
  });

  it('lerps without clamping, like Vector3.Lerp', () => {
    expect(lerp(vec3(0, 0, 0), vec3(2, 0, 0), 1.5)).toEqual(vec3(3, 0, 0));
  });

  it('flattens to the ground plane', () => {
    expect(flat(vec3(1, 9, -2))).toEqual(vec3(1, 0, -2));
  });
});

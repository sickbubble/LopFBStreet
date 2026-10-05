/**
 * The domain's 3-vector: a plain readonly value, the stand-in for C#'s
 * System.Numerics.Vector3. Never a THREE.Vector3; packages/game/src/bridge/vec.ts
 * converts at the edge.
 *
 * Y is up and forward is -Z, as in the Godot build and in three.js.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const UP: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const lengthSq = (a: Vec3): number => dot(a, a);
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

/**
 * Unit vector along a. Like System.Numerics, a zero vector has no direction:
 * it comes back as NaN in every component, never silently as zero.
 */
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

/** Unclamped, like Vector3.Lerp. */
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/** The horizontal part: y dropped to zero. */
export const flat = (a: Vec3): Vec3 => ({ x: a.x, y: 0, z: a.z });

/** C#'s `v with { Y = y }`. */
export const withY = (a: Vec3, y: number): Vec3 => ({ x: a.x, y, z: a.z });

export const neg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });

/** Exact component equality, like `==` on System.Numerics.Vector3. */
export const vecEquals = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

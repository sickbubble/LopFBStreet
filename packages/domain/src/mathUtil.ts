/**
 * The handful of GDScript maths functions the Godot build relied on, with
 * their Godot semantics preserved exactly. The twin of `MathUtil.cs`.
 */

/** Unclamped linear interpolation, matching GDScript `lerpf`. */
export const lerpf = (from: number, to: number, weight: number): number => from + (to - from) * weight;

/**
 * Where `value` sits between the two bounds, as 0..1. Returns 0 when the range
 * is degenerate rather than dividing by zero.
 */
export function inverseLerp(from: number, to: number, value: number): number {
  const span = to - from;
  return Math.abs(span) < Number.EPSILON ? 0 : (value - from) / span;
}

/** Steps `from` toward `to` by at most `delta`, matching `move_toward`. Never overshoots. */
export function moveToward(from: number, to: number, delta: number): number {
  const difference = to - from;
  return Math.abs(difference) <= delta ? to : from + Math.sign(difference) * delta;
}

/** C#'s `%`: the remainder takes the sign of the dividend, as JS's does. */
const rem = (a: number, b: number): number => a % b;

/** Interpolates between two angles in radians the short way round, matching `lerp_angle`. */
export function lerpAngle(from: number, to: number, weight: number): number {
  const tau = Math.PI * 2;
  const difference = rem(to - from, tau);
  const distance = rem(2 * difference, tau) - difference;
  return from + distance * weight;
}

/** `Math.Clamp`. */
export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const DEG_TO_RAD = Math.PI / 180;

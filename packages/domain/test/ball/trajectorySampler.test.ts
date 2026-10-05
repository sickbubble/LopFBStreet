import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { Limb, limbName } from '../../src/ball/limb.js';
import { LaunchSolver } from '../../src/ball/launchSolver.js';
import { TrajectorySampler } from '../../src/ball/trajectorySampler.js';
import { distance, lerp, scale, ZERO, type Vec3 } from '../../src/vec.js';
import { aimAt, FORWARD, TEST_BANDS, TEST_LAUNCH } from '../support/passFixtures.js';

// Port of TrajectorySamplerTests.cs: the arc preview must not lie (S4).
const STEP = 1 / 120;
const GRAVITY = 9.81;
/** The shipped ball's 0.08 combined with Godot's project default 0.1. */
const SHIPPED_DAMP = 0.18;
/** A marker the size of the ball, a little generous. */
const MARKER_RADIUS = 0.25;
const START: Vec3 = { x: 0, y: 0.3, z: 0 };

const EVERY_LIMB: [Limb, number][] = [
  [Limb.RightFoot, 0],
  [Limb.LeftFoot, 180],
  [Limb.RightThigh, 0],
  [Limb.Chest, 0],
  [Limb.LeftShoulder, -70],
  [Limb.Head, 0],
];

/** The physics server's loop, written out longhand as the reference the sampler must match. */
function integrated(position: Vec3, velocity: Vec3, damp: number, ticks: number): Vec3 {
  let px = position.x;
  let py = position.y;
  let pz = position.z;
  let vx = velocity.x;
  let vy = velocity.y;
  let vz = velocity.z;
  for (let i = 0; i < ticks; i++) {
    vy -= GRAVITY * STEP;
    const k = 1 - damp * STEP;
    vx *= k;
    vy *= k;
    vz *= k;
    px += vx * STEP;
    py += vy * STEP;
    pz += vz * STEP;
  }
  return { x: px, y: py, z: pz };
}

const points = (n: number): Vec3[] => new Array<Vec3>(n).fill(ZERO);
const last = (a: Vec3[]): Vec3 => a[a.length - 1] as Vec3;

/** A plane at y = 0 as the world: the stub for the engine's shapecast. */
function ground(from: Vec3, to: Vec3): Vec3 | null {
  if (from.y < 0 || to.y >= 0) {
    return null;
  }
  const t = from.y / (from.y - to.y);
  return lerp(from, to, t);
}

describe('TrajectorySampler', () => {
  // The honesty test: the arc leaves along exactly the velocity the pass fires, for every part.
  it.each(EVERY_LIMB.map(([limb, yaw]) => [limbName(limb), limb, yaw] as const))(
    'sampler start velocity equals the launch for every part (%s)',
    (_name, limb, yaw) => {
      const launch = LaunchSolver.solve(
        { Aim: aimAt(yaw, 80), Facing: FORWARD, ChargeSeconds: 0.7, BallHeight: 0.2, Limb: limb },
        TEST_LAUNCH,
        TEST_BANDS,
      );
      const p = points(2);

      TrajectorySampler.sample(START, launch.Velocity, GRAVITY, SHIPPED_DAMP, STEP, STEP, p);

      expect(p[0]).toEqual(START);
      expect(distance(integrated(START, launch.Velocity, SHIPPED_DAMP, 1), p[1] as Vec3)).toBeCloseTo(0, 6);
    },
  );

  // A camera aimed straight up with the head: the arc goes where the clamp sends it.
  it('sampler follows the clamped aim not the camera', () => {
    const launch = LaunchSolver.solve(
      { Aim: { x: 0, y: 1, z: 0 }, Facing: FORWARD, ChargeSeconds: 1, BallHeight: 1.8, Limb: Limb.Head },
      TEST_LAUNCH,
      TEST_BANDS,
    );
    const p = points(31);

    TrajectorySampler.sample(START, launch.Velocity, GRAVITY, SHIPPED_DAMP, STEP, 2, p);

    // A clamped header travels forward.
    expect(last(p).z).toBeLessThan(-2);
  });

  it('sampler matches the physics integrator with the shipped damp', () => {
    const v = LaunchSolver.solve(
      { Aim: aimAt(0, 45), Facing: FORWARD, ChargeSeconds: 1, BallHeight: 0.2, Limb: Limb.RightFoot },
      TEST_LAUNCH,
      TEST_BANDS,
    ).Velocity;
    const p = points(31);

    TrajectorySampler.sample(START, v, GRAVITY, SHIPPED_DAMP, STEP, 2, p);

    for (let i = 0; i < p.length; i++) {
      const tick = Math.round((i * 240) / 30);
      expect(distance(integrated(START, v, SHIPPED_DAMP, tick), p[i] as Vec3), `point ${i}`).toBeLessThan(0.001);
    }
  });

  // At the shipped damp a full foot pass is metres off the drag-free curve after two seconds.
  it('the drag free curve would lie by more than the marker at the shipped damp', () => {
    const v = scale(aimAt(0, 45), 12);
    const dragFree = Ballistics.positionAfter(START, v, GRAVITY, 2);
    const damped = integrated(START, v, SHIPPED_DAMP, 240);

    expect(distance(dragFree, damped)).toBeGreaterThan(MARKER_RADIUS);
  });

  // With no damp the sampler is the drag-free flight, inside the marker: one equation, stepped.
  it('with no damp the sampler stays inside the marker of position after', () => {
    const v = scale(aimAt(0, 45), 12);
    const p = points(31);

    TrajectorySampler.sample(START, v, GRAVITY, 0, STEP, 2, p);

    expect(distance(Ballistics.positionAfter(START, v, GRAVITY, 2), last(p))).toBeLessThan(MARKER_RADIUS);
  });

  it.each([
    [0.08, 0.1, false, 0.18],
    [0.08, 0.1, true, 0.08],
    [0, 0, false, 0],
  ])('damp combines with the project default unless replaced (%f, %f, %s -> %f)', (body, project, replaces, expected) => {
    expect(TrajectorySampler.effectiveDamp(body, project, replaces)).toBeCloseTo(expected, 5);
  });

  it('sampler truncates at the first hit', () => {
    const v = scale(aimAt(0, 30), 8);
    const p = points(31);
    TrajectorySampler.sample(START, v, GRAVITY, SHIPPED_DAMP, STEP, 3, p);

    const { count, impact } = TrajectorySampler.truncate(p, ground);

    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(p.length - 1);
    expect(impact.y).toBeCloseTo(0, 4);
    expect(p[count - 1]).toEqual(impact);
    for (let i = 0; i < count - 1; i++) {
      expect((p[i] as Vec3).y).toBeGreaterThanOrEqual(0);
    }
  });

  it('nothing hit draws every point and ends at the last', () => {
    const p = points(10);
    TrajectorySampler.sample(START, scale(aimAt(0, 60), 12), GRAVITY, 0, STEP, 0.5, p);

    const { count, impact } = TrajectorySampler.truncate(p, () => null);

    expect(count).toBe(p.length);
    expect(impact).toEqual(last(p));
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BallBody, DEFAULT_CONTACT, type BallBodyState, type BallWorld, type StepContacts } from '../../src/ball/ballBody.js';
import { TrajectorySampler, type FlightState } from '../../src/ball/trajectorySampler.js';
import { confineBody, GOAL, GOAL_Z, NET_RESTITUTION, STREET_BOUNDS, streetWorld } from '../../src/street/pitch.js';
import type { BodySettings } from '../../src/tuning/ballSettings.js';
import { loadBallSettings } from '../../src/tuning/loaders.js';

// The web's stand-in for Jolt: the ball's rigid body against the street.
const STEP = 1 / 120;
const GRAVITY = 9.81;
const SHIPPED = loadBallSettings(JSON.parse(readFileSync(new URL('../../../../tools/golden/tuning/ball.json', import.meta.url), 'utf8')));
const BODY: BodySettings = SHIPPED.Body;
/** The shipped ball's damp combined with Godot's project default. */
const DAMP = TrajectorySampler.effectiveDamp(BODY.LinearDamp, 0.1, false);
/** No air and no spin decay: the contact alone, so its numbers can be read off exactly. */
const VACUUM: BodySettings = { ...BODY, LinearDamp: 0, AngularDamp: 0 };
const R = BODY.Radius;

const ball = (px: number, py: number, pz: number, vx = 0, vy = 0, vz = 0): BallBodyState => ({ px, py, pz, vx, vy, vz, wx: 0, wy: 0, wz: 0 });
const contacts = (): StepContacts => ({ grounded: false, hitCollider: false });
const flatGround: BallWorld = { groundY: 0, colliders: [] };

function run(s: BallBodyState, body: BodySettings, world: BallWorld, damp: number, ticks: number, out = contacts()): StepContacts {
  for (let i = 0; i < ticks; i++) {
    BallBody.step(s, body, world, GRAVITY, damp, STEP, DEFAULT_CONTACT, out);
  }
  return out;
}

/** Step until the ball hits a collider; returns the velocity just before and just after that step. */
function untilHit(s: BallBodyState, body: BodySettings, world: BallWorld, maxTicks = 600): { before: BallBodyState; after: BallBodyState } {
  const out = contacts();
  for (let i = 0; i < maxTicks; i++) {
    const before = { ...s };
    BallBody.step(s, body, world, GRAVITY, 0, STEP, DEFAULT_CONTACT, out);
    if (out.hitCollider) {
      return { before, after: { ...s } };
    }
  }
  throw new Error('the ball never hit anything');
}

describe('BallBody', () => {
  it('a free flight with nothing in the way is the arc preview step for step', () => {
    const world: BallWorld = { groundY: -1000, colliders: [] };
    const s = ball(0, 5, 0, 3, 9, -11);
    const reference: FlightState = { px: 0, py: 5, pz: 0, vx: 3, vy: 9, vz: -11 };
    const out = contacts();

    for (let i = 0; i < 360; i++) {
      BallBody.step(s, BODY, world, GRAVITY, DAMP, STEP, DEFAULT_CONTACT, out);
      TrajectorySampler.step(reference, GRAVITY, DAMP, STEP);

      expect([s.px, s.py, s.pz, s.vx, s.vy, s.vz]).toEqual([reference.px, reference.py, reference.pz, reference.vx, reference.vy, reference.vz]);
      expect(out.grounded).toBe(false);
      expect(out.hitCollider).toBe(false);
    }
  });

  it('a ball dropped from two metres keeps bounce squared of its height each bounce', () => {
    const s = ball(0, 2, 0);
    const out = contacts();
    const apexes: number[] = [s.py - R];
    let best = 0;
    let bounced = false;
    let wasGrounded = false;

    for (let i = 0; i < 1200; i++) {
      BallBody.step(s, VACUUM, flatGround, GRAVITY, 0, STEP, DEFAULT_CONTACT, out);
      if (out.grounded && !wasGrounded) {
        if (bounced && best > 0) {
          apexes.push(best);
        }
        bounced = true;
        best = 0;
      }
      if (!out.grounded && bounced) {
        best = Math.max(best, s.py - R);
      }
      wasGrounded = out.grounded;
    }

    // Only the bounces struck well above RestSpeed: 0.2 m of rise is a 2 m/s impact.
    // Measured 2026-10-05: 0.502, 0.504, 0.488, 0.497 against 0.518. The few
    // per cent short is the fixed step (velocity first, then position, and the
    // contact found a tick late), not the restitution: the wall and post tests
    // below read the bounce off a single contact exactly.
    const real = apexes.filter((h) => h > 0.2);
    expect(real.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < real.length; i++) {
      const ratio = (real[i] as number) / (real[i - 1] as number);
      expect(ratio, `bounce ${i}: ${real[i - 1]} -> ${real[i]}`).toBeCloseTo(BODY.Bounce * BODY.Bounce, 1);
    }
  });

  it('a slow ball settles on the ground at its radius and stays grounded', () => {
    const s = ball(0, R + 0.05, 0, 0, -0.3, 0);

    const out = run(s, BODY, flatGround, DAMP, 240);

    expect(out.grounded).toBe(true);
    expect(s.py).toBe(R);
    expect(s.vy).toBe(0);
    expect(BallBody.onGround(s, BODY, flatGround, DEFAULT_CONTACT)).toBe(true);
  });

  it('a skidding ball starts rolling and keeps five sevenths of its speed', () => {
    const s = ball(0, R, 0, 5, 0, -2);
    const v0 = Math.hypot(s.vx, s.vz);

    run(s, VACUUM, flatGround, 0, 240);

    // The contact point's velocity, v + w x r with r = (0, -R, 0).
    const slipX = s.vx + s.wz * R;
    const slipZ = s.vz - s.wx * R;
    expect(Math.hypot(slipX, slipZ)).toBeLessThan(1e-3);
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo((v0 * 5) / 7, 3);
    // Still heading the way it was going.
    expect(s.vx / s.vz).toBeCloseTo(5 / -2, 6);
  });

  it("a ball driven into a building face comes back off it at the ball's own bounce", () => {
    const x = STREET_BOUNDS.wallX - 1;
    const s = ball(x, 1.5, 0, 9, 0, 0);

    const { before, after } = untilHit(s, VACUUM, streetWorld());

    // The step's own gravity is in `before` + one tick; the wall's normal is -X.
    expect(after.vx).toBeCloseTo(-BODY.Bounce * before.vx, 9);
    expect(after.px).toBeLessThanOrEqual(STREET_BOUNDS.wallX - R + 1e-9);
  });

  it('a ball clipping the post is turned away and ends outside it', () => {
    const postX = -GOAL.width / 2;
    const s = ball(postX + 0.1, 1.2, GOAL_Z + 2, 0, 0, -10);
    const world = streetWorld();
    const reach = R + GOAL.post;

    const { before, after } = untilHit(s, VACUUM, world);
    const headingBefore = Math.atan2(before.vx, before.vz);
    const headingAfter = Math.atan2(after.vx, after.vz);

    expect(Math.abs(headingAfter - headingBefore)).toBeGreaterThan(0.2);
    // Glanced off the inside of the post: pushed toward the goal's middle.
    expect(after.vx).toBeGreaterThan(0);

    for (let i = 0; i < 60; i++) {
      run(s, VACUUM, world, 0, 1);
      expect(Math.hypot(s.px - postX, s.pz - GOAL_Z)).toBeGreaterThanOrEqual(reach - 1e-9);
    }
  });

  it('the net takes the pace off a shot the frame would send back', () => {
    const world = streetWorld();
    const postX = -GOAL.width / 2;

    const frame = untilHit(ball(postX, 1.2, GOAL_Z + 2, 0, 0, -10), VACUUM, world);
    const net = untilHit(ball(0, 1.2, GOAL_Z + 2, 0, 0, -10), VACUUM, world);

    expect(frame.after.vz).toBeCloseTo(-BODY.Bounce * frame.before.vz, 9);
    expect(net.after.vz).toBeCloseTo(-NET_RESTITUTION * net.before.vz, 9);
    expect(net.after.vz).toBeLessThan(frame.after.vz);
    // Into the net means behind the line.
    expect(net.after.pz).toBeLessThan(GOAL_Z - GOAL.depth + 0.2);
  });
});

describe('confineBody', () => {
  const world = streetWorld();
  const radius = 0.35;

  it('a player pressed against a building stops at its face', () => {
    const at = confineBody(STREET_BOUNDS.wallX - 0.1, 0, radius, world);

    expect(at.x).toBeCloseTo(STREET_BOUNDS.wallX - radius, 9);
    expect(at.z).toBe(0);
  });

  it('a player walking into the post is held off it', () => {
    const postX = -GOAL.width / 2;
    const at = confineBody(postX, GOAL_Z + 0.2, radius, world);

    expect(Math.hypot(at.x - postX, at.z - GOAL_Z)).toBeCloseTo(radius + GOAL.post, 9);
    expect(at.z).toBeGreaterThan(GOAL_Z);
  });

  it('a player in open street is left where they are', () => {
    expect(confineBody(1, 3, radius, world)).toEqual({ x: 1, z: 3 });
  });
});

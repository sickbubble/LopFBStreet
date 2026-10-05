import { clamp } from '../mathUtil.js';
import type { BodySettings } from '../tuning/ballSettings.js';
import { Ballistics } from './ballistics.js';
import { TrajectorySampler, type FlightState } from './trajectorySampler.js';

/**
 * The ball's rigid body: the web's stand-in for Jolt (listed as one in
 * docs/IMPLEMENTATION.md). It is the only thing that writes the ball's
 * position and velocity (rule 2). In flight it runs exactly
 * `TrajectorySampler.step` (gravity, damp, move), so the arc preview and the
 * ball agree. Contacts are resolved after the move, against a flat ground and
 * a list of static boxes and capsules (walls, posts, the bar).
 *
 * A solid sphere, as Godot's SphereShape3D is: friction at the ground turns
 * slip into spin, so a ball that skids starts rolling, and once rolling it is
 * slowed only by the damps, as in Jolt. Restitution and friction are the
 * ball's own (`Body.Bounce`, `Body.Friction`), the static world having none of
 * its own, which is how the Godot ground's default material combined.
 */

/** An axis-aligned box: a wall, a building's face, the net's sides. */
export interface ColliderBox {
  readonly kind: 'box';
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  /** Overrides the ball's own bounce off this collider (the net); absent is the ball's. */
  readonly restitution?: number;
}

/** A capsule: a segment with a radius. A post, the bar, a lamp post. */
export interface ColliderCapsule {
  readonly kind: 'capsule';
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly radius: number;
  readonly restitution?: number;
}

export type Collider = ColliderBox | ColliderCapsule;

/** Everything the ball can hit. */
export interface BallWorld {
  readonly groundY: number;
  readonly colliders: readonly Collider[];
}

/**
 * Web-only contact numbers, with no Godot twin (Jolt decided them there).
 * Named settings, logged in TUNING_LOG as web values that depend on the
 * integrator stand-in.
 */
export interface ContactSettings {
  /** Below this speed into the ground a contact does not bounce: the ball settles, as Jolt's restitution threshold. */
  readonly RestSpeed: number;
  /** Within this of the ground the ball counts as touching it: Jolt's contact margin. */
  readonly ContactSlop: number;
}

export const DEFAULT_CONTACT: ContactSettings = { RestSpeed: 1.0, ContactSlop: 0.002 };

/** The ball's mutable state: position, velocity and spin. Owned by the game's ball controller, written only here. */
export interface BallBodyState extends FlightState {
  wx: number;
  wy: number;
  wz: number;
}

/** What a step found, for the next step's solver input. */
export interface StepContacts {
  /** Touching the ground: `IsGrounded` next step. */
  grounded: boolean;
  /** Hit a wall, a post or the bar this step. Read by the HUD; the street never deflects a carry (S34). */
  hitCollider: boolean;
}

/** Inertia of a solid sphere over m r^2. */
const SOLID = 0.4;

export const BallBody = {
  /**
   * One fixed step. The caller has already put the solver's velocity (and
   * any launch spin) into `s`; this integrates and resolves contacts in place.
   */
  step(
    s: BallBodyState,
    body: BodySettings,
    world: BallWorld,
    effectiveGravity: number,
    damp: number,
    step: number,
    contact: ContactSettings,
    out: StepContacts,
  ): void {
    TrajectorySampler.step(s, effectiveGravity, damp, step);

    const spinKeep = Math.max(1 - body.AngularDamp * step, 0);
    s.wx *= spinKeep;
    s.wy *= spinKeep;
    s.wz *= spinKeep;

    out.hitCollider = false;
    for (const c of world.colliders) {
      if (c.kind === 'box' ? hitBox(s, body, c) : hitCapsule(s, body, c)) out.hitCollider = true;
    }

    out.grounded = ground(s, body, world.groundY, effectiveGravity, step, contact);
  },

  /** Whether the ball is resting on or touching the ground now, without stepping. */
  onGround: (s: FlightState, body: BodySettings, world: BallWorld, contact: ContactSettings): boolean =>
    s.py <= world.groundY + body.Radius + contact.ContactSlop,
};

function ground(
  s: BallBodyState,
  body: BodySettings,
  groundY: number,
  g: number,
  step: number,
  contact: ContactSettings,
): boolean {
  const rest = groundY + body.Radius;
  if (s.py > rest + contact.ContactSlop) return false;

  // The normal impulse per unit mass: the bounce on impact, or holding the
  // ball up against gravity while it rests or rolls.
  let jn: number;
  if (s.py < rest) s.py = rest;
  if (s.vy < 0) {
    const into = -s.vy;
    const e = into > contact.RestSpeed ? clamp(body.Bounce, 0, 1) : 0;
    s.vy = into * e;
    jn = into * (1 + e);
  } else {
    jn = Math.max(g, Ballistics.MinGravity) * step;
  }

  friction(s, body, 0, -1, 0, jn);
  return true;
}

/**
 * Coulomb friction at a contact whose normal (from the contact into the ball)
 * is `n`, the contact point being `-n * radius` from the centre. The impulse
 * per unit mass is capped at `Friction * jn` and never more than stops the slip.
 */
function friction(s: BallBodyState, body: BodySettings, cx: number, cy: number, cz: number, jn: number): void {
  const r = body.Radius;
  // Contact offset from the centre.
  const rx = cx * r;
  const ry = cy * r;
  const rz = cz * r;
  // Velocity of the contact point: v + w x r.
  let ux = s.vx + (s.wy * rz - s.wz * ry);
  let uy = s.vy + (s.wz * rx - s.wx * rz);
  let uz = s.vz + (s.wx * ry - s.wy * rx);
  // Tangential part only.
  const un = ux * cx + uy * cy + uz * cz;
  ux -= un * cx;
  uy -= un * cy;
  uz -= un * cz;
  const slip = Math.hypot(ux, uy, uz);
  if (slip < 1e-6) return;

  // For a solid sphere, stopping the slip takes an impulse of slip * 2/7 per unit mass.
  const stop = slip * (SOLID / (1 + SOLID));
  const j = Math.min(stop, Math.max(body.Friction, 0) * jn);
  const tx = (-ux / slip) * j;
  const ty = (-uy / slip) * j;
  const tz = (-uz / slip) * j;

  s.vx += tx;
  s.vy += ty;
  s.vz += tz;
  // dw = (r x J) / (I/m), I/m = 0.4 r^2.
  const k = 1 / (SOLID * r * r);
  s.wx += (ry * tz - rz * ty) * k;
  s.wy += (rz * tx - rx * tz) * k;
  s.wz += (rx * ty - ry * tx) * k;
}

/** Push the ball out along `n` (unit, away from the collider) to `depth`, and bounce the part of the velocity going in. */
function resolve(s: BallBodyState, body: BodySettings, nx: number, ny: number, nz: number, depth: number, restitution: number): void {
  s.px += nx * depth;
  s.py += ny * depth;
  s.pz += nz * depth;
  const vn = s.vx * nx + s.vy * ny + s.vz * nz;
  if (vn >= 0) return;
  const e = clamp(restitution, 0, 1);
  const j = -(1 + e) * vn;
  s.vx += nx * j;
  s.vy += ny * j;
  s.vz += nz * j;
  friction(s, body, -nx, -ny, -nz, j);
}

function hitBox(s: BallBodyState, body: BodySettings, b: ColliderBox): boolean {
  const r = body.Radius;
  const qx = clamp(s.px, b.minX, b.maxX);
  const qy = clamp(s.py, b.minY, b.maxY);
  const qz = clamp(s.pz, b.minZ, b.maxZ);
  let dx = s.px - qx;
  let dy = s.py - qy;
  let dz = s.pz - qz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return false;

  const e = b.restitution ?? body.Bounce;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    resolve(s, body, dx / d, dy / d, dz / d, r - d, e);
    return true;
  }

  // The centre is inside the box (a fast ball tunnelled a little): leave by the nearest face.
  const faces: [number, number, number, number][] = [
    [s.px - b.minX, -1, 0, 0],
    [b.maxX - s.px, 1, 0, 0],
    [s.py - b.minY, 0, -1, 0],
    [b.maxY - s.py, 0, 1, 0],
    [s.pz - b.minZ, 0, 0, -1],
    [b.maxZ - s.pz, 0, 0, 1],
  ];
  let best = faces[0] as [number, number, number, number];
  for (const f of faces) if (f[0] < best[0]) best = f;
  [, dx, dy, dz] = best;
  resolve(s, body, dx, dy, dz, best[0] + r, e);
  return true;
}

function hitCapsule(s: BallBodyState, body: BodySettings, c: ColliderCapsule): boolean {
  const abx = c.bx - c.ax;
  const aby = c.by - c.ay;
  const abz = c.bz - c.az;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 <= 0 ? 0 : clamp(((s.px - c.ax) * abx + (s.py - c.ay) * aby + (s.pz - c.az) * abz) / len2, 0, 1);
  const dx = s.px - (c.ax + abx * t);
  const dy = s.py - (c.ay + aby * t);
  const dz = s.pz - (c.az + abz * t);
  const reach = body.Radius + c.radius;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= reach * reach || d2 <= 1e-12) return false;
  const d = Math.sqrt(d2);
  resolve(s, body, dx / d, dy / d, dz / d, reach - d, c.restitution ?? body.Bounce);
  return true;
}

/**
 * Whether a ball of `radius` centred here touches the ground or any collider:
 * the arc preview's sweep (`PassPreview.FirstHit`'s shapecast). Reads only.
 */
export function ballOverlaps(x: number, y: number, z: number, radius: number, world: BallWorld): boolean {
  if (y <= world.groundY + radius) return true;
  for (const c of world.colliders) {
    if (c.kind === 'box') {
      const dx = x - clamp(x, c.minX, c.maxX);
      const dy = y - clamp(y, c.minY, c.maxY);
      const dz = z - clamp(z, c.minZ, c.maxZ);
      if (dx * dx + dy * dy + dz * dz < radius * radius) return true;
    } else {
      const abx = c.bx - c.ax;
      const aby = c.by - c.ay;
      const abz = c.bz - c.az;
      const len2 = abx * abx + aby * aby + abz * abz;
      const t = len2 <= 0 ? 0 : clamp(((x - c.ax) * abx + (y - c.ay) * aby + (z - c.az) * abz) / len2, 0, 1);
      const dx = x - (c.ax + abx * t);
      const dy = y - (c.ay + aby * t);
      const dz = z - (c.az + abz * t);
      const reach = radius + c.radius;
      if (dx * dx + dy * dy + dz * dz < reach * reach) return true;
    }
  }
  return false;
}

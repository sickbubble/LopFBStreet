import type { BallWorld, Collider } from '../ball/ballBody.js';

/**
 * The street pitch: its size, the goal, and the walls that keep the ball in.
 * A greybox, not a rule (STREET.md §9 question 9 is still the level
 * designer's); it lives here because the ball's collisions read it and the
 * scene draws it, and the two must never disagree. The goal line is at
 * z = -PITCH.length / 2, forward is -Z.
 */
export const PITCH = { width: 18, length: 30 } as const;
export const GOAL = { width: 3.6, height: 2.2, depth: 1.1, post: 0.055 } as const;

/** Where the pitch is walled in, past its chalk: building faces and the low wall behind the near end. */
export const STREET_BOUNDS = {
  /** The building faces either side. */
  wallX: PITCH.width / 2 + 1.2,
  /** The garage door behind the goal. */
  wallBackZ: -PITCH.length / 2 - 2.4,
  /** The low wall at the near end: its face, height and thickness. */
  wallFrontZ: PITCH.length / 2 + 1.2,
  lowWallHeight: 1.3,
  lowWallDepth: 0.4,
  /** The buildings behind the low wall: a ball cleared over it stops there. */
  farFrontZ: PITCH.length / 2 + 1.2 + 8,
  /** The facades are tall enough that nothing in the game clears them. */
  buildingHeight: 20,
  /** Lamp posts along the walls: where they stand, and their radius. */
  lampInset: 0.25,
  lampRadius: 0.08,
  lampHeight: 5.4,
  lamps: [
    [-1, -8],
    [1, -2],
    [-1, 6],
    [1, 12],
  ],
} as const;

/** The net gives where the frame does not: a soft bounce. */
export const NET_RESTITUTION = 0.15;

/** The goal line's z. */
export const GOAL_Z = -PITCH.length / 2;

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, restitution?: number): Collider =>
  restitution === undefined
    ? { kind: 'box', minX, minY, minZ, maxX, maxY, maxZ }
    : { kind: 'box', minX, minY, minZ, maxX, maxY, maxZ, restitution };

const capsule = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, restitution?: number): Collider =>
  restitution === undefined
    ? { kind: 'capsule', ax, ay, az, bx, by, bz, radius }
    : { kind: 'capsule', ax, ay, az, bx, by, bz, radius, restitution };

/** Everything the ball can hit on the street. */
export function streetWorld(): BallWorld {
  const b = STREET_BOUNDS;
  const H = b.buildingHeight;
  const thick = 2;
  const gx = GOAL.width / 2;
  const back = GOAL_Z - GOAL.depth;
  const netT = 0.02;

  const colliders: Collider[] = [
    // Buildings either side, the garage behind the goal, the far buildings.
    box(-b.wallX - thick, 0, b.wallBackZ - thick, -b.wallX, H, b.farFrontZ + thick),
    box(b.wallX, 0, b.wallBackZ - thick, b.wallX + thick, H, b.farFrontZ + thick),
    box(-b.wallX, 0, b.wallBackZ - thick, b.wallX, H, b.wallBackZ),
    box(-b.wallX, 0, b.farFrontZ, b.wallX, H, b.farFrontZ + thick),
    // The low wall at the near end.
    box(-b.wallX, 0, b.wallFrontZ, b.wallX, b.lowWallHeight, b.wallFrontZ + b.lowWallDepth),
    // The goal frame: two posts and the bar.
    capsule(-gx, 0, GOAL_Z, -gx, GOAL.height, GOAL_Z, GOAL.post),
    capsule(gx, 0, GOAL_Z, gx, GOAL.height, GOAL_Z, GOAL.post),
    capsule(-gx, GOAL.height, GOAL_Z, gx, GOAL.height, GOAL_Z, GOAL.post),
    // The net: back, sides and roof.
    box(-gx, 0, back - netT, gx, GOAL.height, back, NET_RESTITUTION),
    box(-gx - netT, 0, back, -gx, GOAL.height, GOAL_Z, NET_RESTITUTION),
    box(gx, 0, back, gx + netT, GOAL.height, GOAL_Z, NET_RESTITUTION),
    box(-gx, GOAL.height, back, gx, GOAL.height + netT, GOAL_Z - GOAL.post, NET_RESTITUTION),
  ];

  for (const [side, z] of b.lamps) {
    const x = side * (b.wallX - b.lampInset);
    colliders.push(capsule(x, 0, z, x, b.lampHeight, z, b.lampRadius));
  }

  return { groundY: 0, colliders };
}

/**
 * Keep a player's body, a vertical cylinder of `radius`, out of the walls and
 * posts: the CharacterBody3D's slide, flat. Returns the corrected x and z.
 * The ball never collides with a player (Godot's collision mask had no player
 * layer); a hot ball's ricochet is ReceptionSolver's.
 */
export function confineBody(x: number, z: number, radius: number, world: BallWorld): { x: number; z: number } {
  for (const c of world.colliders) {
    if (c.kind === 'box') {
      if (c.maxY < 0.3) continue;
      const qx = Math.min(Math.max(x, c.minX), c.maxX);
      const qz = Math.min(Math.max(z, c.minZ), c.maxZ);
      const dx = x - qx;
      const dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        x = qx + (dx / d) * radius;
        z = qz + (dz / d) * radius;
      } else {
        // Inside: leave by the nearest side.
        const out = [x - c.minX, c.maxX - x, z - c.minZ, c.maxZ - z];
        const i = out.indexOf(Math.min(...out));
        if (i === 0) x = c.minX - radius;
        else if (i === 1) x = c.maxX + radius;
        else if (i === 2) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    } else if (Math.abs(c.ax - c.bx) < 1e-6 && Math.abs(c.az - c.bz) < 1e-6) {
      const dx = x - c.ax;
      const dz = z - c.az;
      const reach = radius + c.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || d2 <= 1e-12) continue;
      const d = Math.sqrt(d2);
      x = c.ax + (dx / d) * reach;
      z = c.az + (dz / d) * reach;
    }
  }
  return { x, z };
}

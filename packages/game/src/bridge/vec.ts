import { Vector3 } from 'three';
import type { Vec3 } from '@lopfb/domain';

/**
 * The one place a domain vector and a three vector meet (CLAUDE.md rule 1),
 * the twin of the Godot build's Bridge/Vec.cs. Convert at the call site inside
 * an adapter; never keep a domain vector as node state across frames, never
 * hand a THREE.Vector3 to the domain.
 */
export const toThree = (v: Vec3, out: Vector3 = new Vector3()): Vector3 => out.set(v.x, v.y, v.z);

export const fromThree = (v: Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

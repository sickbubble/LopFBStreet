import {
  DEFAULT_CONTACT,
  loadAnimatorSettings,
  loadBallSettings,
  loadPlayerSettings,
  type AnimatorSettings,
  type BallSettings,
  type ContactSettings,
  type PlayerSettings,
} from '@lopfb/domain';
import animatorJson from '../../../../tools/golden/tuning/animator.json';
import ballJson from '../../../../tools/golden/tuning/ball.json';
import playerJson from '../../../../tools/golden/tuning/player.json';

/** Strips `readonly` all the way down: the panel edits these in place. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };

/**
 * The live settings: the shipped tuning, loaded strictly once, then a
 * mutable copy that the lil-gui panel edits and every fixed step reads. Read
 * them through `live` every step; never cache a field at boot, or a panel
 * edit does nothing (ARCHITECTURE § Tuning).
 */
export interface LiveSettings {
  ball: Mutable<BallSettings>;
  player: Mutable<PlayerSettings>;
  animator: Mutable<AnimatorSettings>;
  contact: Mutable<ContactSettings>;
  /** The project's gravity and default linear damp: Godot's project.godot values. */
  world: { Gravity: number; ProjectLinearDamp: number };
}

const clone = <T>(v: T): Mutable<T> => structuredClone(v) as Mutable<T>;

/** What the shipped files say, never edited. "Reset" on the panel goes back here. */
export const shipped = {
  ball: loadBallSettings(ballJson),
  player: loadPlayerSettings(playerJson),
  animator: loadAnimatorSettings(animatorJson),
  contact: DEFAULT_CONTACT,
  // project.godot: physics/3d/default_gravity 9.81, default_linear_damp 0.1 (Godot's defaults, unchanged there).
  world: { Gravity: 9.81, ProjectLinearDamp: 0.1 },
} as const;

export const live: LiveSettings = {
  ball: clone(shipped.ball),
  player: clone(shipped.player),
  animator: clone(shipped.animator),
  contact: clone(shipped.contact),
  world: { ...shipped.world },
};

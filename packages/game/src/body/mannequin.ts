import { AnimationMixer, Group, LoopRepeat, type AnimationAction, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * The Quaternius UAL1 mannequin (CC0), the same body as the Godot build.
 * Godot imported it at Root Scale 0.79 (crown 1.45 m, hips 0.74 m), and the
 * BodyModel tuning in tools/golden/tuning/player.json is measured against
 * that size, so the web loads it at the same scale. It faces +Z.
 *
 * Clip names keep their _Loop suffix here; Godot stripped it on import.
 */
export const MANNEQUIN_URL = `${import.meta.env.BASE_URL}assets/characters/mannequin.glb`;
export const MANNEQUIN_SCALE = 0.79;

export interface Mannequin {
  /** Named 'Player'; the smoke test looks for it. */
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly clips: readonly string[];
  play(name: string): AnimationAction;
}

export async function loadMannequin(url = MANNEQUIN_URL): Promise<Mannequin> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = new Group();
  root.name = 'Player';
  const model = gltf.scene;
  model.name = 'Character';
  model.scale.setScalar(MANNEQUIN_SCALE);
  model.traverse((o: Object3D) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  root.add(model);

  const mixer = new AnimationMixer(model);
  const byName = new Map(gltf.animations.map((c) => [c.name, c]));
  let current: AnimationAction | undefined;

  return {
    root,
    mixer,
    clips: [...byName.keys()],
    play(name: string): AnimationAction {
      const clip = byName.get(name);
      if (!clip) throw new Error(`mannequin has no clip '${name}'; it has ${[...byName.keys()].join(', ')}`);
      const next = mixer.clipAction(clip);
      next.setLoop(LoopRepeat, Infinity);
      next.reset().play();
      if (current && current !== next) next.crossFadeFrom(current, 0.15, false);
      current = next;
      return next;
    },
  };
}

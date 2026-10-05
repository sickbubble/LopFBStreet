import type { Scene } from 'three';

/**
 * What the Playwright smoke test reads (e2e/smoke.spec.ts): whether the
 * scene finished loading, whether named objects exist, and whether the fixed
 * clock is ticking. The web's stand-in for the Godot build's SceneContract.
 */
export interface DebugHook {
  ready: boolean;
  stepsPerSecond: number;
  has(name: string): boolean;
}

declare global {
  interface Window {
    __lopfb?: DebugHook;
  }
}

export function installDebugHook(scene: Scene): DebugHook {
  const hook: DebugHook = {
    ready: false,
    stepsPerSecond: 0,
    has: (name) => scene.getObjectByName(name) !== undefined,
  };
  window.__lopfb = hook;
  return hook;
}

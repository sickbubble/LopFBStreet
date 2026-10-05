import type { LaunchSettings, VerbBands } from '../../src/tuning/ballSettings.js';
import { DEFAULT_PASS_PROFILES } from '../../src/tuning/passProfiles.js';
import type { Vec3 } from '../../src/vec.js';

/**
 * The C# tests' `new LaunchSettings(3.5f, 12f, 1f, 6f, PassProfiles.Default)`.
 * AimLoftOffset 0 and AimLoftGain 1 are the C# record's defaults: camera pitch unchanged.
 */
export const TEST_LAUNCH: LaunchSettings = {
  MinSpeed: 3.5,
  MaxSpeed: 12,
  ChargeTime: 1,
  LaunchSpin: 6,
  Parts: DEFAULT_PASS_PROFILES,
  AimLoftOffset: 0,
  AimLoftGain: 1,
};

/** The C# tests' `new VerbBands(0.50f, 0.95f, 1.45f)`. */
export const TEST_BANDS: VerbBands = { FootMax: 0.5, ThighMax: 0.95, ChestMax: 1.45 };

/** Godot forward is -Z. */
export const FORWARD: Vec3 = { x: 0, y: 0, z: -1 };

/** A unit aim, `yaw` degrees to the right of -Z and pitched up `pitch`. */
export function aimAt(yaw: number, pitch: number): Vec3 {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  return { x: Math.sin(y) * Math.cos(p), y: Math.sin(p), z: -Math.cos(y) * Math.cos(p) };
}

import { clamp, lerpf } from '../mathUtil.js';

/**
 * One camera framing. Every mode is a view only: the aim (yaw and pitch,
 * which drive movement and the launch) never changes with the mode. Port of
 * `CameraMode.cs`. Angles in degrees, as there.
 */
export interface CameraMode {
  readonly Name: string;
  readonly ArmLength: number;
  readonly PivotRise: number;
  readonly LateralOffset: number;
  readonly YawOffset: number;
  readonly ViewPitchOffset: number;
  readonly PitchFollow: number;
  readonly Fov: number;
  readonly BallBias: number;
}

const mode = (
  Name: string,
  ArmLength: number,
  PivotRise: number,
  LateralOffset: number,
  YawOffset: number,
  ViewPitchOffset: number,
  PitchFollow: number,
  Fov: number,
  BallBias: number,
): CameraMode => ({ Name, ArmLength, PivotRise, LateralOffset, YawOffset, ViewPitchOffset, PitchFollow, Fov, BallBias });

/**
 * The trial camera modes the C key cycles through (M1.C1). The numbers are
 * copied from `CameraModes.cs` at godot-final: GoldenDump could not export
 * them (camera.json lists them as notParsed). Logged in TUNING_LOG as such.
 */
export const CameraModes = {
  ViewMinPitch: -85,
  ViewMaxPitch: 80,

  Chase: mode('Chase', 5.0, 0, 0, 0, 0, 1, 75, 0.22),
  Street: mode('Street', 3.0, -0.6, 0, 25, -2, 1, 70, 0.1),
  High: mode('High', 8.0, 0.5, 0, 0, -22, 0.5, 65, 0),
  Sideline: mode('Sideline', 2.8, -0.5, 0, 90, -5, 0, 80, 0),
  Shoulder: mode('Shoulder', 2.2, 0.2, 0.6, 0, 0, 1, 60, 0),

  /** The cycle order. Chase first. */
  get default(): readonly CameraMode[] {
    return [CameraModes.Chase, CameraModes.Street, CameraModes.High, CameraModes.Sideline, CameraModes.Shoulder];
  },

  /** The mode after `index`, wrapping. Anything out of range starts over at 0. */
  next(index: number, count: number): number {
    if (count <= 0 || index < 0 || index >= count) return 0;
    return (index + 1) % count;
  },

  /** What is wrong with a set of modes, in words; empty when nothing is. */
  problems(modes: readonly CameraMode[]): string[] {
    const problems: string[] = [];
    if (modes.length === 0) {
      problems.push('There are no camera modes: the C key has nothing to cycle.');
      return problems;
    }

    const names = new Set<string>();
    modes.forEach((m, i) => {
      const unnamed = m.Name.trim() === '';
      const name = unnamed ? `#${i}` : m.Name;
      if (unnamed) problems.push(`Camera mode ${i} has no name: the toast would be blank.`);
      else if (names.has(m.Name)) problems.push(`Camera mode name "${m.Name}" is used twice: the toast could not tell them apart.`);
      else names.add(m.Name);

      if (m.ArmLength <= 0 || m.ArmLength > 15) problems.push(`Camera mode ${name}: arm ${m.ArmLength.toFixed(2)} m is outside 0..15 m.`);
      if (m.Fov < 30 || m.Fov > 110) problems.push(`Camera mode ${name}: FOV ${m.Fov.toFixed(1)} degrees is outside 30..110.`);
      if (m.PitchFollow < 0 || m.PitchFollow > 1) problems.push(`Camera mode ${name}: pitch follow ${m.PitchFollow.toFixed(2)} is outside 0..1.`);
      if (m.BallBias < 0 || m.BallBias > 1) problems.push(`Camera mode ${name}: ball bias ${m.BallBias.toFixed(2)} is outside 0..1.`);
      if (Math.abs(m.YawOffset) > 90)
        problems.push(
          `Camera mode ${name}: yaw offset ${m.YawOffset.toFixed(1)} degrees is past 90 -- the camera would face the player and W would read as screen-down.`,
        );
      if (Math.abs(m.ViewPitchOffset) > 60)
        problems.push(`Camera mode ${name}: view pitch offset ${m.ViewPitchOffset.toFixed(1)} degrees is past 60.`);
    });
    return problems;
  },
};

/** The ease between two modes when C is pressed. Port of `CameraBlend.cs`. */
export const CameraBlend = {
  DefaultDuration: 0.35,

  /** Smoothstep progress, 0..1. A duration of zero or less is a cut. */
  progress(elapsed: number, duration: number): number {
    if (duration <= 0) return 1;
    const t = clamp(elapsed / duration, 0, 1);
    return t * t * (3 - 2 * t);
  },

  /** Every number of the two modes mixed by `t`. The name is the target's. */
  between: (from: CameraMode, to: CameraMode, t: number): CameraMode =>
    mode(
      to.Name,
      lerpf(from.ArmLength, to.ArmLength, t),
      lerpf(from.PivotRise, to.PivotRise, t),
      lerpf(from.LateralOffset, to.LateralOffset, t),
      lerpf(from.YawOffset, to.YawOffset, t),
      lerpf(from.ViewPitchOffset, to.ViewPitchOffset, t),
      lerpf(from.PitchFollow, to.PitchFollow, t),
      lerpf(from.Fov, to.Fov, t),
      lerpf(from.BallBias, to.BallBias, t),
    ),
};

/** How far the camera leans toward an overhead ball (GDD 7). Port of `CameraBias.cs`. */
export const CameraBias = {
  RampMetres: 2,

  strength: (ballHeightAboveCamera: number, biasHeight: number, bias: number): number =>
    clamp((ballHeightAboveCamera - biasHeight) / CameraBias.RampMetres, 0, 1) * bias,

  pitchToward: (playerPitch: number, ballPitch: number, strength: number, minPitch: number, maxPitch: number): number =>
    lerpf(playerPitch, clamp(ballPitch, minPitch, maxPitch), strength),
};

/** Where the view looks, given where the player aims. Port of `CameraFraming.cs`. */
export const CameraFraming = {
  viewPitch: (leanedPitch: number, m: CameraMode): number =>
    clamp(m.PitchFollow * leanedPitch + m.ViewPitchOffset, CameraModes.ViewMinPitch, CameraModes.ViewMaxPitch),
};

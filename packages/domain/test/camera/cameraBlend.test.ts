import { describe, expect, it } from 'vitest';
import { CameraBlend, CameraModes, type CameraMode } from '../../src/camera/cameraModes.js';

// Port of CameraBlendTests.cs.
const cameraMode = (
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

describe('CameraBlend', () => {
  it('progress is zero at the switch and one at the end', () => {
    expect(CameraBlend.progress(0, 0.35)).toBe(0);
    expect(CameraBlend.progress(0.35, 0.35)).toBeCloseTo(1, 5);
  });

  it('progress clamps past the end', () => {
    expect(CameraBlend.progress(10, 0.35)).toBe(1);
  });

  it.each([[0], [-1]])('zero duration is a cut (%f s)', (duration) => {
    expect(CameraBlend.progress(0, duration)).toBe(1);
  });

  it.each([
    [0.25, 0.15625],
    [0.5, 0.5],
    [0.75, 0.84375],
  ])('progress eases in and out (%f -> %f)', (fraction, expected) => {
    expect(CameraBlend.progress(fraction, 1)).toBeCloseTo(expected, 5);
  });

  it('between at zero is from and at one is to', () => {
    expect(CameraBlend.between(CameraModes.Chase, CameraModes.High, 0)).toEqual({ ...CameraModes.Chase, Name: 'High' });
    expect(CameraBlend.between(CameraModes.Chase, CameraModes.High, 1)).toEqual(CameraModes.High);
  });

  it('between takes the targets name', () => {
    expect(CameraBlend.between(CameraModes.Chase, CameraModes.Street, 0.1).Name).toBe('Street');
  });

  it('between halfway halves every number', () => {
    const from = cameraMode('A', 2, -1, 0, 0, -10, 0, 60, 0);
    const to = cameraMode('B', 4, 1, 1, 90, 10, 1, 80, 0.2);
    expect(CameraBlend.between(from, to, 0.5)).toEqual(cameraMode('B', 3, 0, 0.5, 45, 0, 0.5, 70, 0.1));
  });
});

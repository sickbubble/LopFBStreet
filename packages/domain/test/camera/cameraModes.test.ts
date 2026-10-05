import { describe, expect, it } from 'vitest';
import { CameraModes, type CameraMode } from '../../src/camera/cameraModes.js';

// Port of CameraModesTests.cs.
const ORDER = ['Chase', 'Street', 'High', 'Sideline', 'Shoulder'];

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

describe('CameraModes', () => {
  it('default cycles chase street high sideline shoulder', () => {
    expect(CameraModes.default.map((m) => m.Name)).toEqual(ORDER);
  });

  // Chase is the M0 camera: player.tscn's 5 m arm, Godot's default 75 FOV, the 0.22 lean.
  it('chase is todays camera', () => {
    expect(CameraModes.Chase).toEqual(cameraMode('Chase', 5, 0, 0, 0, 0, 1, 75, 0.22));
  });

  it.each([
    [0, 1],
    [3, 4],
    [4, 0],
  ])('next steps forward and wraps (%i -> %i)', (index, expected) => {
    expect(CameraModes.next(index, 5)).toBe(expected);
  });

  it.each([[-1], [5], [99]])('next with an out of range index starts over (%i)', (index) => {
    expect(CameraModes.next(index, 5)).toBe(0);
  });

  it('next with no modes is zero', () => {
    expect(CameraModes.next(0, 0)).toBe(0);
  });

  it('the default modes have no problems', () => {
    expect(CameraModes.problems(CameraModes.default)).toEqual([]);
  });

  it.each([
    [0, 75, 1, 0, 0],
    [-1, 75, 1, 0, 0],
    [16, 75, 1, 0, 0],
    [5, 20, 1, 0, 0],
    [5, 130, 1, 0, 0],
    [5, 75, 1.5, 0, 0],
    [5, 75, 1, -0.1, 0],
    [5, 75, 1, 0, 120],
  ])('problems reports a bad mode (arm %f, fov %f, follow %f, bias %f, yaw %f)', (arm, fov, follow, bias, yaw) => {
    const mode = cameraMode('Bad', arm, 0, 0, yaw, 0, follow, fov, bias);
    expect(CameraModes.problems([mode])).toHaveLength(1);
  });

  it('problems reports a mode with no name', () => {
    expect(CameraModes.problems([{ ...CameraModes.Chase, Name: '' }])).toHaveLength(1);
  });

  it('problems reports duplicate names', () => {
    expect(CameraModes.problems([CameraModes.Chase, { ...CameraModes.High, Name: 'Chase' }])).toHaveLength(1);
  });

  it('problems reports an empty list', () => {
    expect(CameraModes.problems([])).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { CameraFraming, CameraModes } from '../../src/camera/cameraModes.js';

// Port of CameraFramingTests.cs.
describe('CameraFraming', () => {
  // Chase must render exactly what the M0 camera rendered.
  it.each([[-8], [20], [-60]])('chase view is the leaned pitch (%f)', (pitch) => {
    expect(CameraFraming.viewPitch(pitch, CameraModes.Chase)).toBeCloseTo(pitch, 4);
  });

  // Looking up to loft a pass must not swing a side view round.
  it.each([[-8], [24]])('sideline ignores the aim (%f)', (pitch) => {
    expect(CameraFraming.viewPitch(pitch, CameraModes.Sideline)).toBeCloseTo(-5, 4);
  });

  it.each([
    [-8, -26],
    [24, -10],
  ])('high follows half and looks down (%f -> %f)', (pitch, expected) => {
    expect(CameraFraming.viewPitch(pitch, CameraModes.High)).toBeCloseTo(expected, 4);
  });

  // The wall throw asks for camera pitch +24: the Shoulder eye stays above the floor with 0.2 m to spare.
  it('shoulder at the wall throw stays above the floor', () => {
    const mode = CameraModes.Shoulder;
    const view = CameraFraming.viewPitch(24, mode);
    const eye = 1.5 + mode.PivotRise - mode.ArmLength * Math.sin((view * Math.PI) / 180);

    expect(eye).toBeGreaterThanOrEqual(0.2);
    expect(eye).toBeLessThanOrEqual(1.7);
  });

  it.each([
    [-200, CameraModes.ViewMinPitch],
    [200, CameraModes.ViewMaxPitch],
  ])('view pitch is clamped to the rig (%f -> %f)', (pitch, expected) => {
    expect(CameraFraming.viewPitch(pitch, CameraModes.Chase)).toBe(expected);
  });
});

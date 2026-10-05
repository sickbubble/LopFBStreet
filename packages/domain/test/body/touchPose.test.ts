import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Limb } from '../../src/ball/limb.js';
import { FOOT_SWING_DEGREES, poseAngle, PosePart, posePartOf, poseWeight } from '../../src/body/touchPose.js';
import { DEG_TO_RAD } from '../../src/mathUtil.js';
import { loadTouchPoseSettings } from '../../src/tuning/loaders.js';

const shipped = loadTouchPoseSettings(
  JSON.parse(readFileSync(new URL('../../../../tools/golden/tuning/player.json', import.meta.url), 'utf8')),
);

describe('the touch poses (the body stand-in)', () => {
  it('reads its angles from player.json in radians', () => {
    expect(shipped.ThighRaise).toBeCloseTo(70 * DEG_TO_RAD, 6);
    expect(shipped.ChestArch).toBeCloseTo(35 * DEG_TO_RAD, 6);
    expect(shipped.HeadTilt).toBeCloseTo(35 * DEG_TO_RAD, 6);
    expect(shipped.ShoulderShrug).toBeCloseTo(18 * DEG_TO_RAD, 6);
    expect(shipped.FootSwing).toBeCloseTo(FOOT_SWING_DEGREES * DEG_TO_RAD, 6);
    expect(shipped.Windup).toBe(0.35);
    expect(shipped.Recover).toBe(0.3);
  });

  it('a foot and a thigh on one side turn the same leg, and the chest and the head their own', () => {
    expect(posePartOf(Limb.LeftFoot)).toBe(PosePart.LeftLeg);
    expect(posePartOf(Limb.LeftThigh)).toBe(PosePart.LeftLeg);
    expect(posePartOf(Limb.RightFoot)).toBe(PosePart.RightLeg);
    expect(posePartOf(Limb.Chest)).toBe(PosePart.Chest);
    expect(posePartOf(Limb.Head)).toBe(PosePart.Head);
    expect(posePartOf(Limb.RightShoulder)).toBe(PosePart.RightShoulder);
    expect(posePartOf(Limb.None)).toBe(PosePart.None);
  });

  it('a knee ball raises the thigh further than a foot ball swings it', () => {
    expect(poseAngle(Limb.RightThigh, shipped)).toBeGreaterThan(poseAngle(Limb.RightFoot, shipped));
  });

  it('nothing shows before the windup, all of it at the contact', () => {
    expect(poseWeight(shipped.Windup + 0.01, null, shipped)).toBe(0);
    expect(poseWeight(0, null, shipped)).toBe(1);
    const half = poseWeight(shipped.Windup / 2, null, shipped);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });

  it('after the contact it lets go over the recover, and is gone after it', () => {
    expect(poseWeight(null, 0, shipped)).toBe(1);
    expect(poseWeight(null, shipped.Recover, shipped)).toBe(0);
    expect(poseWeight(null, null, shipped)).toBe(0);
  });

  it('a touch coming while the last one recovers shows the larger of the two', () => {
    expect(poseWeight(0.05, 0.25, shipped)).toBe(Math.max(poseWeight(0.05, null, shipped), poseWeight(null, 0.25, shipped)));
  });
});

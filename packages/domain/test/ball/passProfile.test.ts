import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { BallVerb } from '../../src/ball/ballVerb.js';
import { Limb, limbName } from '../../src/ball/limb.js';
import { LaunchSolver, type Launch } from '../../src/ball/launchSolver.js';
import { clamp } from '../../src/mathUtil.js';
import { loftFor, type LaunchSettings } from '../../src/tuning/ballSettings.js';
import {
  DEFAULT_PASS_PROFILES,
  PASS_PARTS_BY_POWER,
  PassPart,
  passPartName,
  passPartOfLimb,
  profileFor,
  type PassProfiles,
} from '../../src/tuning/passProfiles.js';
import { distance, length, normalize, type Vec3 } from '../../src/vec.js';
import { aimAt, FORWARD, TEST_BANDS, TEST_LAUNCH } from '../support/passFixtures.js';

// Port of PassProfileTests.cs: the pass is played by a part, and the part sets what it can be (S28).
const GRAVITY = 9.81;

const solve = (limb: Limb, aim: Vec3, chargeSeconds = 1, facing: Vec3 = FORWARD): Launch =>
  LaunchSolver.solve({ Aim: aim, Facing: facing, ChargeSeconds: chargeSeconds, BallHeight: 0.2, Limb: limb }, TEST_LAUNCH, TEST_BANDS);

/** `Launch.Speed` in C#: the velocity's length. */
const speedOf = (launch: Launch): number => length(launch.Velocity);

const pitchOf = (v: Vec3): number => (Math.asin(v.y / length(v)) * 180) / Math.PI;

/** Degrees to the right of -Z, flat. */
const yawOf = (v: Vec3): number => (Math.atan2(v.x, -v.z) * 180) / Math.PI;

/**
 * The four pass predicates of C#'s `CarryLevelCheck` these tests call, written
 * out here: `CarryLevelCheck` has no TypeScript port yet. They are the C#
 * bodies line for line, so the tests still check the shipped table and
 * `Ballistics.speedForCharge`, which are the src under test.
 */
const CarryLevelCheck = {
  noPartOutpassesTheFoot(parts: PassProfiles): boolean {
    return PASS_PARTS_BY_POWER.every((part) => profileFor(parts, part).PowerScale <= parts.Foot.PowerScale);
  },
  passOrderHolds(parts: PassProfiles): boolean {
    for (let i = 1; i < PASS_PARTS_BY_POWER.length; i++) {
      const here = profileFor(parts, PASS_PARTS_BY_POWER[i] as PassPart).PowerScale;
      const above = profileFor(parts, PASS_PARTS_BY_POWER[i - 1] as PassPart).PowerScale;
      if (here > above) {
        return false;
      }
    }
    return true;
  },
  onlyAFootPassReachesCatchSpeed(launch: LaunchSettings, catchSpeed: number): boolean {
    return PASS_PARTS_BY_POWER.every((part) => {
      const top = Ballistics.speedForCharge(launch, 1, profileFor(launch.Parts, part).PowerScale);
      return (part === PassPart.Foot) === top >= catchSpeed;
    });
  },
  bestFlatRange(launch: LaunchSettings, part: PassPart, effectiveGravity: number): number {
    const profile = profileFor(launch.Parts, part);
    const speed = Ballistics.speedForCharge(launch, 1, profile.PowerScale);
    const degrees = clamp(45, profile.LoftMinDegrees, Math.max(profile.LoftMaxDegrees, profile.LoftMinDegrees));
    const radians = (degrees * Math.PI) / 180;
    return (speed * speed * Math.sin(2 * radians)) / Math.max(effectiveGravity, Ballistics.MinGravity);
  },
};

/** A limb for each part, and an aim that part can play unclamped. */
const EVERY_PART = (
  [
    [PassPart.Foot, Limb.RightFoot, 0, 30],
    [PassPart.Backheel, Limb.RightFoot, 180, 15],
    [PassPart.Thigh, Limb.LeftThigh, 0, 30],
    [PassPart.Chest, Limb.Chest, 0, 20],
    [PassPart.Shoulder, Limb.RightShoulder, 70, 20],
    [PassPart.Head, Limb.Head, 0, 30],
  ] as const
).map(([part, limb, yaw, pitch]) => [passPartName(part), part, limb, yaw, pitch] as const);

describe('PassProfile', () => {
  // --- power ---

  // The regression guard: a foot pass is exactly S1's, inside the foot's window.
  it.each([
    [0, 3.5],
    [0.5, 7.75],
    [1, 12],
  ])('foot pass is unchanged from S1 (%f s -> %f m/s)', (seconds, speed) => {
    const aim = aimAt(15, 40);
    const launch = solve(Limb.RightFoot, aim, seconds);

    expect(launch.Part).toBe(PassPart.Foot);
    expect(launch.Verb).toBe(BallVerb.Foot);
    expect(speedOf(launch)).toBeCloseTo(speed, 4);
    expect(distance(aim, normalize(launch.Velocity))).toBeCloseTo(0, 4);
    expect(length(launch.Spin)).toBeCloseTo(6 * seconds * Math.cos((40 * Math.PI) / 180), 3);
  });

  it.each(EVERY_PART)('each part scales top speed by its power scale (%s)', (_name, part, limb, yaw, pitch) => {
    const launch = solve(limb, aimAt(yaw, pitch));
    const expected = 12 * profileFor(DEFAULT_PASS_PROFILES, part).PowerScale;

    expect(launch.Part).toBe(part);
    expect(speedOf(launch)).toBeCloseTo(expected, 3);
    expect(launch.PartMaxSpeed).toBeCloseTo(expected, 3);
  });

  // A weak part is a shorter bar, not a weaker tap.
  it.each(EVERY_PART)('every part shares min speed at zero charge (%s)', (_name, part, limb, yaw, pitch) => {
    const launch = solve(limb, aimAt(yaw, pitch), 0);

    expect(launch.Part).toBe(part);
    expect(speedOf(launch)).toBeCloseTo(3.5, 4);
  });

  // One hold for every part: the same button time is the same fraction of the bar.
  it.each(EVERY_PART)('charge ratio is the same curve for every part (%s)', (_name, part, limb, yaw, pitch) => {
    const half = solve(limb, aimAt(yaw, pitch), 0.5);

    expect(half.Part).toBe(part);
    expect(half.ChargeRatio).toBeCloseTo(0.5, 5);
    expect(speedOf(half)).toBeCloseTo((3.5 + half.PartMaxSpeed) / 2, 3);
  });

  // Every part's best pass clears about 4 m, well outside PossessionRadius.
  it.each(EVERY_PART)(
    'every part full charge range clears four metres inside its window (%s)',
    (name, part) => {
      const range = CarryLevelCheck.bestFlatRange(TEST_LAUNCH, part, GRAVITY);
      expect(range, `${name} reaches ${range} m`).toBeGreaterThan(4);
    },
  );

  it('part order is foot head thigh backheel chest shoulder', () => {
    const parts = DEFAULT_PASS_PROFILES;

    expect(parts.Foot.PowerScale).toBeGreaterThan(parts.Head.PowerScale);
    expect(parts.Head.PowerScale).toBeGreaterThan(parts.Thigh.PowerScale);
    expect(parts.Thigh.PowerScale).toBeGreaterThan(parts.Backheel.PowerScale);
    expect(parts.Backheel.PowerScale).toBeGreaterThan(parts.Chest.PowerScale);
    expect(parts.Chest.PowerScale).toBeGreaterThan(parts.Shoulder.PowerScale);
    expect(CarryLevelCheck.passOrderHolds(parts)).toBe(true);
    expect(CarryLevelCheck.noPartOutpassesTheFoot(parts)).toBe(true);
  });

  // Over-hitting a receiver is a risk only the long pass carries.
  it('only a full foot pass reaches catch speed', () => {
    expect(CarryLevelCheck.onlyAFootPassReachesCatchSpeed(TEST_LAUNCH, 9)).toBe(true);
    expect(CarryLevelCheck.onlyAFootPassReachesCatchSpeed(TEST_LAUNCH, 14)).toBe(false);
    expect(CarryLevelCheck.onlyAFootPassReachesCatchSpeed(TEST_LAUNCH, 8)).toBe(false);
  });

  it('a head stronger than the foot is reported', () => {
    const wrong: LaunchSettings = {
      ...TEST_LAUNCH,
      Parts: { ...DEFAULT_PASS_PROFILES, Head: { ...DEFAULT_PASS_PROFILES.Head, PowerScale: 1.2 } },
    };

    expect(CarryLevelCheck.noPartOutpassesTheFoot(wrong.Parts)).toBe(false);
    expect(CarryLevelCheck.passOrderHolds(wrong.Parts)).toBe(false);
  });

  // --- loft ---

  it.each(EVERY_PART)('loft is clamped into the part window (%s)', (_name, part, limb, yaw) => {
    const profile = profileFor(DEFAULT_PASS_PROFILES, part);

    const low = solve(limb, aimAt(yaw, -80));
    const high = solve(limb, aimAt(yaw, 85));

    expect(pitchOf(low.Velocity)).toBeCloseTo(profile.LoftMinDegrees, 2);
    expect(pitchOf(high.Velocity)).toBeCloseTo(profile.LoftMaxDegrees, 2);
  });

  // --- camera pitch to launch pitch (S1, amended 2026-09-23) ---

  /** The shipped mapping: 40 + 1.25 x camera pitch. */
  const MAPPED: LaunchSettings = { ...TEST_LAUNCH, AimLoftOffset: 40, AimLoftGain: 1.25 };

  const solveMapped = (limb: Limb, cameraPitch: number): Launch =>
    LaunchSolver.solve({ Aim: aimAt(0, cameraPitch), Facing: FORWARD, ChargeSeconds: 1, BallHeight: 0.2, Limb: limb }, MAPPED, TEST_BANDS);

  // The developer's F5 finding: "i cant pass the ball against gravity". At rest, the ball now goes up.
  it('the resting camera passes the ball up', () => {
    const rest = solveMapped(Limb.RightFoot, -8);

    expect(pitchOf(rest.Velocity)).toBeCloseTo(30, 2);
    expect(rest.Velocity.y).toBeGreaterThan(0);
  });

  it.each([
    [-32, 0], // looking well down: a flat drive
    [-8, 30], // the resting camera
    [24, 70], // looking up: the foot's highest loft
    [60, 70], // further up is clamped by the part
    [-70, -10], // further down is clamped too
  ])('camera pitch maps to launch pitch then the part clamps it (%f -> %f)', (cameraPitch, launchPitch) => {
    expect(pitchOf(solveMapped(Limb.RightFoot, cameraPitch).Velocity)).toBeCloseTo(launchPitch, 2);
  });

  // Every part lifts the ball off the resting camera, each inside its own window.
  it.each([
    [limbName(Limb.LeftThigh), Limb.LeftThigh, 30],
    [limbName(Limb.Chest), Limb.Chest, 30],
    [limbName(Limb.Head), Limb.Head, 30],
  ] as const)('every part lifts off the resting camera (%s)', (_name, limb, expected) => {
    expect(pitchOf(solveMapped(limb, -8).Velocity)).toBeCloseTo(expected, 2);
  });

  it('no offset and unit gain is camera pitch unchanged', () => {
    expect(loftFor(TEST_LAUNCH, -8)).toBeCloseTo(-8, 5);
  });

  // The loft clamp keeps the heading: only the pitch is moved.
  it('loft clamp keeps the heading', () => {
    const launch = solve(Limb.Head, aimAt(30, 80));

    expect(yawOf(launch.Velocity)).toBeCloseTo(30, 2);
    expect(pitchOf(launch.Velocity)).toBeCloseTo(60, 2);
  });

  // The knee drives up into the ball: no flat thigh drive exists.
  it('a thigh pass always lifts', () => {
    const flat = solve(Limb.RightThigh, FORWARD);
    const down = solve(Limb.RightThigh, aimAt(0, -30));

    expect(pitchOf(flat.Velocity)).toBeCloseTo(5, 2);
    expect(pitchOf(down.Velocity)).toBeCloseTo(5, 2);
  });

  // --- the shoulder's side ---

  it.each([
    [0, 20], // straight ahead: the inner edge
    [-60, 20], // across the body: still the inner edge
    [70, 70], // inside the window: untouched
    [150, 120], // behind its own side: the outer edge
    [-170, 120], // behind, across: nearer the outer edge the short way round
  ])('shoulder pass across the body is clamped to the nearest edge (%f -> %f)', (aimYaw, expectedYaw) => {
    const launch = solve(Limb.RightShoulder, aimAt(aimYaw, 20));

    expect(launch.Part).toBe(PassPart.Shoulder);
    expect(yawOf(launch.Velocity)).toBeCloseTo(expectedYaw, 2);
  });

  it.each([[0], [-60], [70], [150]])('left shoulder window mirrors the right (%f)', (aimYaw) => {
    const right = solve(Limb.RightShoulder, aimAt(aimYaw, 20));
    const left = solve(Limb.LeftShoulder, aimAt(-aimYaw, 20));

    expect(yawOf(left.Velocity)).toBeCloseTo(-yawOf(right.Velocity), 2);
    expect(speedOf(left)).toBeCloseTo(speedOf(right), 4);
  });

  // The window is off the facing, not the world: turn the body and the window turns with it.
  it('shoulder window turns with the body', () => {
    const east: Vec3 = { x: 1, y: 0, z: 0 }; // facing +X: 90 degrees right of -Z
    const launch = solve(Limb.RightShoulder, east, 1, east);

    expect(yawOf(launch.Velocity)).toBeCloseTo(90 + 20, 2);
  });

  // --- which part ---

  it.each([
    [Limb.LeftFoot, PassPart.Backheel],
    [Limb.RightFoot, PassPart.Backheel],
    [Limb.LeftThigh, PassPart.Thigh],
    [Limb.Chest, PassPart.Chest],
    [Limb.RightShoulder, PassPart.Shoulder],
    [Limb.Head, PassPart.Head],
  ].map(([limb, part]) => [limbName(limb as Limb), limb as Limb, part as PassPart] as const))(
    'behind only changes a foot part (%s)',
    (_name, limb, behind) => {
      expect(passPartOfLimb(limb, true)).toBe(behind);
      expect(passPartOfLimb(limb, false)).toBe(behind === PassPart.Backheel ? PassPart.Foot : behind);
    },
  );

  it.each([
    [Limb.RightFoot, BallVerb.Foot],
    [Limb.LeftThigh, BallVerb.Thigh],
    [Limb.Chest, BallVerb.Chest],
    [Limb.LeftShoulder, BallVerb.Chest],
    [Limb.Head, BallVerb.Head],
  ].map(([limb, verb]) => [limbName(limb as Limb), limb as Limb, verb as BallVerb] as const))(
    'the verb is the limb level not the ball height (%s)',
    (_name, limb, verb) => {
      expect(solve(limb, aimAt(limb === Limb.LeftShoulder ? -60 : 0, 20)).Verb).toBe(verb);
    },
  );

  it('a foot aimed behind is a backheel pass', () => {
    const launch = solve(Limb.LeftFoot, aimAt(180, 20));

    expect(launch.Part).toBe(PassPart.Backheel);
    expect(launch.Verb).toBe(BallVerb.Backheel);
    expect(speedOf(launch)).toBeCloseTo(12 * 0.58, 3);
  });

  // --- spin ---

  it.each(EVERY_PART)(
    'spin scales by part and is zero off head chest and shoulder (%s)',
    (_name, part, limb, yaw, pitch) => {
      const launch = solve(limb, aimAt(yaw, pitch));
      const foot = solve(Limb.RightFoot, aimAt(0, pitch));
      const spinScale = profileFor(DEFAULT_PASS_PROFILES, part).SpinScale;

      expect(length(launch.Spin)).toBeCloseTo(length(foot.Spin) * spinScale, 3);

      if (part === PassPart.Head || part === PassPart.Chest || part === PassPart.Shoulder || part === PassPart.Backheel) {
        expect(length(launch.Spin)).toBeCloseTo(0, 5);
      }
    },
  );
});

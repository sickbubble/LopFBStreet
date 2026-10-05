import type { StrideSettings } from '../body/strideClock.js';
import { FOOT_SWING_DEGREES, type TouchPoseSettings } from '../body/touchPose.js';
import { DEG_TO_RAD } from '../mathUtil.js';
import type { FollowSettings } from '../player/followRule.js';
import type {
  BallSettings,
  BounceSettings,
  CarryLevel,
  LaunchSettings,
} from './ballSettings.js';
import type { BodyModel } from './bodyModel.js';
import type { PassProfile, PassProfiles } from './passProfiles.js';

/**
 * Strict loaders for `tools/golden/tuning/*.json`. The domain never reads a
 * file: the game imports the JSON and hands the parsed value here. A missing
 * or non-numeric key throws by name, so a stale dump fails at boot instead of
 * playing with an undefined.
 */

type Json = Record<string, unknown>;

function obj(parent: Json, key: string, path: string): Json {
  const v = parent[key];
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`tuning: ${path}.${key} is missing or not an object`);
  return v as Json;
}

function num(parent: Json, key: string, path: string): number {
  const v = parent[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`tuning: ${path}.${key} is missing or not a number`);
  return v;
}

function root(json: unknown, name: string): Json {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error(`tuning: ${name} is not an object`);
  return json as Json;
}

const numbers = <K extends string>(o: Json, path: string, keys: readonly K[]): Record<K, number> => {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = num(o, k, path);
  return out;
};

function level(levels: Json, name: string): CarryLevel {
  return numbers(obj(levels, name, 'Bounce.Levels'), `Bounce.Levels.${name}`, [
    'TouchHeight',
    'HoldOffset',
    'Apex',
    'SpeedFactor',
    'LeadFactor',
    'Correction',
    'BreakRadius',
    'MicroMotion',
  ] as const);
}

function profile(parts: Json, name: string): PassProfile {
  const p = obj(parts, name, 'Launch.Parts');
  const path = `Launch.Parts.${name}`;
  return {
    ...numbers(p, path, ['PowerScale', 'LoftMinDegrees', 'LoftMaxDegrees', 'SpinScale'] as const),
    Side: numbers(obj(p, 'Side', path), `${path}.Side`, ['MinDegrees', 'MaxDegrees'] as const),
  };
}

/** `ball.json`: the C# `BallSettings` record, serialised by GoldenDump. Angles stay degrees, as in C#. */
export function loadBallSettings(json: unknown): BallSettings {
  const r = root(json, 'ball.json');
  const b = obj(r, 'Bounce', '');
  const levels = obj(b, 'Levels', 'Bounce');
  const l = obj(r, 'Launch', '');
  const parts = obj(l, 'Parts', 'Launch');

  const bounce: BounceSettings = {
    ...numbers(b, 'Bounce', [
      'BounceMaxApex',
      'BounceChargeTime',
      'FlightEase',
      'TouchLeadPerSpeed',
      'TouchMaxSpeed',
      'KeepUpReach',
      'BehindReach',
      'CarryRadius',
      'StallCoupling',
      'StallRestore',
      'StallDamping',
    ] as const),
    Levels: { Foot: level(levels, 'Foot'), Thigh: level(levels, 'Thigh'), Chest: level(levels, 'Chest'), Head: level(levels, 'Head') },
    Trap: numbers(obj(b, 'Trap', 'Bounce'), 'Bounce.Trap', [
      'WindowBefore',
      'WindowAfter',
      'Rebound',
      'MaxResidual',
      'LiftPerSpeed',
    ] as const),
    Shoulder: numbers(obj(b, 'Shoulder', 'Bounce'), 'Bounce.Shoulder', ['TouchHeight', 'HoldOffset'] as const),
  };

  const pp: PassProfiles = {
    Foot: profile(parts, 'Foot'),
    Backheel: profile(parts, 'Backheel'),
    Thigh: profile(parts, 'Thigh'),
    Chest: profile(parts, 'Chest'),
    Shoulder: profile(parts, 'Shoulder'),
    Head: profile(parts, 'Head'),
  };

  const launch: LaunchSettings = {
    ...numbers(l, 'Launch', ['MinSpeed', 'MaxSpeed', 'ChargeTime', 'LaunchSpin', 'AimLoftOffset', 'AimLoftGain'] as const),
    Parts: pp,
  };

  return {
    Body: numbers(obj(r, 'Body', ''), 'Body', ['Radius', 'Mass', 'GravityScale', 'LinearDamp', 'AngularDamp', 'Bounce', 'Friction'] as const),
    Possession: numbers(obj(r, 'Possession', ''), 'Possession', ['Radius', 'OwnershipMargin', 'OwnershipDwell', 'TouchCooldown'] as const),
    Bounce: bounce,
    Carry: numbers(obj(r, 'Carry', ''), 'Carry', ['SlowTime', 'RecoverTime'] as const),
    Launch: launch,
    Reception: numbers(obj(r, 'Reception', ''), 'Reception', ['CatchSpeed', 'RicochetRestitution', 'CatchWindow'] as const),
    Bands: numbers(obj(r, 'Bands', ''), 'Bands', ['FootMax', 'ThighMax', 'ChestMax'] as const),
  };
}

/** The `PlayerMotor` exports the web reads, from `player.json`. */
export interface PlayerSettings {
  readonly WalkSpeed: number;
  readonly SprintSpeed: number;
  readonly Accel: number;
  readonly AirAccel: number;
  readonly JumpSpeed: number;
  readonly TurnSpeed: number;
  readonly BodyRadius: number;
  readonly BodyHeight: number;
  readonly Body: BodyModel;
  readonly Stride: StrideSettings;
  /** The follow's numbers; the top speed is the sprint, as `PlayerMotor.FollowTuning` built it. */
  readonly Follow: FollowSettings;
}

/** `values` first, then `sceneOverrides` on top: the order Godot applied them in. */
function flatValues(json: unknown, name: string): Json {
  const r = root(json, name);
  const values = obj(r, 'values', name);
  const overrides = r['sceneOverrides'] === undefined ? {} : obj(r, 'sceneOverrides', name);
  return { ...values, ...overrides };
}

/** `player.json`. */
export function loadPlayerSettings(json: unknown): PlayerSettings {
  const v = flatValues(json, 'player.json');
  const n = (k: string): number => num(v, k, 'player.json');

  return {
    WalkSpeed: n('WalkSpeed'),
    SprintSpeed: n('SprintSpeed'),
    Accel: n('Accel'),
    AirAccel: n('AirAccel'),
    JumpSpeed: n('JumpSpeed'),
    TurnSpeed: n('TurnSpeed'),
    BodyRadius: n('BodyRadius'),
    BodyHeight: n('BodyHeight'),
    Body: {
      Foot: { Height: n('HipHeight'), Lateral: n('HipLateral'), Reach: n('FootReach') },
      Thigh: { Height: n('HipHeight'), Lateral: n('HipLateral'), Reach: n('ThighReach') },
      Chest: { Height: n('SternumHeight'), Lateral: 0, Reach: n('ChestReach') },
      Head: { Height: n('CrownHeight'), Lateral: 0, Reach: n('HeadReach') },
      SideDeadband: n('SideDeadband'),
      Shoulder: { Height: n('ShoulderHeight'), Lateral: n('ShoulderLateral'), Reach: n('ShoulderReach') },
      ShoulderLine: n('ShoulderLine'),
      ThighSpot: n('ThighSpot'),
    },
    Stride: {
      WalkStride: n('WalkStride'),
      RunStride: n('RunStride'),
      WalkSpeed: n('StrideWalkSpeed'),
      RunSpeed: n('StrideRunSpeed'),
      MovingAbove: n('MovingAbove'),
    },
    Follow: {
      TopSpeed: n('SprintSpeed'),
      MinTime: n('FollowMinTime'),
      AimSpeed: n('FollowAimSpeed'),
      TrapAssist: n('FollowTrapAssist'),
    },
  };
}

/** The `PlayerAnimator` thresholds, from `animator.json`. Speeds in m/s. */
export interface AnimatorSettings {
  readonly IdleBelow: number;
  readonly WalkAbove: number;
  readonly RunAbove: number;
  readonly SprintAbove: number;
  readonly Blend: number;
}

export function loadAnimatorSettings(json: unknown): AnimatorSettings {
  const v = flatValues(json, 'animator.json');
  return numbers(v, 'animator.json', ['IdleBelow', 'WalkAbove', 'RunAbove', 'SprintAbove', 'Blend'] as const);
}

/** The touch poses' numbers, from `player.json`; degrees there, radians here, as `PlayerMotor` converted them. */
export function loadTouchPoseSettings(json: unknown): TouchPoseSettings {
  const v = flatValues(json, 'player.json');
  const n = (k: string): number => num(v, k, 'player.json');
  return {
    Windup: n('PoseWindup'),
    Recover: n('PoseRecover'),
    FootSwing: FOOT_SWING_DEGREES * DEG_TO_RAD,
    ThighRaise: n('ThighMaxRaiseDegrees') * DEG_TO_RAD,
    ChestArch: n('ChestArchDegrees') * DEG_TO_RAD,
    HeadTilt: n('HeadTiltDegrees') * DEG_TO_RAD,
    HeadNod: n('HeadNodDegrees') * DEG_TO_RAD,
    ShoulderShrug: n('ShoulderShrugDegrees') * DEG_TO_RAD,
  };
}

import { clamp, DEG_TO_RAD } from '../mathUtil.js';
import { loftFor, verbFor, type LaunchSettings, type VerbBands } from '../tuning/ballSettings.js';
import {
  passPartOfLimb,
  passPartOfVerb,
  PassPart,
  profileFor,
  sideWindowExists,
  type PassProfile,
  type SideWindow,
} from '../tuning/passProfiles.js';
import { add, cross, dot, lengthSq, normalize, scale, UP, type Vec3 } from '../vec.js';
import { Ballistics } from './ballistics.js';
import { BallVerb } from './ballVerb.js';
import { BodySide, Limb, Limbs } from './limb.js';

/** What the player did: how they aimed, how long they held, where the ball was. */
export interface LaunchRequest {
  /** Full 3D aim: the camera's forward. A zero vector falls back to the facing. */
  readonly Aim: Vec3;
  /** Where the body points, flat. Tells a backheel from a foot pass. */
  readonly Facing: Vec3;
  readonly ChargeSeconds: number;
  /** Ball centre above the feet; read only when no limb is planned. */
  readonly BallHeight: number;
  /** The limb that plays it (S28); `Limb.None` when nothing is planned. */
  readonly Limb: Limb;
}

/** What to do with the ball. */
export interface Launch {
  readonly Velocity: Vec3;
  readonly Spin: Vec3;
  readonly Verb: BallVerb;
  readonly ChargeRatio: number;
  readonly Part: PassPart;
  readonly Limb: Limb;
  readonly PartMaxSpeed: number;
}

export const NO_LAUNCH: Launch = {
  Velocity: { x: 0, y: 0, z: 0 },
  Spin: { x: 0, y: 0, z: 0 },
  Verb: BallVerb.Foot,
  ChargeRatio: 0,
  Part: PassPart.Foot,
  Limb: Limb.None,
  PartMaxSpeed: 0,
};

const FLAT_EPSILON = 0.0001;
const DEFAULT_FORWARD: Vec3 = { x: 0, y: 0, z: -1 };

function wrap(degrees: number): number {
  let d = degrees % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

/**
 * Charge + aim + the part -> velocity, spin and verb (S1, S28). No timing
 * window: releasing early is a weaker pass, never a failure. Port of
 * `LaunchSolver.cs`.
 */
export const LaunchSolver = {
  /** Cosine beyond which an aim counts as behind the body: about 110 degrees. */
  BehindThreshold: -0.34,

  chargeRatio: (chargeSeconds: number, launch: LaunchSettings): number =>
    clamp(chargeSeconds / Math.max(launch.ChargeTime, 0.001), 0, 1),

  isBehind(aim: Vec3, facing: Vec3): boolean {
    const f: Vec3 = { x: aim.x, y: 0, z: aim.z };
    const ff: Vec3 = { x: facing.x, y: 0, z: facing.z };
    if (lengthSq(f) < FLAT_EPSILON || lengthSq(ff) < FLAT_EPSILON) return false;
    return dot(normalize(f), normalize(ff)) < LaunchSolver.BehindThreshold;
  },

  solve(request: LaunchRequest, launch: LaunchSettings, bands: VerbBands): Launch {
    const ratio = LaunchSolver.chargeRatio(request.ChargeSeconds, launch);
    const aim = aimDirection(request);
    const behind = LaunchSolver.isBehind(aim, request.Facing);

    let part: PassPart;
    let verb: BallVerb;
    if (request.Limb !== Limb.None) {
      part = passPartOfLimb(request.Limb, behind);
      verb = Limbs.levelOf(request.Limb);
    } else {
      verb = verbFor(bands, request.BallHeight);
      part = passPartOfVerb(verb, behind);
    }

    if (part === PassPart.Backheel) verb = BallVerb.Backheel;

    const profile = profileFor(launch.Parts, part);
    const direction = shape(aim, request.Facing, Limbs.sideOf(request.Limb), profile, launch);
    const speed = Ballistics.speedForCharge(launch, ratio, profile.PowerScale);

    return {
      Velocity: scale(direction, speed),
      Spin: scale(cross(UP, direction), launch.LaunchSpin * ratio * profile.SpinScale),
      Verb: verb,
      ChargeRatio: ratio,
      Part: part,
      Limb: request.Limb,
      PartMaxSpeed: Ballistics.speedForCharge(launch, 1, profile.PowerScale),
    };
  },

  /** Clamp a signed angle into a window, an angle outside going to the nearer edge the short way round. */
  clampToWindow(degrees: number, side: SideWindow): number {
    if (!sideWindowExists(side) || (degrees >= side.MinDegrees && degrees <= side.MaxDegrees)) return degrees;
    const toMin = Math.abs(wrap(degrees - side.MinDegrees));
    const toMax = Math.abs(wrap(degrees - side.MaxDegrees));
    return toMin <= toMax ? side.MinDegrees : side.MaxDegrees;
  },
};

/** The aim clamped into what the part can play: the side window, then the loft window. A unit vector. */
function shape(aim: Vec3, facing: Vec3, side: BodySide, profile: PassProfile, launch: LaunchSettings): Vec3 {
  const flatFacing: Vec3 = { x: facing.x, y: 0, z: facing.z };
  const hasFacing = lengthSq(flatFacing) > FLAT_EPSILON;
  const forward = hasFacing ? normalize(flatFacing) : DEFAULT_FORWARD;

  const flatAim: Vec3 = { x: aim.x, y: 0, z: aim.z };
  let heading = lengthSq(flatAim) > FLAT_EPSILON ? normalize(flatAim) : forward;

  if (sideWindowExists(profile.Side) && hasFacing && side !== BodySide.None) {
    const right = cross(forward, UP);
    const sign = side === BodySide.Right ? 1 : -1;
    const off = Math.atan2(dot(heading, right) * sign, dot(heading, forward)) / DEG_TO_RAD;
    const clamped = LaunchSolver.clampToWindow(off, profile.Side) * DEG_TO_RAD;
    heading = add(scale(forward, Math.cos(clamped)), scale(right, Math.sin(clamped) * sign));
  }

  const loftMin = profile.LoftMinDegrees;
  const loftMax = Math.max(profile.LoftMaxDegrees, loftMin);
  let pitch = loftFor(launch, Math.asin(clamp(aim.y, -1, 1)) / DEG_TO_RAD);
  pitch = Math.min(Math.max(pitch, loftMin), loftMax) * DEG_TO_RAD;

  return normalize(add(scale(heading, Math.cos(pitch)), scale(UP, Math.sin(pitch))));
}

function aimDirection(request: LaunchRequest): Vec3 {
  if (lengthSq(request.Aim) > FLAT_EPSILON) return normalize(request.Aim);
  return lengthSq(request.Facing) > FLAT_EPSILON ? normalize(request.Facing) : DEFAULT_FORWARD;
}

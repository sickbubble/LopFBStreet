import { expect } from 'vitest';
import {
  add,
  BounceSolver,
  CarrySpeed,
  clamp,
  dot,
  FollowRule,
  Locomotion,
  lengthSq,
  normalize,
  planExists,
  STANDING,
  scale,
  withY,
  ZERO,
  type BodyModel,
  type BounceInput,
  type BounceSettings,
  type CarryLevels,
  type CarrySettings,
  type ContactPlan,
  type FollowSettings,
  type ShoulderTouch,
  type StrideState,
  type TrapSettings,
  type Vec3,
} from '../../src/index.js';

/**
 * A player keeping a ball up, stepped at the project's 120 Hz the way the
 * engine steps it: the motor first, reading the plan the ball published last
 * step; then the ball's solver, which sets its velocity; then gravity and
 * motion. Every rule is the domain's own -- the solver, the follow, the
 * motor's ramp and turn, the carry cap. What stands in for the engine is a
 * ballistic ball on a flat floor. Port of `Support/CarrySim.cs` (godot-final);
 * see the Godot build's docs/IMPLEMENTATION.md S23.
 *
 * The numbers are the shipped ones, copied here on purpose so a change to
 * either is a decision, not a drift.
 */

export const STEP = 1 / 120;
export const GRAVITY = 9.81;
/** FIFA size-5 spec. */
export const RADIUS = 0.11;

export const WALK_SPEED = 5;
export const SPRINT_SPEED = 8;
export const ACCEL = 45;
export const TURN_SPEED = 12;

/** C#'s `default(StrideState)`: not the Standing value (whose Length is 1). */
export const DEFAULT_STRIDE: StrideState = { Phase: 0, Length: 0, Moving: false };

const level = (
  TouchHeight: number,
  HoldOffset: number,
  Apex: number,
  SpeedFactor: number,
  LeadFactor: number,
  Correction: number,
  BreakRadius: number,
  MicroMotion: number,
) => ({ TouchHeight, HoldOffset, Apex, SpeedFactor, LeadFactor, Correction, BreakRadius, MicroMotion });

/** The shipped ladder. The chest holds since S27 and the head since S29. */
export const SHIPPED_LEVELS: CarryLevels = {
  Foot: level(0.25, 0.3, 0.6, 0.6, 1.0, 0.4, 0, 0),
  Thigh: level(0.85, 0.23, 1.2, 0.5, 0.75, 0.55, 0, 0.04),
  Chest: level(1.1, 0.14, 1.63, 0.4, 0.5, 0.75, 0.25, 0.03),
  Head: level(1.55, 0.03, 1.9, 0.3, 0.35, 0.85, 0.15, 0.02),
};

export const SHIPPED_SHOULDER: ShoulderTouch = { TouchHeight: 1.28, HoldOffset: 0.06 };

export const SHIPPED_TRAP: TrapSettings = {
  WindowBefore: 0.12,
  WindowAfter: 0.12,
  Rebound: 0.3,
  MaxResidual: 2.8,
  LiftPerSpeed: 0.04,
};

export const SHIPPED_BOUNCE: BounceSettings = {
  BounceMaxApex: 2.0,
  BounceChargeTime: 0.6,
  FlightEase: 0.5,
  TouchLeadPerSpeed: 0.05,
  TouchMaxSpeed: 12,
  KeepUpReach: 1.5,
  BehindReach: 0.2,
  CarryRadius: 0.65,
  StallCoupling: 0.08,
  StallRestore: 6,
  StallDamping: 4,
  Levels: SHIPPED_LEVELS,
  Trap: SHIPPED_TRAP,
  Shoulder: SHIPPED_SHOULDER,
};

export const MANNEQUIN: BodyModel = {
  Foot: { Height: 0.74, Lateral: 0.07, Reach: 0.55 },
  Thigh: { Height: 0.74, Lateral: 0.07, Reach: 0.4 },
  Chest: { Height: 1.04, Lateral: 0, Reach: 0.3 },
  Head: { Height: 1.45, Lateral: 0, Reach: 0.25 },
  SideDeadband: 0.05,
  Shoulder: { Height: 1.17, Lateral: 0.14, Reach: 0.26 },
  ShoulderLine: 0.1,
  ThighSpot: 0,
};

export const SHIPPED_FOLLOW: FollowSettings = { TopSpeed: SPRINT_SPEED, MinTime: 0.05, AimSpeed: 0.5, TrapAssist: 0.35 };

const CARRY: CarrySettings = { SlowTime: 0.6, RecoverTime: 0.15 };

/**
 * An axis-aligned box the ball comes off and the body walks through: the
 * washing line's one collider. It spans the lane in X, runs from NearZ to
 * FarZ along it (forward is -Z, so far is the smaller), and fills Underside
 * to Top. Restitution 0.72 by default, the ball's own shipped bounce.
 */
export class BallOnlyBox {
  constructor(
    readonly NearZ: number,
    readonly FarZ: number,
    readonly Underside: number,
    readonly Top: number,
    readonly Restitution = 0.72,
  ) {}

  /** The ball pushed out along the shallowest face, its speed into that face reflected; null when it does not touch. */
  collide(ball: Vec3, velocity: Vec3, radius: number): { At: Vec3; Velocity: Vec3 } | null {
    const intoNear = this.NearZ + radius - ball.z;
    const intoFar = ball.z - (this.FarZ - radius);
    const intoBottom = ball.y + radius - this.Underside;
    const intoTop = this.Top + radius - ball.y;

    if (intoNear <= 0 || intoFar <= 0 || intoBottom <= 0 || intoTop <= 0) {
      return null;
    }

    const least = Math.min(Math.min(intoNear, intoFar), Math.min(intoBottom, intoTop));

    if (least === intoNear) {
      return { At: { ...ball, z: this.NearZ + radius }, Velocity: { ...velocity, z: Math.abs(velocity.z) * this.Restitution } };
    }

    if (least === intoFar) {
      return { At: { ...ball, z: this.FarZ - radius }, Velocity: { ...velocity, z: -Math.abs(velocity.z) * this.Restitution } };
    }

    if (least === intoBottom) {
      return { At: { ...ball, y: this.Underside - radius }, Velocity: { ...velocity, y: -Math.abs(velocity.y) * this.Restitution } };
    }

    return { At: { ...ball, y: this.Top + radius }, Velocity: { ...velocity, y: Math.abs(velocity.y) * this.Restitution } };
  }
}

/**
 * The cloth volume in its own frame (Godot's `Level/ClothBox`). Level/Cloth is
 * not ported to src; just enough of it lives here for the sim.
 */
export interface ClothBox {
  readonly HalfWidth: number;
  readonly HalfSpan: number;
  readonly Underside: number;
  readonly Top: number;
}

/** `Cloth.Holds`: whether a ball at `local` (in the cloth's frame) is in the cloth. */
export const clothHolds = (local: Vec3, radius: number, box: ClothBox): boolean =>
  Math.abs(local.x) <= box.HalfWidth &&
  Math.abs(local.z) <= box.HalfSpan + radius &&
  local.y >= box.Underside &&
  local.y - radius <= box.Top;

/** `Cloth.Drag`: flat speed decays at `drag`/s, rise at `lift`/s, a fall not at all. */
export function clothDrag(velocity: Vec3, drag: number, lift: number, step: number): Vec3 {
  const flatDecay = Math.exp(-Math.max(drag, 0) * Math.max(step, 0));
  const rise = Math.exp(-Math.max(lift, 0) * Math.max(step, 0));
  return { x: velocity.x * flatDecay, y: velocity.y > 0 ? velocity.y * rise : velocity.y, z: velocity.z * flatDecay };
}

/** Cloth across the lane, centred at CenterZ on the lane's axis (S35). */
export class SimCloth {
  constructor(
    readonly CenterZ: number,
    readonly Box: ClothBox,
    readonly Drag = 16,
    readonly Lift = 30,
  ) {}

  /** The shipped washing line: a 6 m lane, 4 m of laundry from 0.95 to 2.60. */
  static line(centerZ: number): SimCloth {
    return new SimCloth(centerZ, { HalfWidth: 6 * 0.5, HalfSpan: 4 * 0.5, Underside: 0.95, Top: 2.6 });
  }

  get NearZ(): number {
    return this.CenterZ + this.Box.HalfSpan;
  }

  get FarZ(): number {
    return this.CenterZ - this.Box.HalfSpan;
  }

  local(world: Vec3): Vec3 {
    return { ...world, z: world.z - this.CenterZ };
  }
}

export interface CarrySimOptions {
  readonly settings?: BounceSettings;
  readonly follow?: FollowSettings;
  readonly ball?: Vec3;
  readonly ballVelocity?: Vec3;
  readonly body?: BodyModel;
  readonly laundry?: BallOnlyBox | null;
  readonly reportDeflections?: boolean;
  readonly cloth?: SimCloth | null;
}

export class CarrySim {
  readonly settings: BounceSettings;
  readonly follow: FollowSettings;
  readonly body: BodyModel;
  readonly solver = new BounceSolver();

  ball: Vec3;
  ballVelocity: Vec3;
  owner: Vec3 = ZERO;
  ownerVelocity: Vec3 = ZERO;
  /** The model's yaw; 0 faces -Z. */
  yaw = 0;
  time = 0;
  /** How many times the ball came down onto the floor. A kept-up ball never does. */
  floorHits = 0;
  /** Steps where the ball was under control, a contact was ahead, and the plan said miss. */
  shownMisses = 0;
  /** The furthest the ball got from its owner, flat, since the first touch. */
  furthestAway = 0;
  /** The longest time between two touches, since the first. */
  longestGap = 0;

  /** A ball-only box across the lane, or none. */
  readonly laundry: BallOnlyBox | null;
  /** Whether a contact with the laundry is reported to the solver as a deflection (S34). */
  readonly reportDeflections: boolean;
  laundryContacts = 0;

  /** Cloth across the lane (S35), or none. */
  readonly cloth: SimCloth | null;
  clothEntries = 0;
  clothSteps = 0;

  /** The slowest the owner moved along the stick, m/s, since resetMeasures. */
  slowestAlongStick = Number.MAX_VALUE;
  /** The widest the body faced from the stick, degrees. */
  widestFromStick = 0;

  private readonly carry = new CarrySpeed();
  private deflected = false;
  private inCloth = false;
  private lastTouchTime = -1;
  private seenTouches = 0;

  constructor(options: CarrySimOptions = {}) {
    this.settings = options.settings ?? SHIPPED_BOUNCE;
    this.follow = options.follow ?? SHIPPED_FOLLOW;
    this.body = options.body ?? MANNEQUIN;
    this.laundry = options.laundry ?? null;
    this.reportDeflections = options.reportDeflections ?? true;
    this.cloth = options.cloth ?? null;

    // A real pickup: owned, not yet under control. The first touch is the trap (S24).
    this.ball = options.ball ?? { x: 0, y: 0.8, z: -this.settings.Levels.Foot.HoldOffset };
    this.ballVelocity = options.ballVelocity ?? ZERO;
    this.solver.onPickedUp(this.ball.y, this.settings);
  }

  get facing(): Vec3 {
    return Locomotion.forwardOf(this.yaw);
  }

  resetMeasures(): void {
    this.slowestAlongStick = Number.MAX_VALUE;
    this.widestFromStick = 0;
  }

  /** Run for `seconds` with the stick held at `wish` (unit or zero, flat). */
  run(seconds: number, wish: Vec3, sprint = false): void {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
      this.tick(wish, sprint);
    }
  }

  /** Run until the next touch fires, then `into` seconds more. */
  runIntoNextFlight(into: number, wish: Vec3, sprint = false): void {
    const touches = this.solver.touches;
    for (let i = 0; i < 1200 && this.solver.touches === touches; i++) {
      this.tick(wish, sprint);
    }

    this.run(into, wish, sprint);
  }

  tick(wish: Vec3, sprint: boolean): void {
    const cap = sprint ? SPRINT_SPEED : WALK_SPEED;
    const intent = scale(wish, cap);

    // --- the motor, reading last step's plan
    const carry = this.carry.update(this.solver.speedFactor, STEP, CARRY);
    const plan: ContactPlan = this.solver.plan;

    let target: Vec3;
    let turnTo: Vec3;
    if (plan.Following) {
      target = FollowRule.velocityTo(plan.Stand, this.owner, plan.TimeToContact, this.follow);
      turnTo = plan.Forward;
    } else {
      target = scale(wish, cap * carry);
      turnTo = wish;
    }

    this.ownerVelocity = Locomotion.step(this.ownerVelocity, target, ACCEL, STEP);
    this.owner = add(this.owner, scale(this.ownerVelocity, STEP));

    if (lengthSq(turnTo) > 0.01) {
      this.yaw = Locomotion.turnToward(this.yaw, turnTo, TURN_SPEED, STEP);
    }

    // --- the washing line: is the ball in the cloth
    const soaked = this.cloth !== null && clothHolds(this.cloth.local(this.ball), RADIUS, this.cloth.Box);
    const wentIn = soaked && !this.inCloth;
    this.inCloth = soaked;
    if (soaked) {
      this.clothSteps++;
    }

    if (wentIn) {
      this.clothEntries++;
    }

    // --- the ball's solver sets the velocity
    const grounded = this.ball.y <= RADIUS + 0.002;
    const input: BounceInput = {
      BallPosition: this.ball,
      BallVelocity: this.ballVelocity,
      HasOwner: true,
      OwnerPosition: this.owner,
      OwnerVelocity: this.ownerVelocity,
      OwnerIntent: intent,
      OwnerFacing: this.facing,
      OwnerRise: 0,
      OwnerStride: STANDING,
      OwnerBody: this.body,
      IsGrounded: grounded,
      BallRadius: RADIUS,
      Step: STEP,
      EffectiveGravity: GRAVITY,
      OwnerFollow: this.follow,
      Deflected: (this.deflected && this.reportDeflections) || wentIn,
      DeflectedSoftly: wentIn,
    };

    this.ballVelocity = this.solver.solve(input, this.settings);

    // The cloth acts on whatever the touch decided (S35).
    if (soaked && this.cloth !== null) {
      this.ballVelocity = clothDrag(this.ballVelocity, this.cloth.Drag, this.cloth.Lift, STEP);
    }

    // --- the physics server: gravity, motion, a floor
    this.ballVelocity = withY(this.ballVelocity, this.ballVelocity.y - GRAVITY * STEP);
    this.ball = add(this.ball, scale(this.ballVelocity, STEP));

    if (this.ball.y < RADIUS) {
      if (this.ballVelocity.y < -0.5) {
        this.floorHits++;
      }

      this.ball = withY(this.ball, RADIUS);
      this.ballVelocity = withY(this.ballVelocity, -this.ballVelocity.y * 0.5);
    }

    // The engine reports a contact in the next step's body state, so the
    // solver hears of it one step late -- as it does in the game.
    this.deflected = false;
    if (this.laundry !== null) {
      const hit = this.laundry.collide(this.ball, this.ballVelocity, RADIUS);
      if (hit !== null) {
        this.ball = hit.At;
        this.ballVelocity = hit.Velocity;
        this.deflected = true;
        this.laundryContacts++;
      }
    }

    this.time += STEP;
    this.record();
    this.measureAgainst(wish);
  }

  private measureAgainst(wish: Vec3): void {
    if (lengthSq(wish) < 0.01) {
      return;
    }

    const stick = normalize(withY(wish, 0));
    this.slowestAlongStick = Math.min(this.slowestAlongStick, dot(withY(this.ownerVelocity, 0), stick));

    const cos = clamp(dot(this.facing, stick), -1, 1);
    this.widestFromStick = Math.max(this.widestFromStick, Math.acos(cos) * (180 / Math.PI));
  }

  private record(): void {
    if (this.solver.touches !== this.seenTouches) {
      if (this.lastTouchTime >= 0) {
        this.longestGap = Math.max(this.longestGap, this.time - this.lastTouchTime);
      }

      this.lastTouchTime = this.time;
      this.seenTouches = this.solver.touches;
    }

    if (this.seenTouches === 0) {
      return;
    }

    const fx = this.ball.x - this.owner.x;
    const fz = this.ball.z - this.owner.z;
    this.furthestAway = Math.max(this.furthestAway, Math.sqrt(fx * fx + fz * fz));

    const plan = this.solver.plan;
    if (this.solver.controlled && planExists(plan) && plan.TimeToContact > 0 && !plan.Reachable) {
      this.shownMisses++;
    }
  }
}

/**
 * C#'s `Assert.Equal(Vector3, Vector3)`: exact, component by component, with
 * -0 equal to 0 (adding 0 turns -0 into +0).
 */
export function expectVec(actual: Vec3, expected: Vec3): void {
  expect([actual.x + 0, actual.y + 0, actual.z + 0]).toEqual([expected.x + 0, expected.y + 0, expected.z + 0]);
}

/** A string.Format with InvariantCulture's "0.00": toFixed is culture-free. */
export const say = (text: string, value: number, digits = 2): string => text.replace('{0}', value.toFixed(digits));

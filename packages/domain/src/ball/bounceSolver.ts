import { clamp, inverseLerp, lerpf } from '../mathUtil.js';
import {
  holdOffsetFor,
  levelFor,
  levelForApex,
  levelForHeight,
  POP_MARGIN,
  shoulderExists,
  stalls,
  type BounceSettings,
  type CarryLevel,
  type LaunchSettings,
  type TrapSettings,
  type VerbBands,
} from '../tuning/ballSettings.js';
import { add, cross, dot, flat, length, lengthSq, normalize, scale, sub, UP, withY, ZERO, type Vec3 } from '../vec.js';
import { Ballistics } from './ballistics.js';
import { BallVerb } from './ballVerb.js';
import { NO_PLAN, partUnderTheBall, planExists, TouchKind, type BounceInput, type ContactPlan } from './contactPlan.js';
import { ContactPlanner } from './contactPlanner.js';
import { LaunchSolver, NO_LAUNCH, type Launch, type LaunchRequest } from './launchSolver.js';
import { Limb, Limbs } from './limb.js';
import { ReceptionSolver } from './receptionSolver.js';
import { StallBalance } from './stallBalance.js';
import { ContactSpot, Torso } from './torso.js';

/** Below this vertical speed a grounded ball counts as descending (S17). */
const DESCENDING_THRESHOLD = 0.1;
/** Below this flight time a touch has nothing to aim. */
const MIN_TOUCH_FLIGHT = 0.05;
/** Below this squared length a facing has no direction worth trusting. */
const FACING_EPSILON = 0.0001;
/** How far into its tolerance a freshly cushioned ball may start. */
const CAUGHT_INSIDE = 0.8;
/** One slice of the bounce charge per level: foot, thigh, chest, head (S25b). */
const CHARGE_SLICES = 4;

/** A pass waiting for the next touch, with the numbers it will be solved with. */
interface PendingPass {
  readonly Request: LaunchRequest;
  readonly Launch: LaunchSettings;
  readonly Bands: VerbBands;
}

/**
 * The touch while the ball is owned: keep-ups at a level, the commanded
 * bounce, the stall, the trap and reception, and the launch (S2-S35). A
 * faithful port of `BounceSolver.cs` at godot-final; the reasoning behind
 * every clause is in that file's comments and docs/IMPLEMENTATION.md.
 *
 * It returns the velocity the ball should have after this step; the
 * integrator applies it and nothing else writes the ball (rule 2).
 */
export class BounceSolver {
  private request: number | null = null;
  private launch: PendingPass | null = null;
  private requestAge = 0;
  private sinceTrap: number | null = null;
  private readonly balance = new StallBalance();
  private holdLift = 0;
  private lastOwnerVelocity: Vec3 = ZERO;
  private haveOwnerVelocity = false;
  private armed = true;
  private plannedAt = -1;
  private deflected = false;
  private softly = false;

  /** The level the ball is carried at: the body part keeping it up. */
  level: BallVerb = BallVerb.Foot;
  /** True while the ball is held on the body rather than bouncing off it (S10). */
  stuck = false;
  /** How close the held ball is to coming off, 0..1. */
  strain = 0;
  /** True from a commanded touch until the next automatic keep-up. */
  commanded = false;
  /** False while the planned contact is beyond the limb that would play it: a miss in progress. */
  inReach = true;
  /** The next contact, decided before it happens (S16). */
  plan: ContactPlan = NO_PLAN;
  /** True once a touch has fired since pickup, until it lands on the floor out of reach (S23, S24). */
  controlled = true;
  lastLimb: Limb = Limb.None;
  lastTouch: TouchKind = TouchKind.None;
  touches = 0;
  breaks = 0;
  /** Set when the queued launch fires; cleared by noteLaunched. */
  launchFired = false;
  firedLaunch: Launch = NO_LAUNCH;
  targetApex = 0;
  speedFactor = 1;

  get pendingLaunch(): LaunchRequest | null {
    return this.launch?.Request ?? null;
  }

  get pendingApex(): number | null {
    return this.request;
  }

  get launchPending(): boolean {
    return this.launch !== null;
  }

  /** The height above the owner's feet the next touch fires at, for the launch verb. */
  touchHeight(settings: BounceSettings): number {
    return levelFor(settings.Levels, this.level).TouchHeight;
  }

  /** The apex a bounce-button hold asks for (S25b): an equal slice of the hold per level. */
  static apexForHold(holdSeconds: number, settings: BounceSettings): number {
    const ratio = clamp(holdSeconds / Math.max(settings.BounceChargeTime, 0.001), 0, 1);
    const levels = settings.Levels;
    const max = settings.BounceMaxApex;

    const foot = Math.min(levels.Foot.Apex, max);
    const thigh = clamp(levels.Thigh.TouchHeight + POP_MARGIN, foot, max);
    const chest = clamp(levels.Chest.TouchHeight + POP_MARGIN, thigh, max);
    const head = clamp(levels.Head.TouchHeight + POP_MARGIN, chest, max);

    const slice = ratio * CHARGE_SLICES;
    if (slice < 1) return lerpf(foot, thigh, slice);
    if (slice < 2) return lerpf(thigh, chest, slice - 1);
    if (slice < 3) return lerpf(chest, head, slice - 2);
    return lerpf(head, max, Math.min(slice - 3, 1));
  }

  static partUnderTheBall = partUnderTheBall;

  /** Queue a commanded touch. A newer request replaces an older one. */
  requestBounce(apex: number): void {
    this.request = Math.max(apex, 0);
    this.requestAge = 0;
  }

  /** Queue the pass for the next touch; solved when it fires, with the limb that plays it (S28). */
  requestLaunch(request: LaunchRequest, launch: LaunchSettings, bands: VerbBands): void {
    this.launch = { Request: request, Launch: launch, Bands: bands };
  }

  private fire(pass: PendingPass, input: BounceInput): Launch {
    const facing = withY(input.OwnerFacing, 0);
    const request: LaunchRequest = {
      ...pass.Request,
      Limb: this.plan.Limb,
      Facing: lengthSq(facing) > FACING_EPSILON ? facing : pass.Request.Facing,
    };
    this.firedLaunch = LaunchSolver.solve(request, pass.Launch, pass.Bands);
    this.launchFired = true;
    return this.firedLaunch;
  }

  /** Drop anything queued. Called whenever possession is lost. */
  clearRequests(): void {
    this.request = null;
    this.launch = null;
    this.sinceTrap = null;
    this.deflected = false;
    this.softly = false;
    this.release();
  }

  /** Called when the ball is picked up, with its height above the new owner's feet. */
  onPickedUp(height: number, settings: BounceSettings, underControl = false): void {
    this.level = levelForHeight(settings.Levels, height);
    this.armed = true;
    this.commanded = false;
    this.controlled = underControl;
    this.sinceTrap = null;
    this.deflected = false;
    this.softly = false;
    this.inReach = true;
    this.launchFired = false;
    this.lastLimb = Limb.None;
    this.plan = NO_PLAN;

    this.stuck = false;
    this.strain = 0;
    this.balance.settle();

    const level = levelFor(settings.Levels, this.level);
    this.targetApex = level.Apex;
    this.speedFactor = level.SpeedFactor;
  }

  /** Called once the launch bookkeeping is done. */
  noteLaunched(): void {
    this.request = null;
    this.launch = null;
    this.launchFired = false;
    this.release();
  }

  /** The velocity the ball should have after this step. */
  solve(input: BounceInput, settings: BounceSettings): Vec3 {
    if (!input.HasOwner) return input.BallVelocity;

    if (input.Deflected === true) this.deflect(input.DeflectedSoftly === true);

    const ownerAccel = this.ownerAcceleration(input);
    const flatDist = flatDistance(input.BallPosition, input.OwnerPosition);
    const ahead = aheadOfBody(input.BallPosition, input.OwnerPosition, input.OwnerFacing);

    this.age(input.Step, settings.Trap);

    this.plan = this.replan(input, settings);

    if (!this.controlled && !this.stuck && planExists(this.plan)) this.level = this.plan.Level;

    this.inReach = this.plan.Reachable;

    let velocity: Vec3;
    if (this.stuck) {
      velocity = this.hold(input, settings, ownerAccel);
    } else {
      const late = this.lateReception(input, settings);
      if (late) {
        velocity = late;
      } else {
        velocity = this.easeInFlight(input.BallVelocity, input, settings);
        velocity = this.touch(velocity, input, settings);
      }
    }

    velocity = add(velocity, input.ExternalPush ?? ZERO);

    this.speedFactor = this.capFor(flatDist, ahead, settings);

    const leaving: BounceInput = {
      ...input,
      BallVelocity: velocity,
      IsGrounded: input.IsGrounded && velocity.y <= DESCENDING_THRESHOLD,
    };
    this.plan = this.replan(leaving, settings);

    return velocity;
  }

  private replan(input: BounceInput, settings: BounceSettings): ContactPlan {
    const committed = planExists(this.plan) && this.plannedAt === this.touches ? this.plan.Limb : Limb.None;
    this.plannedAt = this.touches;

    return ContactPlanner.plan(
      input,
      this.level,
      this.stuck,
      this.lastLimb,
      this.plannedKind(settings),
      settings,
      this.controlled,
      committed,
      this.deflected && this.softly,
    );
  }

  private plannedKind(settings: BounceSettings): TouchKind {
    if (this.launch !== null) return TouchKind.Launch;
    if (!this.controlled || this.deflected) return TouchKind.Trap;

    const level = levelFor(settings.Levels, this.level);
    if (this.request !== null) return this.request > level.TouchHeight ? TouchKind.Bounce : TouchKind.Drop;

    return this.stuck || stalls(level) ? TouchKind.Stall : TouchKind.KeepUp;
  }

  private ownerAcceleration(input: BounceInput): Vec3 {
    const accel =
      this.haveOwnerVelocity && input.Step > 0
        ? scale(sub(input.OwnerVelocity, this.lastOwnerVelocity), 1 / input.Step)
        : ZERO;
    this.lastOwnerVelocity = input.OwnerVelocity;
    this.haveOwnerVelocity = true;
    return accel;
  }

  private hold(input: BounceInput, settings: BounceSettings, ownerAccel: Vec3): Vec3 {
    const level = levelFor(settings.Levels, this.level);

    if (this.launch !== null) {
      const pass = this.launch;
      this.release();
      this.request = null;
      this.lastTouch = TouchKind.Launch;
      this.lastLimb = this.plan.Limb;
      this.touches++;
      return this.fire(pass, input).Velocity;
    }

    if (this.request !== null) {
      const requested = this.request;
      this.request = null;

      if (levelForApex(settings.Levels, requested) !== this.level) return this.popOff(requested, input, settings);

      this.balance.settle();
      this.lastTouch = TouchKind.Stall;
      this.lastLimb = this.plan.Limb;
      this.touches++;
    }

    if (this.balance.step(ownerAccel, level.BreakRadius, settings, input.Step)) return this.break(input);

    this.strain = level.BreakRadius <= 0 ? 0 : clamp(length(this.balance.offset) / level.BreakRadius, 0, 1);

    return this.holdVelocity(input, settings, level);
  }

  private holdVelocity(input: BounceInput, settings: BounceSettings, level: CarryLevel): Vec3 {
    const rest = add(BounceSolver.restPoint(input.OwnerPosition, input.OwnerFacing, level.HoldOffset, 0), this.balance.offset);

    this.holdLift *= Math.max(0, 1 - settings.StallRestore * input.Step);

    const y =
      input.OwnerPosition.y +
      Math.max(input.OwnerRise, 0) +
      level.TouchHeight +
      this.holdLift +
      this.balance.microMotion(level.MicroMotion, level.BreakRadius);

    const target: Vec3 = { x: rest.x, y, z: rest.z };
    return input.Step <= 0 ? ZERO : scale(sub(target, input.BallPosition), 1 / input.Step);
  }

  /** Where a ball held at a level rests, ball centre, in world space. */
  static restPoint(ownerPosition: Vec3, ownerFacing: Vec3, holdOffset: number, touchHeight: number): Vec3 {
    const facing = withY(ownerFacing, 0);
    const ahead = lengthSq(facing) < 0.0001 ? ZERO : scale(normalize(facing), holdOffset);
    return add(add(ownerPosition, ahead), { x: 0, y: touchHeight, z: 0 });
  }

  /** The ball has been thrown off. It leaves with the velocity it had; never eased back. */
  private break(input: BounceInput): Vec3 {
    const drift = this.balance.drift;
    this.release();
    this.controlled = false;
    this.lastTouch = TouchKind.Break;
    this.breaks++;
    return { x: input.OwnerVelocity.x + drift.x, y: 0, z: input.OwnerVelocity.z + drift.z };
  }

  /** Something that is not the owner touched the ball (S34): its next touch is the trap. */
  private deflect(softly: boolean): void {
    if (this.stuck) {
      this.breaks++;
      this.lastTouch = TouchKind.Break;
    }

    this.release();
    this.deflected = true;
    this.softly = softly;
    this.request = null;
    this.sinceTrap = null;

    if (this.level > BallVerb.Thigh) this.level = BallVerb.Thigh;
  }

  /** A commanded touch that takes the ball off the body to another level: pop-and-run. */
  private popOff(apex: number, input: BounceInput, settings: BounceSettings): Vec3 {
    this.release();

    const height = input.BallPosition.y - input.OwnerPosition.y;

    this.commanded = true;
    this.controlled = true;
    this.level = levelForApex(settings.Levels, apex);
    this.lastTouch = apex > height ? TouchKind.Bounce : TouchKind.Drop;
    this.lastLimb = this.plan.Limb;
    this.targetApex = apex;
    this.touches++;

    const next = levelFor(settings.Levels, this.level);
    this.armed = !input.IsGrounded && height > next.TouchHeight;

    return BounceSolver.touchVelocity(apex - height, input.BallVelocity, input, settings, next, this.playing());
  }

  /** Takes the ball out of the air and holds it, from wherever it arrived. */
  private cushion(input: BounceInput, settings: BounceSettings, level: CarryLevel): Vec3 {
    const rest = BounceSolver.restPoint(input.OwnerPosition, input.OwnerFacing, level.HoldOffset, 0);
    let offset: Vec3 = { x: input.BallPosition.x - rest.x, y: 0, z: input.BallPosition.z - rest.z };

    const reachedFor = length(offset);
    if (reachedFor > level.BreakRadius && reachedFor > 0) offset = scale(offset, (level.BreakRadius * CAUGHT_INSIDE) / reachedFor);

    this.stuck = true;
    this.armed = false;
    this.lastTouch = TouchKind.Stall;
    this.targetApex = level.TouchHeight;
    this.balance.catch(offset, ZERO);

    const partHeight = Math.max(input.OwnerRise, 0) + level.TouchHeight;
    this.holdLift = Math.max(input.BallPosition.y - input.OwnerPosition.y - partHeight, 0);

    return this.holdVelocity(input, settings, level);
  }

  private release(): void {
    this.stuck = false;
    this.strain = 0;
    this.armed = false;
    this.commanded = false;
    this.holdLift = 0;
    this.balance.settle();
  }

  /** The owner's speed cap multiplier: the level's pace on the body, one when running onto it (S9, S13). */
  private capFor(flatDist: number, ahead: number, settings: BounceSettings): number {
    const free =
      ahead < -settings.BehindReach ? 0 : clamp(inverseLerp(settings.CarryRadius, settings.KeepUpReach, flatDist), 0, 1);
    return lerpf(levelFor(settings.Levels, this.level).SpeedFactor, 1, free);
  }

  /** Between touches: a weak lean of the horizontal velocity toward the owner's intent. */
  private easeInFlight(velocity: Vec3, input: BounceInput, settings: BounceSettings): Vec3 {
    if (input.IsGrounded) return velocity;

    const factor = this.commanded ? 1 : levelFor(settings.Levels, this.level).SpeedFactor;
    const k = clamp(settings.FlightEase * input.Step, 0, 1);

    return {
      x: lerpf(velocity.x, input.OwnerIntent.x * factor, k),
      y: velocity.y,
      z: lerpf(velocity.z, input.OwnerIntent.z * factor, k),
    };
  }

  /** The height above the feet this step's touch fires at; a shoulder's is its own (S27). */
  private surfaceHeight(settings: BounceSettings): number {
    return planExists(this.plan) && Limbs.isShoulder(this.plan.Limb) && shoulderExists(settings.Shoulder)
      ? settings.Shoulder.TouchHeight
      : levelFor(settings.Levels, this.level).TouchHeight;
  }

  /** The limb whose own spot a touch aims at: the planned one, when it plays the level the ball is going to. */
  private playing(): Limb {
    return planExists(this.plan) && Limbs.levelOf(this.plan.Limb) === this.level ? this.plan.Limb : Limb.None;
  }

  private touch(velocity: Vec3, input: BounceInput, settings: BounceSettings): Vec3 {
    const height = input.BallPosition.y - input.OwnerPosition.y;

    const clear = !input.IsGrounded && height > this.surfaceHeight(settings);
    if (clear) {
      this.armed = true;
      return velocity;
    }

    const touching = this.armed || (input.IsGrounded && velocity.y <= DESCENDING_THRESHOLD);
    if (!touching) return velocity;

    if (input.IsGrounded) this.level = BallVerb.Foot;

    if (!this.inReach) {
      this.armed = false;
      if (input.IsGrounded) this.controlled = false;
      return velocity;
    }

    this.level = partUnderTheBall(this.level, input.OwnerRise, settings);

    const first = !this.controlled || this.deflected;
    this.deflected = false;
    this.softly = false;
    this.touches++;
    this.lastLimb = this.plan.Limb;
    this.controlled = true;

    if (this.launch !== null) {
      const pass = this.launch;
      this.launch = null;
      this.request = null;
      this.armed = false;
      this.commanded = false;
      this.lastTouch = TouchKind.Launch;
      return this.fire(pass, input).Velocity;
    }

    if (first) return this.receive(velocity, input, settings, height);

    let apex: number;
    if (this.request !== null) {
      const requested = this.request;
      this.request = null;
      this.commanded = true;
      apex = requested;
      this.level = levelForApex(settings.Levels, apex);
      this.lastTouch = apex > height ? TouchKind.Bounce : TouchKind.Drop;
    } else {
      this.commanded = false;
      const here = levelFor(settings.Levels, this.level);

      if (Torso.holds(this.plan.Limb, here)) return this.cushion(input, settings, here);

      apex = here.Apex;
      this.lastTouch = input.IsGrounded && here.TouchHeight > 0 ? TouchKind.Scoop : TouchKind.KeepUp;
    }

    this.targetApex = apex;
    const next = levelFor(settings.Levels, this.level);

    this.armed = !input.IsGrounded && height > next.TouchHeight;

    const factor = this.commanded ? 1 : next.SpeedFactor;
    const aimed: BounceInput = { ...input, OwnerIntent: scale(input.OwnerIntent, factor) };

    return BounceSolver.touchVelocity(apex - height, velocity, aimed, settings, next, this.playing());
  }

  /**
   * The touch itself: the velocity that lifts the ball by `rise` and brings it
   * back down where the owner will be, closing the gap by the level's
   * correction (S7, S9, S25, S27, S29).
   */
  static touchVelocity(
    rise: number,
    velocity: Vec3,
    input: BounceInput,
    settings: BounceSettings,
    level: CarryLevel,
    limb: Limb = Limb.None,
  ): Vec3 {
    const intent = withY(input.OwnerIntent, 0);

    const vy = Ballistics.verticalSpeedForApex(rise, input.EffectiveGravity);
    const flight = Ballistics.timeToReturn(vy, input.EffectiveGravity);

    if (rise <= 0 || flight < MIN_TOUCH_FLIGHT) return { x: intent.x, y: Math.min(velocity.y, 0), z: intent.z };

    const lead = BounceSolver.keepUpLead(level, length(intent), settings, limb);
    const facing = withY(input.OwnerFacing, 0);

    let ahead = ZERO;
    let right = ZERO;
    let aimed = 0;
    if (lengthSq(facing) >= 0.0001) {
      const forward = normalize(facing);
      right = cross(forward, UP);
      aimed = ContactSpot.aimed(limb, input.OwnerBody);
      ahead = add(scale(forward, lead), scale(right, aimed));
    }

    const drift = add(input.BallPosition, scale(intent, flight));
    const owner = add(input.OwnerPosition, scale(intent, flight));
    const landing = add(owner, ahead);
    const correction = clamp(level.Correction, 0, 1);

    let targetX = lerpf(drift.x, landing.x, correction);
    let targetZ = lerpf(drift.z, landing.z, correction);

    if (ContactSpot.aimsExactly(limb) && aimed !== 0) {
      const off = (targetX - owner.x) * right.x + (targetZ - owner.z) * right.z;
      targetX += right.x * (aimed - off);
      targetZ += right.z * (aimed - off);
    }

    let vx = (targetX - input.BallPosition.x) / flight;
    let vz = (targetZ - input.BallPosition.z) / flight;

    const speed = Math.sqrt(vx * vx + vz * vz);
    if (speed > settings.TouchMaxSpeed && speed > 0) {
      const s = settings.TouchMaxSpeed / speed;
      vx *= s;
      vz *= s;
    }

    return { x: vx, y: vy, z: vz };
  }

  /** The first touch of a ball not under control (S24): the perfect reception, or the untimed trap. */
  private receive(velocity: Vec3, input: BounceInput, settings: BounceSettings, height: number): Vec3 {
    const trap = settings.Trap;

    if (this.request !== null && this.requestAge <= trap.WindowBefore) {
      const requested = this.request;
      this.request = null;
      return this.reception(requested, velocity, input, settings, height);
    }

    this.request = null;
    this.commanded = false;
    this.level = BallVerb.Foot;

    const foot = settings.Levels.Foot;
    const relative = withY(sub(input.BallVelocity, input.OwnerVelocity), 0);
    const apex = ReceptionSolver.trapApex(foot.Apex, relative, trap, settings.BounceMaxApex);

    this.targetApex = apex;
    this.lastTouch = input.IsGrounded ? TouchKind.Scoop : TouchKind.Trap;
    this.armed = !input.IsGrounded && height > foot.TouchHeight;
    this.sinceTrap = 0;

    const aimed: BounceInput = { ...input, OwnerIntent: scale(input.OwnerIntent, foot.SpeedFactor) };
    return add(
      BounceSolver.touchVelocity(apex - height, velocity, aimed, settings, foot),
      ReceptionSolver.rebound(relative, trap),
    );
  }

  /** The perfect reception (S24): the charged apex, full intent, the whole gap closed, no rebound. */
  private reception(apex: number, velocity: Vec3, input: BounceInput, settings: BounceSettings, height: number): Vec3 {
    this.commanded = true;
    this.level = levelForApex(settings.Levels, apex);
    this.lastTouch = TouchKind.Reception;
    this.targetApex = apex;

    const next = levelFor(settings.Levels, this.level);
    this.armed = !input.IsGrounded && height > next.TouchHeight;

    return BounceSolver.touchVelocity(apex - height, velocity, input, settings, { ...next, Correction: 1 });
  }

  /** The bounce released just after an untimed trap, inside the window (S24). */
  private lateReception(input: BounceInput, settings: BounceSettings): Vec3 | null {
    if (this.sinceTrap === null || this.request === null) return null;

    const apex = this.request;
    this.request = null;
    this.sinceTrap = null;
    this.touches++;

    const height = input.BallPosition.y - input.OwnerPosition.y;
    return this.reception(apex, input.BallVelocity, input, settings, height);
  }

  private age(step: number, trap: TrapSettings): void {
    if (this.request !== null) this.requestAge += step;

    if (this.sinceTrap !== null) {
      const since = this.sinceTrap + step;
      this.sinceTrap = since <= trap.WindowAfter ? since : null;
    }
  }

  /** How far ahead of the owner a touch at this level lands the ball, at this speed (S25). */
  static keepUpLead(level: CarryLevel, speed: number, settings: BounceSettings, limb: Limb = Limb.None): number {
    return (
      (limb === Limb.None ? level.HoldOffset : holdOffsetFor(settings, limb)) +
      settings.TouchLeadPerSpeed * Math.max(speed, 0) * level.LeadFactor
    );
  }
}

function aheadOfBody(ballPosition: Vec3, ownerPosition: Vec3, ownerFacing: Vec3): number {
  const facing = withY(ownerFacing, 0);
  if (lengthSq(facing) < FACING_EPSILON) return 0;
  return dot(normalize(facing), flat(sub(ballPosition, ownerPosition)));
}

function flatDistance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

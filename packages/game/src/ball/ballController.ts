import {
  BallBody,
  BallHistory,
  BallState,
  Ballistics,
  BounceSolver,
  NO_LAUNCH,
  NO_OWNER,
  NO_PLAN,
  PossessionArbiter,
  ReceptionSolver,
  TouchKind,
  TrajectorySampler,
  ZERO,
  nextBallState,
  type BallBodyState,
  type BallWorld,
  type BounceInput,
  type ContactPlan,
  type Launch,
  type LaunchRequest,
  type Limb,
  type PossessionCandidate,
  type StepContacts,
  type Vec3,
} from '@lopfb/domain';
import type { PlayerMotor } from '../player/playerMotor.js';
import { live } from '../tuning/live.js';

/** A contact the body can react to: a touch or a break (S22). Reads only. */
export interface ContactEvent {
  readonly limb: Limb;
  readonly kind: TouchKind;
  readonly point: Vec3;
  readonly passCharge: number;
}

/** Where R sends the ball back to, above the player: `BallController.SpawnHeight`. */
const SPAWN_HEIGHT = 1.2;

/**
 * The ball: the port of `BallController` with its `BounceController` and
 * `PossessionController` folded in. **The only writer of the ball's position
 * and velocity is `integrate`, called once per fixed step** (rule 2); every
 * other request (a bounce, a pass, a reset, a ricochet) is queued and applied
 * there. Ball physics is `BallBody`, the stand-in for Jolt.
 */
export class BallController {
  /** The rigid body's state. Read anywhere; written only in `integrate`. */
  readonly body: BallBodyState = { px: 0, py: 1, pz: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
  /** Position at the start of the last step, for drawing between steps. */
  readonly previous = { x: 0, y: 1, z: 0 };

  state: BallState = BallState.Flight;
  ownerId = NO_OWNER;
  owner: PlayerMotor | null = null;
  clock = 0;
  readonly history = new BallHistory(128);

  lastContact: ContactEvent | null = null;
  contacts = 0;
  lastPass: Launch = NO_LAUNCH;
  lastLauncher = NO_OWNER;
  lastLaunchTime = -999;
  /** The last thing worth a toast: a touch's name, a ricochet, a timed catch. */
  readonly events: string[] = [];

  private readonly solver = new BounceSolver();
  private readonly arbiter = new PossessionArbiter();
  private readonly contactsOut: StepContacts = { grounded: false, hitCollider: false };
  private grounded = false;
  private pendingTeleport: Vec3 | null = null;
  private pendingRicochet: Vec3 | null = null;
  private receptionTap: { playerId: number; at: number; apex: number } | null = null;
  private launchFiredFlag = false;
  private queuedLauncher = NO_OWNER;
  private queuedAt = 0;
  private seenTouches = 0;
  private seenBreaks = 0;

  constructor(
    private readonly players: readonly PlayerMotor[],
    private readonly world: BallWorld,
  ) {}

  get position(): Vec3 {
    return { x: this.body.px, y: this.body.py, z: this.body.pz };
  }

  get velocity(): Vec3 {
    return { x: this.body.vx, y: this.body.vy, z: this.body.vz };
  }

  get effectiveGravity(): number {
    return Ballistics.effectiveGravity(live.world.Gravity, live.ball.Body.GravityScale);
  }

  get effectiveDamp(): number {
    return TrajectorySampler.effectiveDamp(live.ball.Body.LinearDamp, live.world.ProjectLinearDamp, false);
  }

  get plan(): ContactPlan {
    return this.state === BallState.Possession ? this.solver.plan : NO_PLAN;
  }

  get carrySpeedFactor(): number {
    return this.state === BallState.Possession ? this.solver.speedFactor : 1;
  }

  get pendingLaunch(): LaunchRequest | null {
    return this.state === BallState.Possession ? this.solver.pendingLaunch : null;
  }

  /** The height above the owner's feet the next touch fires at: the launch verb comes from this. */
  get carryTouchHeight(): number {
    return this.solver.touchHeight(live.ball.Bounce);
  }

  /** Seconds since the queued pass was released, or null. */
  get passQueuedFor(): number | null {
    return this.pendingLaunch !== null ? this.clock - this.queuedAt : null;
  }

  /** The solver's readouts, for the HUD. Reads only. */
  get readout(): Readonly<
    Pick<
      BounceSolver,
      'level' | 'stuck' | 'strain' | 'commanded' | 'inReach' | 'controlled' | 'lastTouch' | 'lastLimb' | 'touches' | 'breaks' | 'targetApex' | 'pendingApex' | 'launchPending'
    >
  > {
    return this.solver;
  }

  /** Put the ball somewhere at rest, at boot. Queued like every other write. */
  spawn(at: Vec3): void {
    this.pendingTeleport = at;
  }

  // --- The per-step order: Godot ran _PhysicsProcess, then the physics step that called _IntegrateForces.

  /** `BallController._PhysicsProcess`: the bookkeeping, possession and the state rule. Writes nothing on the body. */
  physicsProcess(step: number): void {
    this.clock += step;
    this.history.push(this.position, this.velocity, this.clock);

    if (this.launchFiredFlag) {
      this.launchFiredFlag = false;
      this.onLaunched();
    }

    this.forgetStaleTap();
    const timedCatcher = this.timedCatcher();

    const candidates: PossessionCandidate[] = this.players.map((p) => ({
      PlayerId: p.id,
      Distance: Math.hypot(p.position.x - this.body.px, p.position.y - this.body.py, p.position.z - this.body.pz),
    }));

    const owner = this.arbiter.step(candidates, {
      State: this.state,
      BallSpeed: Math.hypot(this.body.vx, this.body.vy, this.body.vz),
      Clock: this.clock,
      Delta: step,
      Settings: live.ball.Possession,
      Reception: live.ball.Reception,
      TimedCatcher: timedCatcher,
    });

    if (owner !== this.ownerId) {
      this.setOwner(owner);
      if (owner !== NO_OWNER && owner === timedCatcher && this.receptionTap) {
        this.solver.requestBounce(this.receptionTap.apex);
        this.receptionTap = null;
        this.events.push('timed catch');
      }
    }

    if (this.ownerId === NO_OWNER) this.checkRicochet();

    const next = nextBallState(this.state, this.ownerId !== NO_OWNER, this.grounded);
    if (next !== this.state) this.state = next;
  }

  /** `BallController._IntegrateForces` and the physics step after it: the one write path. */
  integrate(step: number): void {
    const s = this.body;
    this.previous.x = s.px;
    this.previous.y = s.py;
    this.previous.z = s.pz;

    if (this.pendingTeleport) {
      s.px = this.previous.x = this.pendingTeleport.x;
      s.py = this.previous.y = this.pendingTeleport.y;
      s.pz = this.previous.z = this.pendingTeleport.z;
      s.vx = s.vy = s.vz = 0;
      s.wx = s.wy = s.wz = 0;
      this.pendingTeleport = null;
    } else {
      if (this.pendingRicochet) {
        s.vx = this.pendingRicochet.x;
        s.vy = this.pendingRicochet.y;
        s.vz = this.pendingRicochet.z;
        this.pendingRicochet = null;
      }

      if (this.state === BallState.Possession && this.owner) this.solveTouch(step);
    }

    BallBody.step(s, live.ball.Body, this.world, this.effectiveGravity, this.effectiveDamp, step, live.contact, this.contactsOut);
    this.grounded = this.contactsOut.grounded;
  }

  private solveTouch(step: number): void {
    const s = this.body;
    const owner = this.owner as PlayerMotor;
    const input: BounceInput = {
      BallPosition: this.position,
      BallVelocity: this.velocity,
      HasOwner: true,
      // The feet, not the origin: the origin rises with a jump (S12).
      OwnerPosition: owner.feet,
      OwnerVelocity: owner.velocityVec,
      OwnerIntent: owner.intendedVelocity,
      OwnerFacing: owner.facing,
      OwnerRise: owner.rise,
      OwnerStride: owner.stride,
      OwnerBody: owner.body,
      IsGrounded: this.grounded,
      BallRadius: live.ball.Body.Radius,
      Step: step,
      EffectiveGravity: this.effectiveGravity,
      OwnerFollow: owner.followTuning,
      ExternalPush: ZERO,
      // The street never deflects a carry (S34): only obstacles do, and there are none here.
      Deflected: false,
      DeflectedSoftly: false,
    };

    const v = this.solver.solve(input, live.ball.Bounce);
    s.vx = v.x;
    s.vy = v.y;
    s.vz = v.z;

    if (this.solver.touches !== this.seenTouches || this.solver.breaks !== this.seenBreaks) {
      this.seenTouches = this.solver.touches;
      this.seenBreaks = this.solver.breaks;
      this.contacts++;
      const passCharge =
        this.solver.launchFired && this.solver.lastTouch === TouchKind.Launch ? this.solver.firedLaunch.ChargeRatio : 0;
      this.lastContact = { limb: this.solver.lastLimb, kind: this.solver.lastTouch, point: this.position, passCharge };
      this.events.push(touchToast(this.solver.lastTouch));
    }

    if (this.solver.launchFired && !this.launchFiredFlag) {
      this.launchFiredFlag = true;
      this.lastPass = this.solver.firedLaunch;
      const spin = this.lastPass.Spin;
      if (spin.x * spin.x + spin.y * spin.y + spin.z * spin.z > 0) {
        s.wx = spin.x;
        s.wy = spin.y;
        s.wz = spin.z;
      }
    }
  }

  // --- Requests: queued, applied by the next step.

  /** The owner asks for a commanded touch on the next touch. Anyone else is ignored. */
  requestBounce(apex: number, playerId: number): boolean {
    if (this.state !== BallState.Possession || this.ownerId !== playerId) return false;
    this.solver.requestBounce(apex);
    return true;
  }

  /** A bounce tapped by a player without the ball: a try at the timed catch of a hot ball (S5). */
  requestReception(apex: number, playerId: number): boolean {
    if (this.state === BallState.Possession) return false;
    this.receptionTap = { playerId, at: this.clock, apex };
    return true;
  }

  /** The owner queues a pass for the next touch (S28). */
  queueLaunch(request: LaunchRequest, playerId: number): boolean {
    if (this.state !== BallState.Possession || this.ownerId !== playerId) return false;
    if (!this.solver.launchPending) this.queuedAt = this.clock;
    this.queuedLauncher = playerId;
    this.solver.requestLaunch(request, live.ball.Launch, live.ball.Bands);
    return true;
  }

  /** Teleport above a point with no velocity and no owner. The R key. */
  resetTo(origin: Vec3): void {
    this.pendingTeleport = { x: origin.x, y: origin.y + SPAWN_HEIGHT, z: origin.z };
    this.pendingRicochet = null;
    this.receptionTap = null;
    this.solver.clearRequests();
    this.launchFiredFlag = false;
    this.arbiter.forceRelease();
    this.ownerId = NO_OWNER;
    this.owner = null;
    this.lastLauncher = NO_OWNER;
    this.history.clear();
    this.state = BallState.Flight;
    this.events.push('reset');
  }

  private onLaunched(): void {
    const playerId = this.queuedLauncher;
    this.lastLauncher = playerId;
    this.lastLaunchTime = this.clock;
    this.solver.noteLaunched();
    this.arbiter.startCooldown(playerId, this.clock, live.ball.Possession.TouchCooldown);
    this.state = BallState.Flight;
  }

  private setOwner(playerId: number): void {
    this.ownerId = playerId;
    this.owner = this.players.find((p) => p.id === playerId) ?? null;

    if (playerId !== NO_OWNER) {
      const height = this.owner ? this.body.py - this.owner.feet.y : 0;
      this.solver.onPickedUp(height, live.ball.Bounce);
      if (this.state !== BallState.Possession) this.state = BallState.Possession;
    } else {
      this.solver.clearRequests();
      if (this.state === BallState.Possession) this.state = BallState.Flight;
    }
  }

  private timedCatcher(): number {
    const tap = this.receptionTap;
    if (!tap || this.state !== BallState.Flight) return NO_OWNER;
    const speed = Math.hypot(this.body.vx, this.body.vy, this.body.vz);
    if (speed < live.ball.Reception.CatchSpeed) return NO_OWNER;
    const player = this.players.find((p) => p.id === tap.playerId);
    if (!player) return NO_OWNER;

    const catchWindow = live.ball.Reception.CatchWindow;
    const feet = player.feet;
    const pv = player.velocityVec;
    const approach = ReceptionSolver.closestApproach(
      { x: this.body.px - feet.x, y: this.body.py - feet.y, z: this.body.pz - feet.z },
      { x: this.body.vx - pv.x, y: this.body.vy - pv.y, z: this.body.vz - pv.z },
      this.effectiveGravity,
      catchWindow,
      catchWindow,
    );
    return ReceptionSolver.isTimedCatch(this.clock, approach.Time, tap.at, catchWindow) ? tap.playerId : NO_OWNER;
  }

  private forgetStaleTap(): void {
    if (this.receptionTap && this.clock - this.receptionTap.at > 2 * live.ball.Reception.CatchWindow) this.receptionTap = null;
  }

  /** A hot ball in flight, owned by nobody, meeting a body it was not caught by (S5). */
  private checkRicochet(): void {
    if (this.state !== BallState.Flight || this.pendingRicochet) return;
    if (Math.hypot(this.body.vx, this.body.vy, this.body.vz) < live.ball.Reception.CatchSpeed) return;

    for (const player of this.players) {
      if (!this.arbiter.isEligible(player.id, this.clock)) continue;
      const after = ReceptionSolver.ricochet(
        this.position,
        this.velocity,
        live.ball.Body.Radius,
        player.feet,
        player.velocityVec,
        player.bodyRadius,
        player.bodyHeight,
        live.ball.Reception.RicochetRestitution,
      );
      if (after) {
        this.pendingRicochet = after;
        this.receptionTap = null;
        this.state = BallState.Loose;
        this.events.push('ricochet');
        return;
      }
    }
  }
}

/** The HUD's touch names, as DebugHud spelled them. */
function touchToast(kind: TouchKind): string {
  switch (kind) {
    case TouchKind.KeepUp:
      return 'keep-up';
    case TouchKind.Bounce:
      return 'bounce';
    case TouchKind.Drop:
      return 'drop';
    case TouchKind.Launch:
      return 'launch';
    case TouchKind.Stall:
      return 'stall';
    case TouchKind.Break:
      return 'BROKE';
    case TouchKind.Scoop:
      return 'scoop';
    case TouchKind.Trap:
      return 'trap';
    case TouchKind.Reception:
      return 'PERFECT';
    default:
      return '';
  }
}


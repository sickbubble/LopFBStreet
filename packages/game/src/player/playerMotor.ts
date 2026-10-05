import {
  CarrySpeed,
  confineBody,
  FollowRule,
  Locomotion,
  NO_PLAN,
  STANDING,
  StrideClock,
  type BallWorld,
  type BodyModel,
  type ContactPlan,
  type FollowSettings,
  type StrideState,
  type Vec3,
} from '@lopfb/domain';
import type { InputSnapshot } from '../input/actions.js';
import { live } from '../tuning/live.js';

/** What the motor reads off the ball: never writes. */
export interface BallView {
  readonly ownerId: number;
  readonly carrySpeedFactor: number;
  readonly plan: ContactPlan;
}

/**
 * Camera-relative movement: the port of `PlayerMotor._PhysicsProcess`. Every
 * number is the domain's or `player.json`'s; this owns the body's state and
 * steps it once per fixed step. The body never yaws with the camera: `yaw` is
 * the model's, turned toward movement (so a backheel has a "behind").
 */
export class PlayerMotor {
  /** Feet-origin position, as Godot's CharacterBody3D origin. */
  readonly position = { x: 0, y: 0, z: 0 };
  readonly velocity = { x: 0, y: 0, z: 0 };
  /** The position at the start of the last step, for drawing between steps. */
  readonly previous = { x: 0, y: 0, z: 0 };
  /** The model's yaw: forward is (-sin, 0, -cos). */
  yaw = 0;
  previousYaw = 0;
  onFloor = true;
  following = false;
  intendedVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  stride: StrideState = STANDING;

  private floorY = 0;
  private readonly carry = new CarrySpeed();
  private readonly strideClock = new StrideClock();
  private lastGround = { x: 0, z: 0 };
  private haveGround = false;

  constructor(readonly id: number) {}

  place(x: number, z: number, yaw: number): void {
    this.position.x = this.previous.x = x;
    this.position.z = this.previous.z = z;
    this.position.y = this.previous.y = 0;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.yaw = this.previousYaw = yaw;
    this.floorY = 0;
    this.haveGround = false;
  }

  get carryFactor(): number {
    return this.carry.factor;
  }

  /** Where the feet are, as the ball understands them: the last grounded height while in the air (S12). */
  get feet(): Vec3 {
    return { x: this.position.x, y: this.floorY, z: this.position.z };
  }

  /** How far the origin is above the feet: the jump. */
  get rise(): number {
    return Math.max(this.position.y - this.floorY, 0);
  }

  get origin(): Vec3 {
    return { x: this.position.x, y: this.position.y, z: this.position.z };
  }

  get velocityVec(): Vec3 {
    return { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z };
  }

  /** Where the body points, flat. */
  get facing(): Vec3 {
    return Locomotion.forwardOf(this.yaw);
  }

  get body(): BodyModel {
    return live.player.Body;
  }

  /** The follow's numbers; the top speed is the sprint (PlayerMotor.FollowTuning). */
  get followTuning(): FollowSettings {
    return { ...live.player.Follow, TopSpeed: live.player.SprintSpeed };
  }

  get bodyRadius(): number {
    return live.player.BodyRadius;
  }

  get bodyHeight(): number {
    return live.player.BodyHeight;
  }

  step(input: InputSnapshot, camYaw: number, ball: BallView | null, step: number, world: BallWorld): void {
    const p = live.player;
    this.previous.x = this.position.x;
    this.previous.y = this.position.y;
    this.previous.z = this.position.z;
    this.previousYaw = this.yaw;

    const ours = ball !== null && ball.ownerId === this.id;
    const wantedFactor = ours ? ball.carrySpeedFactor : 1;
    const carryFactor = ball === null ? 1 : this.carry.update(wantedFactor, step, live.ball.Carry);

    // Movement is relative to where the camera looks, not where the body points.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    let wx = rx * input.moveX + fx * input.moveY;
    let wz = rz * input.moveX + fz * input.moveY;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }

    const cap = input.sprint ? p.SprintSpeed : p.WalkSpeed;
    this.intendedVelocity = { x: wx * cap, y: 0, z: wz * cap };

    // S23: while the ball is ours and under control, the body follows it to the next contact.
    const plan = ours ? ball.plan : NO_PLAN;
    this.following = plan.Following;

    let target: Vec3;
    let turnTo: Vec3;
    if (this.following) {
      target = FollowRule.velocityTo(plan.Stand, this.origin, plan.TimeToContact, this.followTuning);
      turnTo = plan.Forward;
    } else {
      target = { x: wx * cap * carryFactor, y: 0, z: wz * cap * carryFactor };
      turnTo = { x: wx, y: 0, z: wz };
    }

    const v = Locomotion.step(this.velocityVec, target, this.onFloor ? p.Accel : p.AirAccel, step);
    let vy = v.y;
    if (this.onFloor) {
      vy = 0;
      if (input.jumpPressed) vy = p.JumpSpeed;
    } else {
      vy -= live.world.Gravity * step;
    }
    this.velocity.x = v.x;
    this.velocity.y = vy;
    this.velocity.z = v.z;

    this.moveAndSlide(step, world);
    if (this.onFloor) this.floorY = this.position.y;

    this.advanceStride();

    if (turnTo.x * turnTo.x + turnTo.z * turnTo.z > 0.01) {
      this.yaw = Locomotion.turnToward(this.yaw, turnTo, p.TurnSpeed, step);
    }
  }

  /** The CharacterBody3D's move: a flat floor at y = 0, and the walls and posts pushed out of. */
  private moveAndSlide(step: number, world: BallWorld): void {
    const before = { x: this.position.x, z: this.position.z };
    this.position.x += this.velocity.x * step;
    this.position.y += this.velocity.y * step;
    this.position.z += this.velocity.z * step;

    if (this.position.y <= world.groundY) {
      this.position.y = world.groundY;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onFloor = true;
    } else {
      this.onFloor = false;
    }

    const confined = confineBody(this.position.x, this.position.z, this.bodyRadius, world);
    if (confined.x !== this.position.x || confined.z !== this.position.z) {
      // Slide: the velocity into the wall is gone, the rest is kept.
      if (step > 0) {
        this.velocity.x = (confined.x - before.x) / step;
        this.velocity.z = (confined.z - before.z) / step;
      }
      this.position.x = confined.x;
      this.position.z = confined.z;
    }
  }

  /** The stride runs on ground distance actually covered this step (S18). Airborne, it holds. */
  private advanceStride(): void {
    const dx = this.position.x - this.lastGround.x;
    const dz = this.position.z - this.lastGround.z;
    const distance = this.haveGround && this.onFloor ? Math.hypot(dx, dz) : 0;
    this.lastGround = { x: this.position.x, z: this.position.z };
    this.haveGround = true;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.stride = this.strideClock.advance(distance, this.onFloor ? speed : 0, live.player.Stride);
  }
}

import { BounceSolver, LaunchSolver, clamp, passPartName, type LaunchRequest, type Vec3 } from '@lopfb/domain';
import type { BallController } from '../ball/ballController.js';
import type { InputSnapshot } from '../input/actions.js';
import { live } from '../tuning/live.js';
import type { PlayerMotor } from './playerMotor.js';

export type HeldButton = 'none' | 'bounce' | 'launch';

/**
 * The two ball buttons, the port of `LaunchInput`: hold for more, release to
 * do it. Bounce (left mouse) holds for height and keeps the ball; launch
 * (right mouse) holds for power and sends it. Every rule about what a hold
 * means is `BounceSolver.apexForHold` and `LaunchSolver`'s.
 */
export class LaunchInput {
  held: HeldButton = 'none';
  launchSeconds = 0;
  bounceSeconds = 0;
  lastLaunch = '-';
  lastBounce = '-';
  bounces = 0;

  constructor(
    private readonly motor: PlayerMotor,
    private readonly ball: BallController,
    private readonly aim: () => Vec3,
  ) {}

  get chargeRatio(): number {
    return LaunchSolver.chargeRatio(this.launchSeconds, live.ball.Launch);
  }

  get bounceRatio(): number {
    return clamp(this.bounceSeconds / Math.max(live.ball.Bounce.BounceChargeTime, 0.001), 0, 1);
  }

  step(input: InputSnapshot, step: number): void {
    // Both held at once: whichever came first keeps counting, the other waits.
    if (input.bounceHeld && this.held !== 'launch') {
      this.held = 'bounce';
      this.bounceSeconds = Math.min(this.bounceSeconds + step, live.ball.Bounce.BounceChargeTime);
    } else if (this.held === 'bounce') {
      this.held = 'none';
      this.releaseBounce();
      this.bounceSeconds = 0;
    }

    if (input.launchHeld && this.held !== 'bounce') {
      this.held = 'launch';
      this.launchSeconds = Math.min(this.launchSeconds + step, live.ball.Launch.ChargeTime);
    } else if (this.held === 'launch') {
      this.held = 'none';
      this.releaseLaunch();
      this.launchSeconds = 0;
    }

    if (input.resetPressed) {
      const f = this.motor.facing;
      const o = this.motor.origin;
      this.ball.resetTo({ x: o.x + f.x * 1.5, y: o.y, z: o.z + f.z * 1.5 });
    }
  }

  /** The pass the release would queue right now. The preview solves this same request. */
  currentRequest(): LaunchRequest {
    return {
      Aim: this.aim(),
      Facing: this.motor.facing,
      ChargeSeconds: this.launchSeconds,
      BallHeight: this.ball.carryTouchHeight,
      Limb: this.ball.plan.Limb,
    };
  }

  private releaseBounce(): void {
    const apex = BounceSolver.apexForHold(this.bounceSeconds, live.ball.Bounce);
    if (!this.ball.requestBounce(apex, this.motor.id)) {
      this.lastBounce = this.ball.requestReception(apex, this.motor.id) ? 'timed catch?' : 'not yours';
      return;
    }
    this.bounces++;
    this.lastBounce = `${apex.toFixed(2)} m`;
  }

  private releaseLaunch(): void {
    const request = this.currentRequest();
    if (!this.ball.queueLaunch(request, this.motor.id)) {
      this.lastLaunch = 'not yours';
      return;
    }
    const preview = LaunchSolver.solve(request, live.ball.Launch, live.ball.Bands);
    const speed = Math.hypot(preview.Velocity.x, preview.Velocity.y, preview.Velocity.z);
    this.lastLaunch = `${passPartName(preview.Part)}  ${(preview.ChargeRatio * 100).toFixed(0)}%  ${speed.toFixed(1)}/${preview.PartMaxSpeed.toFixed(1)} m/s`;
  }
}

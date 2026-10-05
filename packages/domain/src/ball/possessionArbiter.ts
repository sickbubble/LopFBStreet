import type { PossessionSettings, ReceptionSettings } from '../tuning/ballSettings.js';
import { BallState } from './ballVerb.js';

/** One player's distance from the ball this step. */
export interface PossessionCandidate {
  readonly PlayerId: number;
  readonly Distance: number;
}

export const NO_OWNER = -1;

/** Everything the arbiter needs that is not a candidate. */
export interface PossessionContext {
  readonly State: BallState;
  readonly BallSpeed: number;
  readonly Clock: number;
  readonly Delta: number;
  readonly Settings: PossessionSettings;
  readonly Reception: ReceptionSettings;
  /** The player whose bounce tap was timed to this ball's closest approach (S5), or NO_OWNER. */
  readonly TimedCatcher?: number;
}

/**
 * Decides who owns the ball (S3), with hysteresis so ownership never
 * flickers once six players are packed round it. Port of
 * `PossessionArbiter.cs`.
 */
export class PossessionArbiter {
  private readonly cooldowns = new Map<number, number>();
  private challengerId = NO_OWNER;
  private challengerTime = 0;

  ownerId = NO_OWNER;

  get challenger(): number {
    return this.challengerId;
  }

  step(candidates: readonly PossessionCandidate[], context: PossessionContext): number {
    const settings = context.Settings;
    let bestId = NO_OWNER;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const c of candidates) {
      if (!this.isEligible(c.PlayerId, context.Clock)) continue;
      if (c.Distance <= settings.Radius && c.Distance < bestDistance) {
        bestId = c.PlayerId;
        bestDistance = c.Distance;
      }
    }

    let ownerDistance = distanceOf(candidates, this.ownerId);

    if (this.ownerId !== NO_OWNER && (ownerDistance > settings.Radius || !this.isEligible(this.ownerId, context.Clock))) {
      this.release();
      ownerDistance = Number.POSITIVE_INFINITY;
    }

    if (bestId === NO_OWNER) return this.ownerId;

    if (this.ownerId === NO_OWNER) {
      if (isCatchable(context) || bestId === (context.TimedCatcher ?? NO_OWNER)) this.take(bestId);
      return this.ownerId;
    }

    if (bestId === this.ownerId) {
      this.clearChallenger();
      return this.ownerId;
    }

    if (ownerDistance - bestDistance < settings.OwnershipMargin) {
      this.clearChallenger();
      return this.ownerId;
    }

    if (this.challengerId !== bestId) {
      this.challengerId = bestId;
      this.challengerTime = 0;
    }

    this.challengerTime += context.Delta;
    if (this.challengerTime >= settings.OwnershipDwell) this.take(bestId);

    return this.ownerId;
  }

  /** A player who boots the ball away cannot instantly re-own it. */
  startCooldown(playerId: number, now: number, cooldown: number): void {
    this.cooldowns.set(playerId, now + cooldown);
  }

  forceRelease(): void {
    this.release();
  }

  isEligible(playerId: number, now: number): boolean {
    if (playerId < 0) return false;
    const until = this.cooldowns.get(playerId);
    return until === undefined || now >= until;
  }

  private take(playerId: number): void {
    this.clearChallenger();
    this.ownerId = playerId;
  }

  private release(): void {
    this.clearChallenger();
    this.ownerId = NO_OWNER;
  }

  private clearChallenger(): void {
    this.challengerId = NO_OWNER;
    this.challengerTime = 0;
  }
}

/** Over-hit and it ricochets; a loose ball is always recoverable. */
const isCatchable = (context: PossessionContext): boolean =>
  context.State === BallState.Loose || context.BallSpeed < context.Reception.CatchSpeed;

function distanceOf(candidates: readonly PossessionCandidate[], playerId: number): number {
  if (playerId === NO_OWNER) return Number.POSITIVE_INFINITY;
  for (const c of candidates) if (c.PlayerId === playerId) return c.Distance;
  return Number.POSITIVE_INFINITY;
}

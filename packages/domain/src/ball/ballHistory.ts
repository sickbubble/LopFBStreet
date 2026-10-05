import { lerp, ZERO, type Vec3 } from '../vec.js';

/**
 * Ring buffer of recent ball states: the HUD now, lag compensation in C3.
 * Port of `BallHistory.cs`. Time is a plain double here as there.
 */
export class BallHistory {
  private readonly position: Vec3[];
  private readonly velocity: Vec3[];
  private readonly time: number[];
  private readonly size: number;
  private head = 0;

  /** How many samples are held, up to the capacity. */
  count = 0;

  constructor(capacity = 64) {
    this.size = Math.max(Math.trunc(capacity), 2);
    this.position = new Array<Vec3>(this.size).fill(ZERO);
    this.velocity = new Array<Vec3>(this.size).fill(ZERO);
    this.time = new Array<number>(this.size).fill(0);
  }

  get capacity(): number {
    return this.size;
  }

  push(position: Vec3, velocity: Vec3, time: number): void {
    this.position[this.head] = position;
    this.velocity[this.head] = velocity;
    this.time[this.head] = time;
    this.head = (this.head + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }

  /**
   * Where the ball was `secondsAgo`, interpolated between the two straddling
   * samples; the oldest sample if the buffer does not reach that far back.
   */
  positionAt(now: number, secondsAgo: number): Vec3 {
    if (this.count === 0) return ZERO;

    const target = now - Math.max(secondsAgo, 0);
    const newest = this.index(1);
    if ((this.time[newest] as number) <= target) return this.position[newest] as Vec3;

    for (let step = 1; step < this.count; step++) {
      const i = this.index(step + 1);
      const ti = this.time[i] as number;
      if (ti > target) continue;

      const j = (i + 1) % this.size;
      const span = (this.time[j] as number) - ti;
      const t = span <= 0 ? 0 : (target - ti) / span;
      return lerp(this.position[i] as Vec3, this.position[j] as Vec3, t);
    }

    return this.position[(this.head - this.count + this.size) % this.size] as Vec3;
  }

  /** Highest point the ball reached within the last `span` seconds. */
  apexSince(now: number, span: number): number {
    let best = Number.NEGATIVE_INFINITY;
    for (let step = 0; step < this.count; step++) {
      const i = this.index(step + 1);
      if (now - (this.time[i] as number) > span) break;
      best = Math.max(best, (this.position[i] as Vec3).y);
    }
    return best === Number.NEGATIVE_INFINITY ? 0 : best;
  }

  /** Velocity of the most recent sample, or zero. */
  get newestVelocity(): Vec3 {
    return this.count === 0 ? ZERO : (this.velocity[this.index(1)] as Vec3);
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /** `stepsBack` of 1 is the newest sample. */
  private index(stepsBack: number): number {
    return (((this.head - stepsBack) % this.size) + this.size) % this.size;
  }
}

/**
 * The fixed-step clock. The Godot build ran physics at 120 ticks a second, and
 * the solvers depend on it: BounceSolver differentiates the owner's velocity
 * against the previous tick. The browser hands out frames at whatever rate the
 * display runs (60, 120, 144 Hz, or a stall when the tab is hidden), so the
 * game feeds real elapsed time in here and runs exactly as many fixed steps as
 * that time holds.
 */
export class FixedStep {
  private accumulator = 0;

  /**
   * @param hz Steps per second. 120, as the Godot build.
   * @param maxSteps The most steps one frame may run. Time beyond it is
   *   dropped, so a stalled frame slows the game for a moment instead of
   *   making the next frame run hundreds of steps to catch up.
   */
  constructor(
    readonly hz: number,
    readonly maxSteps: number,
  ) {
    if (!(hz > 0) || !(maxSteps >= 1)) {
      throw new RangeError(`FixedStep needs hz > 0 and maxSteps >= 1, got ${hz} and ${maxSteps}`);
    }
  }

  /** Seconds per step. */
  get step(): number {
    return 1 / this.hz;
  }

  /**
   * Adds real elapsed time and returns how many fixed steps to run now. A
   * negative or non-finite elapsed time counts as zero.
   */
  advance(elapsed: number): number {
    if (Number.isFinite(elapsed) && elapsed > 0) {
      this.accumulator += elapsed;
    }

    const step = this.step;
    // A hair of slack, so 1/120 fed in exactly runs one step and not zero:
    // floating sums land a few ulps short.
    let steps = Math.floor((this.accumulator + 1e-9) / step);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.accumulator = 0;
      return steps;
    }

    this.accumulator = Math.max(0, this.accumulator - steps * step);
    return steps;
  }

  /** How far into the next step the clock is, 0..1: for drawing between two steps. */
  get alpha(): number {
    return Math.min(1, this.accumulator * this.hz);
  }
}

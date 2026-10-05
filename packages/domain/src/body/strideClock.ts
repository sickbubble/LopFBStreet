import { BodySide } from '../ball/limb.js';
import { clamp, lerpf } from '../mathUtil.js';

/** The stride's numbers (S18). */
export interface StrideSettings {
  readonly WalkStride: number;
  readonly RunStride: number;
  readonly WalkSpeed: number;
  readonly RunSpeed: number;
  readonly MovingAbove: number;
}

/** Where the stride is now. The right foot swings forward in the first half of the cycle. */
export interface StrideState {
  readonly Phase: number;
  readonly Length: number;
  readonly Moving: boolean;
}

export const STANDING: StrideState = { Phase: 0, Length: 1, Moving: false };

const wrap = (phase: number): number => {
  const wrapped = phase - Math.floor(phase);
  return wrapped < 0 ? wrapped + 1 : wrapped;
};

/** The foot swinging forward at this phase. The right first. */
export const swinging = (s: StrideState): BodySide => (s.Phase < 0.5 ? BodySide.Right : BodySide.Left);

/** The stride after travelling this much further at the same pace. */
export const strideAfter = (s: StrideState, distance: number): StrideState => ({
  ...s,
  Phase: wrap(s.Phase + distance / Math.max(s.Length, 0.001)),
});

/** Metres per cycle at this speed: longer at a run than a walk, held beyond either end. */
export function strideLengthAt(speed: number, settings: StrideSettings): number {
  const span = settings.RunSpeed - settings.WalkSpeed;
  const t = span <= 0 ? 1 : clamp((speed - settings.WalkSpeed) / span, 0, 1);
  return Math.max(lerpf(settings.WalkStride, settings.RunStride, t), 0.001);
}

/**
 * A clock driven by distance travelled, not time, so the locomotion cycle is
 * synced to it and never the reverse (S18). Port of `StrideClock`.
 */
export class StrideClock {
  private phase = 0;

  at(speed: number, settings: StrideSettings): StrideState {
    return { Phase: this.phase, Length: strideLengthAt(speed, settings), Moving: speed > settings.MovingAbove };
  }

  /** Advance by the ground distance travelled this step. Standing still, the phase holds. */
  advance(distance: number, speed: number, settings: StrideSettings): StrideState {
    const length = strideLengthAt(speed, settings);
    const moving = speed > settings.MovingAbove;
    if (moving && distance > 0) this.phase = wrap(this.phase + distance / length);
    return { Phase: this.phase, Length: length, Moving: moving };
  }
}

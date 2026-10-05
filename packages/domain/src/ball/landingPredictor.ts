import { withY, type Vec3 } from '../vec.js';
import { Ballistics } from './ballistics.js';

/** Where and when the ball next touches the ground. Its Y is the contact height. */
export interface LandingPrediction {
  readonly Point: Vec3;
  readonly TimeToLand: number;
}

export const isDown = (p: LandingPrediction): boolean => p.TimeToLand <= 0;

/**
 * Predicts the touchdown point on flat ground, drag-free (S4). Drives the
 * landing marker, which GDD 7 calls mandatory. Port of `LandingPredictor.cs`.
 */
export const LandingPredictor = {
  predict(position: Vec3, velocity: Vec3, effectiveGravity: number, groundHeight: number, radius: number): LandingPrediction {
    const g = Math.max(effectiveGravity, Ballistics.MinGravity);
    const contactHeight = groundHeight + radius;
    const height = position.y - contactHeight;

    if (height <= 0 && velocity.y <= 0) return down(position, contactHeight);

    const time = Ballistics.timeToDescendTo(height, velocity.y, g);
    if (time === null) return down(position, contactHeight);

    const point = Ballistics.positionAfter(position, velocity, g, time);
    return { Point: withY(point, contactHeight), TimeToLand: time };
  },
};

const down = (position: Vec3, contactHeight: number): LandingPrediction => ({
  Point: withY(position, contactHeight),
  TimeToLand: 0,
});

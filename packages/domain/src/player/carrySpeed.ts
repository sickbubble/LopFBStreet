import { moveToward } from '../mathUtil.js';
import type { CarrySettings } from '../tuning/ballSettings.js';

/**
 * How the owner's speed cap follows the carry level (S8): a factor ramped
 * linearly toward the solver's target. Port of `CarrySpeed.cs`.
 */
export class CarrySpeed {
  factor = 1;

  update(target: number, step: number, settings: CarrySettings): number {
    const time = target < this.factor ? settings.SlowTime : settings.RecoverTime;
    const delta = time <= 0 ? Number.MAX_VALUE : step / time;
    this.factor = moveToward(this.factor, target, delta);
    return this.factor;
  }
}

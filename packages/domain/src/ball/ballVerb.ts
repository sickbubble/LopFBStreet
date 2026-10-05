/**
 * Which body part meets the ball (GDD 3.3). Output, not input: the game
 * derives it from the height. Also the carry level's name. Port of `BallVerb.cs`.
 */
export const BallVerb = {
  /** Below the foot band. Flat, fast, topspin. */
  Foot: 0,
  /** Short pop, keeps it close. */
  Thigh: 1,
  /** Kills velocity, settles. */
  Chest: 2,
  /** High arc, low forward speed. */
  Head: 3,
  /** Aimed behind the player's facing. The one aim-derived verb. */
  Backheel: 4,
} as const;
export type BallVerb = (typeof BallVerb)[keyof typeof BallVerb];

export const ballVerbName = (verb: BallVerb): string =>
  (['Foot', 'Thigh', 'Chest', 'Head', 'Backheel'] as const)[verb];

/** The three states the ball can be in (GDD 4). Port of `BallState.cs`. */
export const BallState = {
  /** Owned by a player. Kept up at a carry level. */
  Possession: 0,
  /** Unowned and airborne. Real physics, no help. */
  Flight: 1,
  /** Hit the ground unowned. Rolling, still live. */
  Loose: 2,
} as const;
export type BallState = (typeof BallState)[keyof typeof BallState];

export const ballStateName = (state: BallState): string =>
  (['Possession', 'Flight', 'Loose'] as const)[state];

/**
 * The ball's state changes that follow from where it is (S24): an unowned ball
 * on the ground is loose. Port of `BallStateMachine.Next`.
 */
export const nextBallState = (state: BallState, owned: boolean, grounded: boolean): BallState =>
  state === BallState.Flight && !owned && grounded ? BallState.Loose : state;

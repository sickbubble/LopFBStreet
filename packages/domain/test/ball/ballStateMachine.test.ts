import { describe, expect, it } from 'vitest';
import { BallState, nextBallState } from '../../src/ball/ballVerb.js';

// Port of BallStateMachineTests.cs: an unowned ball on the ground is loose, however it got there (GDD 4).
describe('BallStateMachine', () => {
  // A ball released while it was already rolling never entered the ground, so
  // the old collision callback never fired and it stayed in flight.
  it('a ball released while rolling goes loose', () => {
    expect(nextBallState(BallState.Flight, false, true)).toBe(BallState.Loose);
  });

  it('an unowned ball in the air is still in flight', () => {
    expect(nextBallState(BallState.Flight, false, false)).toBe(BallState.Flight);
  });

  // Owned is the controller's to decide; the ground does not take a ball off its owner.
  it('an owned ball on the ground stays owned', () => {
    expect(nextBallState(BallState.Possession, true, true)).toBe(BallState.Possession);
  });

  it('a loose ball stays loose until someone takes it', () => {
    expect(nextBallState(BallState.Loose, false, true)).toBe(BallState.Loose);
    expect(nextBallState(BallState.Loose, false, false)).toBe(BallState.Loose);
  });
});

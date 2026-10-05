import { describe, expect, it } from 'vitest';
import { FOLLOW_OFF, FollowRule, length, scale, ZERO, type FollowSettings, type FollowStep, type Vec3 } from '../../src/index.js';
import { expectVec } from '../support/carrySim.js';

/**
 * The body follows the ball: the Godot build's S23, the rule on its own. The
 * carry it produces, touch after touch, is carryFollow.test.ts. Port of
 * `Player/FollowRuleTests.cs`.
 */

const FOLLOW: FollowSettings = { TopSpeed: 8, MinTime: 0.05, AimSpeed: 0.5, TrapAssist: 0 };

/** Godot forward is -Z. */
const FORWARD: Vec3 = { x: 0, y: 0, z: -1 };
const RIGHT: Vec3 = { x: 1, y: 0, z: 0 };

describe('the follow rule', () => {
  it('the body faces where the ball is going', () => {
    const f = FollowRule.forwardAt({ x: 3, y: 2, z: 0 }, FORWARD, FORWARD, FOLLOW);

    expectVec(f, RIGHT);
  });

  /** A ball going nearly straight up says nothing; the input turns the body round it. */
  it('a ball going straight up leaves the turn to the input', () => {
    const f = FollowRule.forwardAt({ x: 0.2, y: 2.6, z: 0 }, { x: 0, y: 0, z: 5 }, FORWARD, FOLLOW);

    expectVec(f, { x: 0, y: 0, z: 1 });
  });

  it('with no travel and no input the body keeps its facing', () => {
    const f = FollowRule.forwardAt({ x: 0, y: 2.6, z: 0 }, ZERO, scale(RIGHT, 2), FOLLOW);

    expectVec(f, RIGHT);
  });

  /** The stand spot puts the ball on the part's own spot: the hold offset ahead of the origin, along the forward. */
  it('the stand spot is the hold offset behind the contact', () => {
    const stand = FollowRule.standSpot({ x: 1, y: 0.25, z: -2 }, FORWARD, 0.3, 0);

    expect(stand.x).toBeCloseTo(1, 5);
    expect(stand.y).toBeCloseTo(0, 5);
    expect(stand.z).toBeCloseTo(-1.7, 5);
  });

  it('following arrives at the stand spot at the contact', () => {
    const step = FollowRule.propose(
      { x: 0, y: 0.25, z: -1.9 },
      0.5,
      0.3,
      ZERO,
      { x: 0, y: -2, z: -3 },
      ZERO,
      FORWARD,
      FOLLOW,
    );

    expect(step).not.toBeNull();
    const s = step!;
    expectVec(s.Forward, FORWARD);
    expect(s.Velocity.z).toBeCloseTo(-3.2, 4); // 1.6 m in 0.5 s
    expect(s.Velocity.x).toBeCloseTo(0, 4);
    expect(s.OwnerAtContact.x).toBeCloseTo(s.Stand.x, 4);
    expect(s.OwnerAtContact.z).toBeCloseTo(s.Stand.z, 4);
  });

  /**
   * Never faster than the owner can run. A contact that needs more is fallen
   * short of: the owner arrives where the top speed takes them, and whether
   * the limb reaches from there is the planner's call.
   */
  it('never faster than the top speed', () => {
    const s = FollowRule.propose({ x: 0, y: 0.25, z: -10.3 }, 0.5, 0.3, ZERO, { x: 0, y: 0, z: -20 }, ZERO, FORWARD, FOLLOW)!;

    expect(length(s.Velocity)).toBeCloseTo(8, 4);
    expect(s.OwnerAtContact.z).toBeCloseTo(-4, 4); // 8 m/s x 0.5 s, far short of the 10 m stand spot
  });

  /** A contact a hair away is not a lunge: the time is floored, and the speed clamped. */
  it('a contact a step away is not a lunge', () => {
    const v = FollowRule.velocityTo({ x: 0, y: 0, z: -0.02 }, ZERO, 0.001, FOLLOW);

    expect(length(v)).toBeCloseTo(0.4, 4); // 0.02 m over MinTime 0.05 s
  });

  it('nothing to follow when the contact is now or the follow is off', () => {
    expect(FollowRule.propose({ x: 0, y: 0.25, z: -0.3 }, 0, 0.3, ZERO, ZERO, ZERO, FORWARD, FOLLOW)).toBeNull();
    expect(FollowRule.propose({ x: 0, y: 0.25, z: -0.3 }, 0.4, 0.3, ZERO, ZERO, ZERO, FORWARD, FOLLOW_OFF)).toBeNull();
  });

  /**
   * A standing keep-up going straight up, and the player presses right: the
   * body steps round the ball to face right with it in front, rather than
   * walking off it. The ball does not move for the turn.
   */
  it('a standing turn pivots the body around the ball', () => {
    const ball: Vec3 = { x: 0, y: 0.25, z: -0.3 }; // on the foot's spot, straight ahead
    const s = FollowRule.propose(ball, 0.4, 0.3, ZERO, { x: 0, y: 2.6, z: 0 }, scale(RIGHT, 5), FORWARD, FOLLOW)!;

    expectVec(s.Forward, RIGHT);
    expect(s.Stand.x).toBeCloseTo(-0.3, 4); // stepped left and back so the ball is 0.30 ahead of the new facing
    expect(s.Stand.z).toBeCloseTo(-0.3, 4);
  });

  it('never against takes out only the backward part and moves the stand with it', () => {
    // S35: a ball dead in the cloth just behind where the body is going.
    const step: FollowStep = {
      Velocity: { x: 0.5, y: 0, z: 1.2 },
      Forward: FORWARD,
      Stand: { x: 0.1, y: 0, z: 0.24 },
      OwnerAtContact: { x: 0.1, y: 0, z: 0.24 },
    };
    const stick: Vec3 = { x: 0, y: 0, z: -5 };

    const held = FollowRule.neverAgainst(step, stick, ZERO, 0.2);

    expect(held.Velocity.x).toBeCloseTo(0.5, 4);
    expect(held.Velocity.z).toBeCloseTo(0, 4);
    expectVec(held.Stand, { x: 0.1, y: 0, z: 0 });
    expectVec(held.OwnerAtContact, held.Stand);
  });

  it('never against leaves a forward step and a standing owner alone', () => {
    const ahead: FollowStep = {
      Velocity: { x: 0, y: 0, z: -2 },
      Forward: FORWARD,
      Stand: { x: 0, y: 0, z: -0.4 },
      OwnerAtContact: { x: 0, y: 0, z: -0.4 },
    };
    const back: FollowStep = { ...ahead, Velocity: { x: 0, y: 0, z: 2 } };

    expect(FollowRule.neverAgainst(ahead, { x: 0, y: 0, z: -5 }, ZERO, 0.2)).toEqual(ahead);
    expect(FollowRule.neverAgainst(back, ZERO, ZERO, 0.2)).toEqual(back);
  });
});

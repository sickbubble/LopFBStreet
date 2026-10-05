import { describe, expect, it } from 'vitest';
import {
  BallState,
  NO_OWNER,
  PossessionArbiter,
  type PossessionCandidate,
  type PossessionContext,
  type PossessionSettings,
  type ReceptionSettings,
} from '../../src/index.js';

/** Who owns the ball (S3), with hysteresis. Port of `Ball/PossessionArbiterTests.cs`. */

const STEP = 1 / 120;

const SETTINGS: PossessionSettings = { Radius: 2.5, OwnershipMargin: 0.5, OwnershipDwell: 0.2, TouchCooldown: 0.15 };

/** `new ReceptionSettings(CatchSpeed: 9.0f)`, the other two at their C# defaults. */
const RECEPTION: ReceptionSettings = { CatchSpeed: 9.0, RicochetRestitution: 0.4, CatchWindow: 0.12 };

const context = (clock: number, state: BallState = BallState.Loose, ballSpeed = 0): PossessionContext => ({
  State: state,
  BallSpeed: ballSpeed,
  Clock: clock,
  Delta: STEP,
  Settings: SETTINGS,
  Reception: RECEPTION,
});

const at = (PlayerId: number, Distance: number): PossessionCandidate => ({ PlayerId, Distance });

describe('the possession arbiter', () => {
  // --- Capture

  it('an unowned loose ball inside the radius is captured', () => {
    const arbiter = new PossessionArbiter();

    const owner = arbiter.step([at(0, 1.0)], context(0));

    expect(owner).toBe(0);
  });

  it('a player outside the radius does not capture', () => {
    const arbiter = new PossessionArbiter();

    const owner = arbiter.step([at(0, 2.6)], context(0));

    expect(owner).toBe(NO_OWNER);
  });

  it('the nearest of several players captures', () => {
    const arbiter = new PossessionArbiter();

    const owner = arbiter.step([at(0, 2.1), at(1, 0.7), at(2, 1.4)], context(0));

    expect(owner).toBe(1);
  });

  /** Over-hitting a pass is the mistake: a ball arriving above catch speed ricochets. */
  it('a ball in flight arriving too fast is not caught', () => {
    const arbiter = new PossessionArbiter();

    const owner = arbiter.step([at(0, 1.0)], context(0, BallState.Flight, 12));

    expect(owner).toBe(NO_OWNER);
  });

  it('a ball in flight arriving slowly is caught', () => {
    const arbiter = new PossessionArbiter();

    const owner = arbiter.step([at(0, 1.0)], context(0, BallState.Flight, 4));

    expect(owner).toBe(0);
  });

  /** A loose ball is always recoverable: you are walking over to it. */
  it('a fast rolling loose ball is still recoverable', () => {
    const arbiter = new PossessionArbiter();

    const owner = arbiter.step([at(0, 1.0)], context(0, BallState.Loose, 30));

    expect(owner).toBe(0);
  });

  // --- Release

  it('an owner who walks out of the radius loses the ball', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.0)], context(0));

    const owner = arbiter.step([at(0, 3.0)], context(1));

    expect(owner).toBe(NO_OWNER);
  });

  it('an owner who leaves the game entirely loses the ball', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.0)], context(0));

    const owner = arbiter.step([], context(1));

    expect(owner).toBe(NO_OWNER);
  });

  // --- Cooldown

  /** Nobody instantly re-owns what they just kicked. Without this the ball never leaves the launcher. */
  it('a player on cooldown cannot re own the ball they just kicked', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.0)], context(0));
    arbiter.startCooldown(0, 0, SETTINGS.TouchCooldown);

    const duringCooldown = arbiter.step([at(0, 1.0)], context(0.1));
    const afterCooldown = arbiter.step([at(0, 1.0)], context(0.16));

    expect(duringCooldown).toBe(NO_OWNER);
    expect(afterCooldown).toBe(0);
  });

  it('a cooldown on one player does not block another', () => {
    const arbiter = new PossessionArbiter();
    arbiter.startCooldown(0, 0, SETTINGS.TouchCooldown);

    const owner = arbiter.step([at(0, 0.5), at(1, 1.5)], context(0.05));

    expect(owner).toBe(1);
  });

  // --- Hysteresis: the reason this class exists

  it('a challenger closer by less than the margin never takes the ball', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.0)], context(0));

    for (let tick = 1; tick < 600; tick++) {
      arbiter.step([at(0, 1.0), at(1, 0.6)], context(tick * STEP));
    }

    expect(arbiter.ownerId).toBe(0);
  });

  it('a challenger beyond the margin must hold the advantage for the dwell', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.0)], context(0));

    // 0.2 s of dwell at 120 Hz is 24 ticks. Twenty is not enough.
    for (let tick = 1; tick <= 20; tick++) {
      arbiter.step([at(0, 1.0), at(1, 0.4)], context(tick * STEP));
    }

    expect(arbiter.ownerId).toBe(0);

    for (let tick = 21; tick <= 30; tick++) {
      arbiter.step([at(0, 1.0), at(1, 0.4)], context(tick * STEP));
    }

    expect(arbiter.ownerId).toBe(1);
  });

  /**
   * A challenger who gets close, backs off, and closes again starts the dwell
   * over. Otherwise dwell accumulates across separate approaches and the
   * margin stops meaning anything.
   */
  it('an interrupted challenge restarts the dwell', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.0)], context(0));

    for (let tick = 1; tick <= 20; tick++) {
      arbiter.step([at(0, 1.0), at(1, 0.4)], context(tick * STEP));
    }

    // Backs off inside the margin for a tick.
    arbiter.step([at(0, 1.0), at(1, 0.9)], context(21 * STEP));

    for (let tick = 22; tick <= 41; tick++) {
      arbiter.step([at(0, 1.0), at(1, 0.4)], context(tick * STEP));
    }

    expect(arbiter.ownerId).toBe(0);
  });

  /**
   * THE test. Six players packed around a 2.5 m radius, all jittering, each
   * taking a turn at being nearest. Plain nearest-player-wins would hand the
   * ball around dozens of times a second. Nothing here ever beats the owner by
   * the margin, so nothing changes.
   */
  it('six jittering players do not make ownership flicker', () => {
    const arbiter = new PossessionArbiter();
    const candidates: PossessionCandidate[] = [];

    let changes = 0;
    let previousOwner = NO_OWNER;

    for (let tick = 0; tick < 600; tick++) {
      for (let player = 0; player < 6; player++) {
        // All six orbit 1.2 m out, within 0.2 m of each other, so the nearest
        // keeps changing but nobody earns the 0.5 m margin.
        const phase = tick * 0.05 + player * 1.05;
        candidates[player] = at(player, 1.2 + 0.1 * Math.sin(phase));
      }

      const owner = arbiter.step(candidates, context(tick * STEP));

      if (owner !== previousOwner) {
        changes++;
        previousOwner = owner;
      }
    }

    expect(changes).toBe(1); // the initial capture, and nothing after it
    expect(arbiter.ownerId).not.toBe(NO_OWNER);
  });

  it('a genuine challenger does eventually take the ball', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.5)], context(0));
    expect(arbiter.ownerId).toBe(0);

    for (let tick = 1; tick <= 30; tick++) {
      arbiter.step([at(0, 1.5), at(1, 0.3)], context(tick * STEP));
    }

    expect(arbiter.ownerId).toBe(1);
  });

  it('force release drops ownership and clears any challenger', () => {
    const arbiter = new PossessionArbiter();
    arbiter.step([at(0, 1.0)], context(0));

    arbiter.forceRelease();

    expect(arbiter.ownerId).toBe(NO_OWNER);
    expect(arbiter.challenger).toBe(NO_OWNER);
  });
});

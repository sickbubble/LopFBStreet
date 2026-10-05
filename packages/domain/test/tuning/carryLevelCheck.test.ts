import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NO_SHOULDER,
  NO_TRAP,
  POP_MARGIN,
  type BallSettings,
  type CarryLevels,
  type ShoulderTouch,
  type VerbBands,
} from '../../src/tuning/ballSettings.js';
import { NO_BODY, type BodyModel } from '../../src/tuning/bodyModel.js';
import { CarryLevelCheck } from '../../src/tuning/carryLevelCheck.js';
import { loadBallSettings, loadPlayerSettings } from '../../src/tuning/loaders.js';
import { TEST_LAUNCH } from '../support/passFixtures.js';

/**
 * The derivations docs/TUNING_LOG.md asks a human to re-check by hand,
 * enforced instead. Port of `CarryLevelCheckTests.cs`, plus the shipped
 * tuning checked against the same predicates (Godot did that at boot).
 */

const BodyRadius = 0.35; // the player capsule: the body before the rig
const ChestDepth = 0.12; // the mannequin's chest, spine axis to surface
const BallRadius = 0.11;

/** The documented S8 table, as IMPLEMENTATION.md prints it. */
const S8: CarryLevels = {
  Foot: { TouchHeight: 0, HoldOffset: 0.3, Apex: 0.4, SpeedFactor: 0.6, LeadFactor: 1.0, Correction: 0.4, BreakRadius: 0, MicroMotion: 0 },
  Thigh: { TouchHeight: 0.55, HoldOffset: 0.28, Apex: 0.9, SpeedFactor: 0.5, LeadFactor: 0.75, Correction: 0.55, BreakRadius: 0.35, MicroMotion: 0.04 },
  Chest: { TouchHeight: 1.05, HoldOffset: 0.25, Apex: 1.4, SpeedFactor: 0.4, LeadFactor: 0.5, Correction: 0.75, BreakRadius: 0.25, MicroMotion: 0.03 },
  Head: { TouchHeight: 1.55, HoldOffset: 0.08, Apex: 1.9, SpeedFactor: 0.3, LeadFactor: 0.35, Correction: 0.85, BreakRadius: 0.15, MicroMotion: 0.02 },
};

const Bands: VerbBands = { FootMax: 0.5, ThighMax: 0.95, ChestMax: 1.45 };

function Settings(levels: CarryLevels, maxApex = 2.0, behindReach = 0.2): BallSettings {
  return {
    Body: { Radius: BallRadius, Mass: 0.43, GravityScale: 1, LinearDamp: 0.08, AngularDamp: 0.1, Bounce: 0.72, Friction: 0.35 },
    Possession: { Radius: 2.5, OwnershipMargin: 0.5, OwnershipDwell: 0.2, TouchCooldown: 0.15 },
    Bounce: {
      BounceMaxApex: maxApex,
      BounceChargeTime: 0.6,
      FlightEase: 0.5,
      TouchLeadPerSpeed: 0.05,
      TouchMaxSpeed: 12,
      KeepUpReach: 1.5,
      BehindReach: behindReach,
      CarryRadius: 0.65,
      StallCoupling: 0.08,
      StallRestore: 6,
      StallDamping: 4,
      Levels: levels,
      Trap: NO_TRAP,
      Shoulder: NO_SHOULDER,
    },
    Carry: { SlowTime: 0.6, RecoverTime: 0.15 },
    Launch: TEST_LAUNCH,
    Reception: { CatchSpeed: 9, RicochetRestitution: 0.4, CatchWindow: 0.12 },
    Bands,
  };
}

/** The S27 ladder: the S25 one with the chest holding and the shoulders keeping up on its rung. */
const S27: CarryLevels = {
  Foot: { ...S8.Foot, TouchHeight: 0.25, Apex: 0.6 },
  Thigh: { ...S8.Thigh, TouchHeight: 0.85, Apex: 1.2, HoldOffset: 0.23, BreakRadius: 0 },
  Chest: { ...S8.Chest, TouchHeight: 1.1, Apex: 1.63, HoldOffset: 0.25, BreakRadius: 0.25 },
  Head: { ...S8.Head, TouchHeight: 1.55, Apex: 1.9, HoldOffset: 0.03, BreakRadius: 0 },
};

const Shoulders: ShoulderTouch = { TouchHeight: 1.28, HoldOffset: 0.06 };

const WithShoulders: BodyModel = {
  Foot: { Height: 0.74, Lateral: 0.1, Reach: 0.55 },
  Thigh: { Height: 0.74, Lateral: 0.1, Reach: 0.4 },
  Chest: { Height: 1.04, Lateral: 0, Reach: 0.3 },
  Head: { Height: 1.45, Lateral: 0, Reach: 0.25 },
  SideDeadband: 0.05,
  Shoulder: { Height: 1.17, Lateral: 0.14, Reach: 0.26 },
  ShoulderLine: 0.1,
  ThighSpot: 0,
};

function WithShoulder(levels: CarryLevels, shoulder: ShoulderTouch): BallSettings {
  const settings = Settings(levels);
  return { ...settings, Bounce: { ...settings.Bounce, Shoulder: shoulder } };
}

const golden = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../tools/golden/tuning/${name}`, import.meta.url), 'utf8'));

describe('CarryLevelCheck', () => {
  it('the documented s8 table is coherent', () => {
    expect(CarryLevelCheck.verbMatchesLevel(S8, Bands)).toBe(true);
    expect(CarryLevelCheck.apexClearsTouchHeight(S8)).toBe(true);
    expect(CarryLevelCheck.keepUpHoldsItsLevel(S8)).toBe(true);
    expect(CarryLevelCheck.levelsAscend(S8)).toBe(true);

    // The head's 0.08 is under the 0.23 floor and passes: the head ball sits
    // on the crown, and the floor is for the levels in front of the torso.
    expect(CarryLevelCheck.problems(Settings(S8), ChestDepth)).toEqual([]);
  });

  it('a touch height in the wrong band passes as the wrong body part', () => {
    const levels: CarryLevels = { ...S8, Chest: { ...S8.Chest, TouchHeight: 0.9, Apex: 1.25 } };

    expect(CarryLevelCheck.verbMatchesLevel(levels, Bands)).toBe(false);

    const problems = CarryLevelCheck.problems(Settings(levels), ChestDepth);
    expect(problems.some((p) => p.includes('Chest') && p.includes('Thigh band'))).toBe(true);
  });

  it('an apex that does not clear its touch height hovers', () => {
    const levels: CarryLevels = { ...S8, Thigh: { ...S8.Thigh, Apex: 0.7 } }; // needs 0.75

    expect(CarryLevelCheck.apexClearsTouchHeight(levels)).toBe(false);
    expect(CarryLevelCheck.problems(Settings(levels), ChestDepth).some((p) => p.includes('hovers'))).toBe(true);
  });

  it('an apex exactly at the pop margin is accepted', () => {
    const levels: CarryLevels = { ...S8, Thigh: { ...S8.Thigh, Apex: 0.55 + POP_MARGIN } };

    expect(CarryLevelCheck.apexClearsTouchHeight(levels)).toBe(true);
  });

  it('a keep up that lands in the band above climbs the ladder', () => {
    const levels: CarryLevels = { ...S8, Thigh: { ...S8.Thigh, Apex: 1.3 } }; // chest band starts at 1.25

    expect(CarryLevelCheck.apexClearsTouchHeight(levels), 'clearing its own height is not the fault here').toBe(true);
    expect(CarryLevelCheck.keepUpHoldsItsLevel(levels)).toBe(false);
    expect(CarryLevelCheck.problems(Settings(levels), ChestDepth).some((p) => p.includes('climbs the ladder'))).toBe(true);
  });

  it('inverted touch heights are rejected', () => {
    const levels: CarryLevels = {
      ...S8,
      Chest: { ...S8.Chest, TouchHeight: 1.55 },
      Head: { ...S8.Head, TouchHeight: 1.05 },
    };

    expect(CarryLevelCheck.levelsAscend(levels)).toBe(false);
  });

  it('a flat speed ladder is rejected', () => {
    const levels: CarryLevels = { ...S8, Thigh: { ...S8.Thigh, SpeedFactor: 0.6 } };

    expect(CarryLevelCheck.levelsAscend(levels)).toBe(false);
    expect(CarryLevelCheck.problems(Settings(levels), ChestDepth).some((p) => p.includes('skill ladder'))).toBe(true);
  });

  it.each([
    [0.4, BodyRadius, false], // inside the capsule
    [0.46, BodyRadius, true], // exactly on the capsule: the old floor
    [0.65, BodyRadius, true], // shipped until the rig came in
    [0.2, ChestDepth, false], // inside the mannequin's chest
    [0.23, ChestDepth, true], // exactly on the chest: the floor now
    [0.3, ChestDepth, true], // shipped
  ])('a held ball must rest outside the body (hold %f, depth %f -> %s)', (holdOffset, bodyDepth, expected) => {
    expect(CarryLevelCheck.heldBallRestsOutsideTheBody(holdOffset, bodyDepth, BallRadius)).toBe(expected);
  });

  it.each([
    [2.0, 0.65, 2.5, true],
    [2.4, 0.65, 2.5, true],
    [2.5, 0.0, 2.5, true],
    [2.5, 0.65, 2.5, false],
  ])('a full bounce must stay inside possession (apex %f, hold %f, radius %f -> %s)', (apex, hold, radius, expected) => {
    expect(CarryLevelCheck.bounceStaysInsidePossession(apex, hold, radius)).toBe(expected);
  });

  it.each([
    [0.2, 0.3, true], // shipped
    [0.35, 0.65, true], // the capsule-era pair
    [0.0, 0.3, true], // nothing behind counts: the strictest forward arc
    [0.35, 0.3, false], // the old lip under the new rest point
    [0.65, 0.65, false], // as far behind as ahead: not forward
    [-0.1, 0.3, false], // a ball at the feet is unplayable
  ])('reach is a forward arc only below the hold offset (behind %f, hold %f -> %s)', (behind, hold, expected) => {
    expect(CarryLevelCheck.reachIsAForwardArc(behind, hold)).toBe(expected);
  });

  it('a behind reach past the foot offset is named at boot', () => {
    const problems = CarryLevelCheck.problems(Settings(S8, 2.0, 0.3), ChestDepth);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('BehindReach');
    expect(problems[0]).toContain('foot HoldOffset 0.3');
  });

  it('a chest offset inside the torso is named as the chests', () => {
    const levels: CarryLevels = { ...S8, Chest: { ...S8.Chest, HoldOffset: 0.2 } };

    const problems = CarryLevelCheck.problems(Settings(levels), ChestDepth);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Chest HoldOffset 0.2');
  });

  it('problems names every fault rather than the first', () => {
    const levels: CarryLevels = {
      ...S8,
      Thigh: { ...S8.Thigh, Apex: 0.7 },
      Chest: { ...S8.Chest, HoldOffset: 0.2 },
    };

    const problems = CarryLevelCheck.problems(Settings(levels), ChestDepth);

    expect(problems).toHaveLength(2);
    expect(problems.some((p) => p.includes('hovers'))).toBe(true);
    expect(problems.some((p) => p.includes('HoldOffset'))).toBe(true);
  });

  it('a keep up lands on its own spot whatever its lead factor', () => {
    const bounce = Settings(S8).Bounce;

    expect(CarryLevelCheck.keepUpLandsOutsideTheBody(S8.Chest, bounce, ChestDepth, BallRadius)).toBe(true);
    expect(CarryLevelCheck.keepUpLandsOutsideTheBody({ ...S8.Chest, HoldOffset: 0.2 }, bounce, ChestDepth, BallRadius)).toBe(false);
  });

  it('a keep up inside the torso is named at boot', () => {
    const levels: CarryLevels = { ...S8, Thigh: { ...S8.Thigh, HoldOffset: 0.2, BreakRadius: 0 } };

    const problems = CarryLevelCheck.problems(Settings(levels), ChestDepth);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Thigh HoldOffset 0.2');
    expect(problems[0]).toContain('kept up');
  });

  it('the s25 ladder is coherent', () => {
    const levels: CarryLevels = {
      Foot: { ...S8.Foot, TouchHeight: 0.25, Apex: 0.6 },
      Thigh: { ...S8.Thigh, TouchHeight: 0.85, Apex: 1.2, BreakRadius: 0 },
      Chest: { ...S8.Chest, BreakRadius: 0 },
      Head: { ...S8.Head, BreakRadius: 0 },
    };

    expect(CarryLevelCheck.keepUpHoldsItsLevel(levels)).toBe(true);
    expect(CarryLevelCheck.problems(Settings(levels), ChestDepth)).toEqual([]);
  });

  // --- The shoulders (S27) ---

  it('the s27 ladder with shoulders is coherent', () => {
    expect(CarryLevelCheck.problems(WithShoulder(S27, Shoulders), ChestDepth, 0, WithShoulders)).toEqual([]);
  });

  it('a shoulder below the chest is named', () => {
    const sunken: ShoulderTouch = { TouchHeight: 1.05, HoldOffset: 0.06 };

    expect(CarryLevelCheck.shouldersSitAboveTheChest(sunken, S27.Chest)).toBe(false);
    expect(
      CarryLevelCheck.problems(WithShoulder(S27, sunken), ChestDepth, 0, WithShoulders).some((p) => p.includes('no ball is ever shouldered')),
    ).toBe(true);
  });

  it('a chest apex that does not clear the shoulder is named', () => {
    const tooLow: CarryLevels = { ...S27, Chest: { ...S27.Chest, Apex: 1.45 } };

    expect(CarryLevelCheck.shoulderApexClearsTheShoulder(Shoulders, tooLow.Chest)).toBe(false);
    expect(
      CarryLevelCheck.problems(WithShoulder(tooLow, Shoulders), ChestDepth, 0, WithShoulders).some((p) => p.includes('a shouldered ball hovers')),
    ).toBe(true);
  });

  it('a shoulder inside its own line is named', () => {
    const narrow: BodyModel = { ...WithShoulders, ShoulderLine: 0.2 };

    expect(CarryLevelCheck.shoulderKeepsItsOwnBall(narrow)).toBe(false);
    expect(
      CarryLevelCheck.problems(WithShoulder(S27, Shoulders), ChestDepth, 0, narrow).some((p) => p.includes('never seen again')),
    ).toBe(true);
  });

  it('a shoulder outside the chest band is named', () => {
    const tooHigh: ShoulderTouch = { TouchHeight: 1.5, HoldOffset: 0.06 };

    expect(CarryLevelCheck.shoulderIsInTheChestBand(tooHigh, Bands)).toBe(false);
    expect(
      CarryLevelCheck.problems(WithShoulder(S27, tooHigh), ChestDepth, 0, WithShoulders).some((p) => p.includes('not the Chest band')),
    ).toBe(true);
  });

  it('a table without shoulders is judged as it was before s27', () => {
    expect(CarryLevelCheck.shouldersSitAboveTheChest(NO_SHOULDER, S27.Chest)).toBe(true);
    expect(CarryLevelCheck.shoulderApexClearsTheShoulder(NO_SHOULDER, S27.Chest)).toBe(true);
    expect(CarryLevelCheck.shoulderIsInTheChestBand(NO_SHOULDER, Bands)).toBe(true);
    expect(CarryLevelCheck.shoulderKeepsItsOwnBall(NO_BODY)).toBe(true);
    expect(CarryLevelCheck.problems(Settings(S27), ChestDepth)).toEqual([]);
  });

  // --- The shipped tuning (Godot ran this at boot, M0Feel) ---

  it('the shipped tuning passes every boot check', () => {
    const playerJson = golden('player.json') as { values: Record<string, number> };
    const ball = loadBallSettings(golden('ball.json'));
    const player = loadPlayerSettings(playerJson);
    // PlayerMotor.BodyDepth is ChestDepth once the rigged character shows, and the web always shows the mannequin.
    const chestDepth = playerJson.values['ChestDepth'];
    expect(chestDepth).toBeTypeOf('number');

    expect(CarryLevelCheck.problems(ball, chestDepth!, player.SprintSpeed, player.Body)).toEqual([]);
  });
});

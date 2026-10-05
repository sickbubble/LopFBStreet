import { Ballistics } from '../ball/ballistics.js';
import { BallVerb, ballVerbName } from '../ball/ballVerb.js';
import { BounceSolver } from '../ball/bounceSolver.js';
import { clamp } from '../mathUtil.js';
import {
  levelFor,
  levelForApex,
  POP_MARGIN,
  shoulderExists,
  verbFor,
  type BallSettings,
  type BounceSettings,
  type CarryLevel,
  type CarryLevels,
  type LaunchSettings,
  type ShoulderTouch,
  type TrapSettings,
  type VerbBands,
} from './ballSettings.js';
import { hasShoulders, NO_BODY, type BodyModel } from './bodyModel.js';
import { PASS_PARTS_BY_POWER, PassPart, passPartName, profileFor, type PassProfiles } from './passProfiles.js';

/**
 * Whether a set of carry levels is internally coherent: the boot check of
 * docs/IMPLEMENTATION.md S8. Port of `Tuning/CarryLevelCheck.cs` at
 * godot-final. The predicates are pure; `problems` names every incoherence
 * in the live settings, in the C# wording. Allocates: run it at boot, never
 * per tick.
 */

/** The four levels in body order, with the verb each one is named by. */
const ORDER: readonly BallVerb[] = [BallVerb.Foot, BallVerb.Thigh, BallVerb.Chest, BallVerb.Head];

/** The levels whose rest point is ahead of the torso, and so can be inside it. */
const IN_FRONT_OF_THE_BODY: readonly BallVerb[] = [BallVerb.Thigh, BallVerb.Chest];

/** The shipped cap sits exactly on its derivation; a float's width either way is the same value. */
const FLOAT_SLACK = 0.0001;

/** A millimetre, so a spot typed to match a measured hip is not failed on float rounding. */
const HIP_TOLERANCE = 0.001;

/** C#'s `{0:0.##}`: at most two decimals, trailing zeros dropped, culture-free. */
const f2 = (x: number): string => String(Number(x.toFixed(2)));

/** C#'s `{0:0.#}`. */
const f1 = (x: number): string => String(Number(x.toFixed(1)));

/** C#'s `{0:0}`. */
const f0 = (x: number): string => String(Number(x.toFixed(0)));

/** The hold offset that takes the ball furthest from the origin. */
function furthestHoldOffset(levels: CarryLevels): number {
  let furthest = 0;
  for (const verb of ORDER) {
    furthest = Math.max(furthest, levelFor(levels, verb).HoldOffset);
  }
  return furthest;
}

export const CarryLevelCheck = {
  /** What an untimed trap leaves the follow in hand, m/s. */
  TrapMargin: 0.4,

  /** A pass from a carry fires from the level's touch height, so the bands must name that height the level's own part. */
  verbMatchesLevel(levels: CarryLevels, bands: VerbBands): boolean {
    for (const verb of ORDER) {
      if (verbFor(bands, levelFor(levels, verb).TouchHeight) !== verb) {
        return false;
      }
    }
    return true;
  },

  /** Every keep-up must clear its own touch height by `POP_MARGIN`, or the touch never re-arms. */
  apexClearsTouchHeight(levels: CarryLevels): boolean {
    for (const verb of ORDER) {
      const level = levelFor(levels, verb);
      if (level.Apex < level.TouchHeight + POP_MARGIN) {
        return false;
      }
    }
    return true;
  },

  /** An automatic keep-up leaves you at the level you were already on. */
  keepUpHoldsItsLevel(levels: CarryLevels): boolean {
    for (const verb of ORDER) {
      if (levelForApex(levels, levelFor(levels, verb).Apex) !== verb) {
        return false;
      }
    }
    return true;
  },

  /** Touch heights and apexes rise foot to head while the speed cap falls: the skill ladder. */
  levelsAscend(levels: CarryLevels): boolean {
    for (let i = 1; i < ORDER.length; i++) {
      const below = levelFor(levels, ORDER[i - 1]!);
      const here = levelFor(levels, ORDER[i]!);
      if (here.TouchHeight <= below.TouchHeight || here.Apex <= below.Apex || here.SpeedFactor >= below.SpeedFactor) {
        return false;
      }
    }
    return true;
  },

  /** A held ball rests on the visible body's surface, not inside it. */
  heldBallRestsOutsideTheBody: (holdOffset: number, bodyDepth: number, ballRadius: number): boolean =>
    holdOffset >= bodyDepth + ballRadius,

  /** A standing keep-up lands on the level's own spot (S25), with the held ball's floor. */
  keepUpLandsOutsideTheBody: (level: CarryLevel, bounce: BounceSettings, bodyDepth: number, ballRadius: number): boolean =>
    BounceSolver.keepUpLead(level, 0, bounce) >= bodyDepth + ballRadius,

  /** An untimed trap's travel stays under the owner's top speed by `TrapMargin` (S24). */
  untimedTrapStaysInsideTheFollow: (trap: TrapSettings, foot: CarryLevel, topSpeed: number): boolean =>
    trap.MaxResidual <= topSpeed * (1 - foot.SpeedFactor) - CarryLevelCheck.TrapMargin + FLOAT_SLACK,

  /** The shortest keep-up flight on the ladder, touch to touch, seconds (S26). */
  shortestKeepUpFlight(levels: CarryLevels, gravity: number): number {
    let shortest = Number.MAX_VALUE;
    for (const verb of ORDER) {
      const level = levelFor(levels, verb);
      const rise = Math.max(level.Apex - level.TouchHeight, 0);
      const flight = Ballistics.timeToReturn(Ballistics.verticalSpeedForApex(rise, gravity), gravity);
      shortest = Math.min(shortest, flight);
    }
    return shortest;
  },

  /** The foot's touch height is the instep (above a grounded ball's centre) or zero, the ground (S17). */
  footTouchIsTheInstepOrTheGround: (footTouchHeight: number, ballRadius: number): boolean =>
    footTouchHeight <= 0 || footTouchHeight > ballRadius,

  /** A ball at the top of a full bounce is still inside the 3D possession radius (S6). */
  bounceStaysInsidePossession: (maxApex: number, holdOffset: number, possessionRadius: number): boolean =>
    Math.sqrt(maxApex * maxApex + holdOffset * holdOffset) <= possessionRadius,

  /** Reach is a forward arc only while the line behind is nearer than the rest point ahead (S13). */
  reachIsAForwardArc: (behindReach: number, holdOffset: number): boolean => behindReach >= 0 && behindReach < holdOffset,

  /** The shoulders sit above the chest they share a level with (S27). */
  shouldersSitAboveTheChest: (shoulder: ShoulderTouch, chest: CarryLevel): boolean =>
    !shoulderExists(shoulder) || shoulder.TouchHeight > chest.TouchHeight,

  /** The chest apex clears the shoulder's own touch height by `POP_MARGIN` (S27). */
  shoulderApexClearsTheShoulder: (shoulder: ShoulderTouch, chest: CarryLevel): boolean =>
    !shoulderExists(shoulder) || chest.Apex >= shoulder.TouchHeight + POP_MARGIN,

  /** A shoulder's own spot is outside the shoulder line, so a shouldered ball comes back to it (S27). */
  shoulderKeepsItsOwnBall: (body: BodyModel): boolean =>
    !hasShoulders(body) || Math.abs(body.Shoulder.Lateral) > body.ShoulderLine,

  /** A thigh keep-up's sideways spot is outside the deadband and no further out than the hip (S29). Zero passes. */
  kneeSpotSitsBetweenTheLineAndTheHip: (body: BodyModel): boolean =>
    body.ThighSpot === 0 ||
    (body.ThighSpot > body.SideDeadband && body.ThighSpot <= Math.abs(body.Thigh.Lateral) + HIP_TOLERANCE),

  /** A shoulder ball is in the chest's band (S27). */
  shoulderIsInTheChestBand: (shoulder: ShoulderTouch, bands: VerbBands): boolean =>
    !shoulderExists(shoulder) || verbFor(bands, shoulder.TouchHeight) === BallVerb.Chest,

  // --- The pass by part (S28) ---

  /** No part passes harder than the foot. */
  noPartOutpassesTheFoot(parts: PassProfiles): boolean {
    for (const part of PASS_PARTS_BY_POWER) {
      if (profileFor(parts, part).PowerScale > parts.Foot.PowerScale) {
        return false;
      }
    }
    return true;
  },

  /** The power order is real football's: foot, head, thigh, backheel, chest, shoulder. Ties allowed. */
  passOrderHolds(parts: PassProfiles): boolean {
    for (let i = 1; i < PASS_PARTS_BY_POWER.length; i++) {
      if (profileFor(parts, PASS_PARTS_BY_POWER[i]!).PowerScale > profileFor(parts, PASS_PARTS_BY_POWER[i - 1]!).PowerScale) {
        return false;
      }
    }
    return true;
  },

  /** Only a full foot pass is too hot to catch (S28). */
  onlyAFootPassReachesCatchSpeed(launch: LaunchSettings, catchSpeed: number): boolean {
    for (const part of PASS_PARTS_BY_POWER) {
      const top = Ballistics.speedForCharge(launch, 1, profileFor(launch.Parts, part).PowerScale);
      if ((part === PassPart.Foot) !== (top >= catchSpeed)) {
        return false;
      }
    }
    return true;
  },

  /** The longest flat-ground pass a part plays at full charge inside its loft window: `v² sin 2θ / g`. */
  bestFlatRange(launch: LaunchSettings, part: PassPart, effectiveGravity: number): number {
    const profile = profileFor(launch.Parts, part);
    const speed = Ballistics.speedForCharge(launch, 1, profile.PowerScale);
    const degrees = clamp(45, profile.LoftMinDegrees, Math.max(profile.LoftMaxDegrees, profile.LoftMinDegrees));
    const radians = (degrees * Math.PI) / 180;
    return (speed * speed * Math.sin(2 * radians)) / Math.max(effectiveGravity, Ballistics.MinGravity);
  },

  /** Every part's best pass leaves the possession radius. */
  everyPassLeaves(launch: LaunchSettings, possessionRadius: number, effectiveGravity: number): boolean {
    for (const part of PASS_PARTS_BY_POWER) {
      if (CarryLevelCheck.bestFlatRange(launch, part, effectiveGravity) <= possessionRadius) {
        return false;
      }
    }
    return true;
  },

  /**
   * Every incoherence in these settings, named, with the fix implied. Empty
   * means the table is sound.
   * @param bodyDepth How far the visible body reaches ahead of the origin, from the scene.
   * @param topSpeed The owner's top speed; zero skips the checks that need one.
   * @param body The owner's body; a body with no shoulders skips the checks that need them.
   */
  problems(settings: BallSettings, bodyDepth: number, topSpeed = 0, body: BodyModel = NO_BODY): string[] {
    const problems: string[] = [];
    const levels = settings.Bounce.Levels;

    for (const verb of ORDER) {
      const level = levelFor(levels, verb);
      const v = ballVerbName(verb);

      const named = verbFor(settings.Bands, level.TouchHeight);
      if (named !== verb) {
        const n = ballVerbName(named);
        problems.push(
          `${v} touch height ${f2(level.TouchHeight)} m is in the ${n} band, so a pass from a ${v} carry fires as a ${n} ball. Move the height or the VerbBands edge.`,
        );
      }

      if (level.Apex < level.TouchHeight + POP_MARGIN) {
        problems.push(
          `${v} apex ${f2(level.Apex)} m does not clear its touch height ${f2(level.TouchHeight)} m by PopMargin ${f2(POP_MARGIN)} m, so the touch never re-arms and the ball hovers.`,
        );
      } else {
        // Only reachable when the apex is too high: too low is the hover above.
        const after = levelForApex(levels, level.Apex);
        if (after !== verb) {
          problems.push(
            `a ${v} keep-up to ${f2(level.Apex)} m lands in the ${ballVerbName(after)} band, so carrying at ${v} climbs the ladder on its own.`,
          );
        }
      }
    }

    if (!CarryLevelCheck.levelsAscend(levels)) {
      problems.push(
        'the levels do not ascend foot to head with the speed cap descending. That spread is the skill ladder, not a penalty curve.',
      );
    }

    // Only the levels whose ball rests in front of the torso have a floor.
    for (const verb of IN_FRONT_OF_THE_BODY) {
      const level = levelFor(levels, verb);
      const v = ballVerbName(verb);
      if (
        !CarryLevelCheck.heldBallRestsOutsideTheBody(level.HoldOffset, bodyDepth, settings.Body.Radius) ||
        !CarryLevelCheck.keepUpLandsOutsideTheBody(level, settings.Bounce, bodyDepth, settings.Body.Radius)
      ) {
        problems.push(
          `${v} HoldOffset ${f2(level.HoldOffset)} m is inside body depth ${f2(bodyDepth)} + ball radius ${f2(settings.Body.Radius)} m, so a ball kept up or held at the ${v} sits inside the player and is invisible.`,
        );
      }
    }

    if (!CarryLevelCheck.footTouchIsTheInstepOrTheGround(levels.Foot.TouchHeight, settings.Body.Radius)) {
      problems.push(
        `Foot touch height ${f2(levels.Foot.TouchHeight)} m is below a grounded ball's centre (${f2(settings.Body.Radius)} m), so the instep never meets the ball in the air. Set it to the instep (~0.25) or to 0 for the ground (S17).`,
      );
    }

    const furthest = furthestHoldOffset(levels);
    if (!CarryLevelCheck.bounceStaysInsidePossession(settings.Bounce.BounceMaxApex, furthest, settings.Possession.Radius)) {
      problems.push(
        `a full bounce to ${f2(settings.Bounce.BounceMaxApex)} m, ${f2(furthest)} m ahead, leaves the ${f2(settings.Possession.Radius)} m possession radius at the top and flickers to FLIGHT. Lower BounceMaxApex or raise the radius (S3).`,
      );
    }

    if (topSpeed > 0 && !CarryLevelCheck.untimedTrapStaysInsideTheFollow(settings.Bounce.Trap, levels.Foot, topSpeed)) {
      problems.push(
        `TrapMaxResidual ${f2(settings.Bounce.Trap.MaxResidual)} m/s is over the sprint ${f2(topSpeed)} x (1 - foot speed factor ${f2(levels.Foot.SpeedFactor)}) - ${f2(CarryLevelCheck.TrapMargin)}, so an untimed trap can send the ball faster than the body can follow it and lose it (S24).`,
      );
    }

    if (!CarryLevelCheck.reachIsAForwardArc(settings.Bounce.BehindReach, levels.Foot.HoldOffset)) {
      problems.push(
        `BehindReach ${f2(settings.Bounce.BehindReach)} m is not between 0 and the foot HoldOffset ${f2(levels.Foot.HoldOffset)} m, so reach is not a forward arc: either a ball at the feet cannot be played, or one behind can (S13).`,
      );
    }

    shoulderProblems(problems, settings, body);

    if (!CarryLevelCheck.kneeSpotSitsBetweenTheLineAndTheHip(body)) {
      problems.push(
        `ThighSpot ${f2(body.ThighSpot)} m is not between SideDeadband ${f2(body.SideDeadband)} m and the hip's ${f2(Math.abs(body.Thigh.Lateral))} m, so the knee-to-knee ball either lands on neither side, where the knees meet in the middle, or outside the hip, where each knee reaches out for it (S29). Zero turns it off.`,
      );
    }

    passProblems(problems, settings);

    return problems;
  },
};

function passProblems(problems: string[], settings: BallSettings): void {
  const parts = settings.Launch.Parts;

  if (!CarryLevelCheck.noPartOutpassesTheFoot(parts)) {
    problems.push("a pass part's PowerScale is above the foot's, so something out-passes the instep (S28).");
  } else if (!CarryLevelCheck.passOrderHolds(parts)) {
    problems.push('the pass PowerScales are out of order: foot >= head >= thigh >= backheel >= chest >= shoulder (S28).');
  }

  if (!CarryLevelCheck.onlyAFootPassReachesCatchSpeed(settings.Launch, settings.Reception.CatchSpeed)) {
    problems.push(
      `CatchSpeed ${f1(settings.Reception.CatchSpeed)} m/s is not between the foot's full pass and every other part's, so either nothing can over-hit a receiver or a softer part can (S28).`,
    );
  }

  for (const part of PASS_PARTS_BY_POWER) {
    const profile = profileFor(parts, part);
    if (profile.LoftMinDegrees > profile.LoftMaxDegrees) {
      const p = passPartName(part);
      problems.push(
        `${p} loft window ${f0(profile.LoftMinDegrees)}° to ${f0(profile.LoftMaxDegrees)}° is empty, so every ${p} pass fires at its minimum.`,
      );
    }
  }

  // Gravity at a scale of one: the rule is about the table, as in C#.
  if (!CarryLevelCheck.everyPassLeaves(settings.Launch, settings.Possession.Radius, 9.81 * settings.Body.GravityScale)) {
    problems.push(
      `some part's best pass does not clear PossessionRadius ${f2(settings.Possession.Radius)} m, so it lands back at the passer's feet (S28).`,
    );
  }
}

/** The four ways the shoulders can be wired so they never work (S27). */
function shoulderProblems(problems: string[], settings: BallSettings, body: BodyModel): void {
  const shoulder = settings.Bounce.Shoulder;
  const chest = settings.Bounce.Levels.Chest;

  if (!CarryLevelCheck.shouldersSitAboveTheChest(shoulder, chest)) {
    problems.push(
      `ShoulderTouchHeight ${f2(shoulder.TouchHeight)} m is not above ChestTouchHeight ${f2(chest.TouchHeight)} m, so a falling ball meets the sternum first and no ball is ever shouldered (S27).`,
    );
  }

  if (!CarryLevelCheck.shoulderApexClearsTheShoulder(shoulder, chest)) {
    problems.push(
      `ChestApex ${f2(chest.Apex)} m does not clear ShoulderTouchHeight ${f2(shoulder.TouchHeight)} m by PopMargin ${f2(POP_MARGIN)} m, so a shouldered ball hovers instead of coming back down to the shoulder (S27).`,
    );
  }

  if (!CarryLevelCheck.shoulderIsInTheChestBand(shoulder, settings.Bands)) {
    const n = ballVerbName(verbFor(settings.Bands, shoulder.TouchHeight));
    problems.push(
      `ShoulderTouchHeight ${f2(shoulder.TouchHeight)} m is in the ${n} band, not the Chest band the shoulders belong to, so a pass off the shoulder fires as a ${n} ball (S27).`,
    );
  }

  if (!CarryLevelCheck.shoulderKeepsItsOwnBall(body)) {
    problems.push(
      `the shoulder sits ${f2(Math.abs(body.Shoulder.Lateral))} m off the centreline, inside ShoulderLine ${f2(body.ShoulderLine)} m, so a shouldered ball comes back to the chest: the shoulders play one touch each and are never seen again (S27).`,
    );
  }
}

# LopFBStreet — Implementation Plan

Built on [`GDD.md`](GDD.md) and [`STREET.md`](STREET.md). Read those first;
this document does not restate the design, only how to build it and in what
order. Owned by the `game-designer` agent; the code details are
`gameplay-engineer`'s and `web-engineer`'s. Live task state is in
[`PROGRESS.md`](PROGRESS.md). The layer contract is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

**Stack:** TypeScript (strict), npm workspaces, Vite, three.js (pinned),
Vitest, Playwright. No physics engine: the ball has its own integrator.

**Where this came from.** `../LopFBBounce`, tag `godot-final`, is the
reference. It was Godot 4.7.2 + C# + Jolt. Its `domain/` (53 files, 8,803
lines, ~830 test cases) is engine-free and runs at a fixed 120 Hz, so it ports.
The approved plan is `~/.claude/plans/yes-i-really-liked-iterative-bentley.md`.

**S-numbers.** S1–S35 in the GDD, FOOTBALL.md, TUNING_LOG.md and this file
refer to the specs in `../LopFBBounce/docs/IMPLEMENTATION.md` at `godot-final`.
They are the design record of the touch and they stay there. This file does not
renumber or copy them. A new spec written here starts at **S36**.

---

## Phases

Each phase has a gate: its finish line. **Do not start the next phase until
the current gate passes.** The developer judges every gate except W1's, which
is mechanical.

Tasks are tagged:

- **[CODE]**: Claude writes it and can verify it (`npm test`, `npm run
  typecheck`, `npm run build`, `npm run e2e`).
- **[DEV]**: needs the developer: an account, a click, or playing it and
  saying what they saw. Every gate is `[DEV]` except W1's.

| Phase | Goal | Gate judged by |
|---|---|---|
| W0 | Setup: a loop you trust | Developer |
| W1 | The touch, ported (domain only) | `npm test` |
| W2 | Ball, player and camera on screen | Developer, side by side with `godot-final` |
| W3 | The body plays the ball | Developer, side by side with `godot-final` |
| P1–P5 | The street game | Developer, STREET.md §7 |

---

## Porting method

**The C# tests are the oracle.** When the TS port and a golden file disagree,
the port is wrong until proven otherwise.

1. **One C# file to one TS file, in dependency order.** The C# test file is
   translated to Vitest beside it, test by test, with the same football
   sentence as its name. Keep the C# type and field names (`BounceSolver`,
   `HoldOffset`), so TUNING_LOG and the GDD still read true and a grep finds
   the same word in both repos.
2. **Golden vectors for pure functions.** `tools/GoldenDump` in the old repo
   calls the C# function on a set of inputs and writes the input and output
   pairs to `tools/golden/vectors/<Area>/<File>.json` (for example
   `vectors/Ball/Ballistics.json`). The TS test reads the file and compares.
3. **Step logs for stateful solvers.** `BounceSolver`, `PossessionArbiter`,
   `StallBalance`, `LoadFollower` and `StrideClock` carry state across ticks.
   GoldenDump runs a scripted input sequence at 120 Hz and records the input
   and the output every tick to `tools/golden/steps/<Solver>/<sequence>.json`.
   The TS test replays it two ways:
   - **Per tick, re-fed:** each tick starts from the C# state recorded for that
     tick, so float-versus-double drift cannot compound. This is the parity
     check.
   - **Free run:** the whole sequence from the first tick, compared on the
     outcome the sequence was written to show (a touch fired, a level held, an
     owner changed), not tick by tick.
4. **Tolerances.** The default is `1e-4` absolute on positions, velocities and
   times. A wider tolerance is written next to the case with the reason. **A
   test that only passes after loosening its tolerance is a failing test.**
5. **Numbers.**
   - C# is single-precision `float`; JS is double. Where a value lands exactly
     on a threshold (`BoundaryMargin`, `LevelForHeight`'s `>=`), wrap both
     sides in `Math.fround` so the comparison is made at the precision C# made
     it.
   - `MathF.Round` rounds half to even (`TrajectorySampler`'s tick indexing).
     Use `roundHalfEven` from `packages/domain`, never `Math.round`, which
     rounds half up.
   - `readonly record struct` + `with` becomes a readonly object type + spread.
   - `Span<Vector3>` becomes a preallocated array. Nothing allocates per tick
     inside the fixed step.
   - `double` clocks (`BallHistory`, the arbiter) are plain numbers.
   - Forward is −Z and Y is up, in both. No axis flips.
6. **Tuning is never retyped.** Every shipped value comes from
   `tools/golden/tuning/*.json`. A default typed into TS a second time is a
   second opinion, and it will drift: the C# `Support/CarrySim.cs` already had
   (Shoulder 1.17/0.14/0.26 against the motor's 1.14/0.15, and no
   `ThighSpot`). The one exception is a value that was already a domain static
   in C# (`CameraModes`), which is ported once with its file.
7. **`tools/golden/` is never edited by hand.** If a golden file is wrong,
   GoldenDump is fixed in the old repo and re-run.

## Not ported

| What | Why |
|---|---|
| `domain/Level/*` (`Cloth`, `SweepMotion`, `RunProgress`, `CourseHeights`, `CourseHeightsCheck`, `CourseSettings`, `CheckpointHints`, `SheetSway`) | Laundry Lane is parked. It stays in the old repo |
| `tests/.../Level/*`, `Ball/SweeperPushTests.cs`, `Ball/DeflectionTests.cs`'s cloth cases | They test the course, not the touch |
| `domain/Audio/VolumeCurve.cs` | No audio yet |
| `game/scripts/Body/PoweredRagdoll.cs` | Physical bones need a physics engine; `ReactionSprings` is the reaction layer here |
| `.tscn` / `.tres` scenes, `SceneContract`, `VerifyM1`, `game/tools/*.gd`, `GODOT_SETUP.md`, `SCENE_SPECS.md` | Scenes are code now; the Playwright smoke test replaces the contract |
| `LEVEL.md`, `DRESSING.md`, `LATER.md` | Stay in the old repo. Read them there when a phase needs them |

---

## W0 — Setup

Nothing playable. The goal is a loop you trust.

| Id | Tag | Task | Done when |
|---|---|---|---|
| W0.1 | [CODE] | `CLAUDE.md`, the copied docs (GDD, FOOTBALL, STREET, TUNING_LOG) and the new ones (ARCHITECTURE, IMPLEMENTATION, PROGRESS) | All present; STREET §8 rewritten for the web |
| W0.2 | [CODE] | `.claude/` adapted: agents, the `domain-rule` skill, commands, `check-skills.sh`, `statusline.sh`, `settings.json` | `bash .claude/check-skills.sh` runs; the status line shows W0 |
| W0.3 | [CODE] | npm workspace: root `package.json`, `tsconfig.base.json`, `packages/domain`, `packages/game` | `npm install` clean; `npm run typecheck` green |
| W0.4 | [CODE] | Vitest at the root over every package | `npm test` green |
| W0.5 | [CODE] | The architecture test, `packages/domain/test/architecture.test.ts` | It fails when a domain file imports `three`, a `node:` module, or touches a DOM global; green on the tree |
| W0.6 | [CODE] | The fixed 120 Hz step (`FixedStep`) and the domain vec module, with tests | `npm test` green |
| W0.7 | [CODE] | Vite app in `packages/game`: renderer, a greybox street (ground, walls, a goal frame) built in code, the game loop driving `FixedStep` | `npm run dev` shows the scene |
| W0.8 | [CODE] | `mannequin.glb` loaded at **0.79** scale, facing +Z, playing `Idle_Loop` | Visible in the dev build; the crown stands at ~1.45 m (1.83 m × 0.79), matching `CrownHeight` |
| W0.9 | [CODE] | Tuning: `tools/golden/tuning/*.json` copied from GoldenDump, copied from GoldenDump. The loaders and their key check are W1.1, with the settings types | The four files are in `tools/golden/tuning/` |
| W0.10 | [CODE] | Playwright smoke test in `e2e/`: production build boots, no console errors, the named objects exist (`Street`, `Goal`, `Player`) | `npm run e2e` green |
| W0.11 | [DEV] | GitHub remote for the new repo | `git push` works |
| W0.12 | [CODE] | CI on push: typecheck, test, build, e2e | Workflow green on GitHub |
| W0.13 | [DEV] | Deploy preview on GitHub Pages (`.github/workflows/pages.yml`); the developer sets Settings > Pages > Source to GitHub Actions | A pushed commit gets a preview URL |
| W0.14 | [DEV] | **Gate:** edit a `.ts` file with `npm run dev` running and see the change | The developer reports it |

**Gate:** *"I edit a .ts file, the browser reloads with the change, and `npm
test` is green in CI."*

---

## W1 — The touch, ported (domain only, no rendering)

All `[CODE]`. Every C# path below is under `../LopFBBounce/` at
`godot-final`; tests are under `tests/LopFBBounce.Domain.Tests/`. Each task is
done when its TS file exists in `packages/domain/src/...`, its tests are
translated beside it in `packages/domain/test/...`, its golden vectors (where
listed) pass at the default tolerance, and `npm test` is green.

### W1.1 Basics

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.1a | `domain/MathUtil.cs`, plus `roundHalfEven` | `MathUtilTests.cs` | vectors |
| W1.1b | `domain/Ball/Limb.cs`, `domain/Ball/BallVerb.cs` | covered by `Tuning/VerbBandsTests.cs` and later files | — |
| W1.1c | `domain/Ball/Ballistics.cs` | `Ball/BallisticsTests.cs` | vectors |
| W1.1d | `domain/Tuning/BallSettings.cs` + the `ball.json` loader | `Tuning/VerbBandsTests.cs` | `tuning/ball.json` round-trips |
| W1.1e | `domain/Tuning/CarryLevelCheck.cs` | `Tuning/CarryLevelCheckTests.cs` | — (passes against the shipped `ball.json`) |

### W1.2 Flight

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.2a | `domain/Ball/TrajectorySampler.cs` | `Ball/TrajectorySamplerTests.cs` | vectors (watch the half-even tick index) |
| W1.2b | `domain/Ball/LandingPredictor.cs` | `Ball/LandingPredictorTests.cs` | vectors |
| W1.2c | `domain/Ball/BallHistory.cs` | `Ball/BallHistoryTests.cs` | — |
| W1.2d | `domain/Ball/BallState.cs`, `domain/Ball/BallStateMachine.cs` | `Ball/BallStateMachineTests.cs` | — |

### W1.3 Launch

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.3a | `domain/Tuning/PassProfiles.cs` | `Ball/PassProfileTests.cs` | vectors |
| W1.3b | `domain/Ball/LaunchSolver.cs` | `Ball/LaunchSolverTests.cs` | vectors |

### W1.4 Ownership

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.4a | `domain/Ball/PossessionArbiter.cs` | `Ball/PossessionArbiterTests.cs` | step log |

### W1.5 Body model

`BounceSolver` and `ContactPlanner` read these, so they come before the touch.

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.5a | `domain/Tuning/BodyModel.cs` + the `player.json` loader (degrees to radians where `PlayerMotor` converted) | via `Ball/ContactPlannerTests.cs` later | `tuning/player.json` round-trips, `HipLateral` override applied |
| W1.5b | `domain/Body/StrideClock.cs` | `Body/StrideClockTests.cs` | step log |
| W1.5c | `domain/Body/ContactProfile.cs` | covered by `Body/ChainTests.cs`, `Body/PartStrikeTests.cs` in W3 | vectors |

### W1.6 Touch parts

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.6a | `domain/Ball/ContactPlan.cs` | via `Ball/ContactPlannerTests.cs` | — |
| W1.6b | `domain/Ball/Torso.cs`, `domain/Ball/ContactSpot.cs` | `Ball/ShoulderTests.cs` (the Torso/ContactSpot cases) | vectors |
| W1.6c | `domain/Ball/StallBalance.cs` | via `BounceSolverTests.cs` stall cases | step log |
| W1.6d | `domain/Ball/ReceptionSolver.cs` | `Ball/ReceptionTests.cs`, `Ball/HotBallTests.cs` (the solver cases) | vectors |
| W1.6e | `domain/Ball/ContactPlanner.cs` | `Ball/ContactPlannerTests.cs` | vectors |

### W1.7 Player

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.7a | `domain/Player/FollowRule.cs` | `Player/FollowRuleTests.cs` | vectors |
| W1.7b | `domain/Player/Locomotion.cs` | via `CarrySim` | vectors |
| W1.7c | `domain/Player/CarrySpeed.cs` | `Player/CarrySpeedTests.cs` | — |

### W1.8 The touch

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.8a | `domain/Ball/BounceSolver.cs` (1,355 lines). Port in sections, in the file's own order; keep `DeflectedSoftly` in the input even though cloth is not ported | `Ball/BounceSolverTests.cs` (97), `Ball/InstepTests.cs`, `Ball/ShoulderTests.cs` (rest) | step logs: standing keep-ups per level, jog and sprint carry, commanded bounce, drop, pass on the next touch, a reception |

### W1.9 The long runs

| Id | C# source | C# tests | Golden |
|---|---|---|---|
| W1.9a | `tests/.../Support/CarrySim.cs` → `packages/domain/test/support/carrySim.ts`. Loads `player.json`, not CarrySim's drifted copy. The cloth path is dropped | — | — |
| W1.9b | the threshold tests on top of it | `Ball/CarryFollowTests.cs`, `Ball/KneeCrossTests.cs`, `Ball/ReceptionTests.cs` (sim cases), `Ball/HotBallTests.cs` (sim cases), `Ball/DeflectionTests.cs` (non-cloth cases) | — |

A long-run test asserts a threshold, so it ports directly. If one fails only
because CarrySim's old tuning copy differed from `player.json`, record the
case and the two values in PROGRESS; do not change the threshold.

**Gate (Claude-checkable):** every ported test is green, and every recorded
step log replays within tolerance, per tick and free-running.

---

## W2 — Ball, player and camera on screen

The first thing the developer plays. Adapters in `packages/game`, the rules
they need in `packages/domain`.

| Id | Tag | Task | C# reference | Done when |
|---|---|---|---|---|
| W2.1 | [CODE] | Camera rules: `CameraBias`, `CameraBlend`, `CameraFraming`, `CameraMode`, `CameraModes` → `packages/domain/src/camera/` | `domain/Camera/*`, `tests/.../Camera/*` | Tests green |
| W2.2 | [CODE] | Ball integrator: gravity, then `v *= max(1 - LinearDamp·dt, 0)`, then position (`TrajectorySampler.Step`'s order); ground, wall boxes, goal-post cylinders with `Bounce` and `Friction` from `ball.json` | `domain/Ball/TrajectorySampler.cs`, `game/scripts/Ball/BallController.cs` | A test: a free flight lands where `LandingPredictor` said, within tolerance |
| W2.3 | [CODE] | Ball adapter: reads the owner, calls `BounceSolver`, applies the result inside the step; possession and the touch cooldown | `game/scripts/Ball/BallController.cs`, `BounceController.cs`, `PossessionController.cs` | The ball's position and velocity are written in the integrator and nowhere else (grep proves it) |
| W2.4 | [CODE] | Player motor: `Locomotion`, `FollowRule`, jump, the level slowdown; tuning from `player.json` | `game/scripts/Player/PlayerMotor.cs` | Walks, sprints, jumps on the greybox |
| W2.5 | [CODE] | Input with the same actions as `game/project.godot`'s `[input]`, mouse look, both buttons, charge | `game/scripts/Input/InputActions.cs`, `game/scripts/Player/LaunchInput.cs` | Every Godot action has a binding |
| W2.6 | [CODE] | Camera rig over the `CameraModes` rules | `game/scripts/Camera/BallTrackingCamera.cs` | Modes switch and blend |
| W2.7 | [CODE] | Arc preview and landing markers | `game/scripts/Player/PassPreview.cs`, `game/scripts/Ball/BallMarkers.cs` | The preview is drawn from `TrajectorySampler`, the same steps as the integrator |
| W2.8 | [CODE] | F1 capsule + the contact marker: the plan made visible, coloured by limb, red when unreachable | `game/scripts/Debug/ContactMarker.cs`, `CarryLevelGizmo.cs` | F1 toggles; the marker moves with the plan |
| W2.9 | [CODE] | Debug HUD: level, speed, owner, fps, draw calls | `game/scripts/UI/DebugHud.cs` | Visible; numbers formatted with `toFixed` |
| W2.10 | [CODE] | lil-gui tuning panel over the live settings, grouped as Godot grouped them (`Ball` → Touch, Carry Levels, Bounce, Stall, Launch, Possession, Reception, Verb Bands; `Player` → Body, Strike, Stride, Pose, Reaction, Follow; `Animator`) | `game/scripts/Tuning/BallTuning.cs`, `PlayerMotor.cs` export groups | An edit takes effect on the next tick, no reload |
| W2.11 | [CODE] | Smoke test extended: `Ball`, `Player`, the HUD | — | `npm run e2e` green |
| W2.12 | [DEV] | Play it on the preview URL, side by side with the `godot-final` build, and report | — | Reported in PROGRESS, verbatim |

**Gate:** the M0 sentence, judged again on the web: *"Juggling on the street
for 60 s is fun, and it feels like the Godot build."* Judged side by side with
the `godot-final` build. The capsule (F1) is the diagnostic for any complaint.

---

## W3 — The body plays the ball

The mannequin replaces the capsule. Every touch is played by the limb the plan
named.

### W3 domain: the body rules

All `[CODE]`, each with its tests translated, into `packages/domain/src/body/`.

| Id | C# source (`domain/Body/`) | C# tests (`Body/`) |
|---|---|---|
| W3.1 | `StrikePath.cs` | `StrikePathTests.cs` |
| W3.2 | `PassSwing.cs`, `ContactEvent.cs` | `PassSwingTests.cs` |
| W3.3 | `SwingRelease.cs` | `HandoverTests.cs` |
| W3.4 | `PassLoad.cs` (incl. `LoadFollower`, step log) | `PassLoadTests.cs` |
| W3.5 | `PartPoses.cs` (`ChestPose`, `ThighPose`) | `PoseTests.cs`, `ChestMeetTests.cs` |
| W3.6 | `PartStrikes.cs` | `PartStrikeTests.cs`, `BackheelTests.cs` |
| W3.7 | `ArmPose.cs` | `ArmPoseTests.cs` |
| W3.8 | `LimbDirection.cs` | `ChainTests.cs` |
| W3.9 | `PoseTiming.cs` | `PoseTests.cs` (timing cases) |
| W3.10 | `EasedSwitch.cs` | `BackheelTests.cs` (switch cases) |
| W3.11 | `ReactionShares.cs` | `ReactionTests.cs` |

### W3 game: the body drivers

Into `packages/game/src/body/`, in Godot's order. C# paths under
`../LopFBBounce/game/scripts/`.

| Id | Tag | Task | C# reference | Done when |
|---|---|---|---|---|
| W3.12 | [CODE] | Locomotion clips: `Idle_Loop` / `Walk_Loop` / `Jog_Fwd_Loop` / `Sprint_Loop` on an `AnimationMixer`, **seeked to the stride phase**, with the same thresholds and toe-off offsets | `Player/PlayerAnimator.cs`, `animator.json` | The feet land on the stride clock's beats |
| W3.13 | [CODE] | `TwoBoneIk`, `BonePose`, `BoneNames` (rig names `thigh_l`, `calf_l`, …) | `Body/TwoBoneIk.cs`, `Body/BonePose.cs`, `Body/BoneNames.cs` | `TwoBoneIk` has Vitest cases (it is maths): reach, out-of-reach clamp, pole |
| W3.14 | [CODE] | Rig check: `BodyModel`'s rest-pose numbers against the loaded skeleton at boot | `Debug/RigMetrics.cs` | A mismatch is a named console error the smoke test catches |
| W3.15 | [CODE] | `LegDriver`: the strike path and leg IK for the feet | `Body/LegDriver.cs` | IK targets clamped to the planned reach |
| W3.16 | [CODE] | `ThighDriver` | `Body/ThighDriver.cs` | — |
| W3.17 | [CODE] | `UpperBodyDriver`: chest and head | `Body/UpperBodyDriver.cs` | — |
| W3.18 | [CODE] | `ArmDriver` | `Body/ArmDriver.cs` | — |
| W3.19 | [CODE] | The driver order and wiring: Leg → Thigh → UpperBody → Arm, after the mixer, every frame | `Body/BodyDrivers.cs` | Nothing in `body/` writes the ball or is read by it (grep proves it) |
| W3.20 | [CODE] | `ReactionSprings`, the spring reaction layer, **wired into the character**. Godot's `character.tscn` never placed it, so this is the first build where the body reacts | `Body/ReactionSprings.cs` | The body visibly gives on a touch |
| W3.21 | [CODE] | Perf check: 6 mannequins on screen, fps and draw calls in the HUD | — | Numbers recorded in PROGRESS |
| W3.22 | [DEV] | Play it, side by side with `godot-final`, F1 for the capsule run | — | Reported in PROGRESS, verbatim |

**Gate:** *"Every touch is visibly played by the right body part, and a ball
out of reach is a visible miss, never a stretch."*

---

## P1–P5 — The street game

Written fresh in `packages/domain/src/street/`, test-first. The design, the
parameters and every gate sentence are in [`STREET.md`](STREET.md); this file
only orders the work. Each phase gets a task table here when it opens, not
before.

| Phase | Builds | Spec | Gate |
|---|---|---|---|
| **P1 Offline striker** | `ShotSolver`, `Goal` (frame, line crossed over two `BallHistory` samples), the strike window, the "release now" arc. The volley swing reuses `LegDriver` / `StrikePath` | STREET §5, §2.1 | STREET §7, P1 |
| **P2 Offline keeper** | `KeeperPlanner`, both dives, catch or parry, the `Held` clock, throw and punt. Hand IK is a new `Hands` `LimbReach` on the same `TwoBoneIk` | STREET §6 | STREET §7, P2 |
| **P3 Rules and bots** | `StreetRules` + presets as data, Heads & Volleys first. Local play with bots | STREET §2, §3 | STREET §7, P3 |
| **P4 Online, 2 players** | `packages/server`: Node runs `packages/domain` as the authority. Room codes, touch events, sparse snapshots, keeper handoff, `BallHistory` rewind. The transport is chosen here. Lag tested at 50 / 100 / 150 ms | STREET §8 | STREET §7, P4 |
| **P5 Online, up to 6** | The knockout flow, spectating, the other presets | STREET §3, §7 | STREET §7, P5 |

**Nothing is networked before P4.**

---

## Effort

An estimate for a solo developer with Claude, from the plan.

| Phase | Time |
|---|---|
| W0 | 2–3 days |
| W1 | 1.5–3 weeks (`BounceSolver` is most of it) |
| W2 | 1 week + feel passes |
| W3 | 1.5–2 weeks |
| P1–P3 | 4–6 weeks |
| P4–P5 | 4–6 weeks |

---

## Verification

**Continuously:**

```bash
npm test             # Vitest: ported tests, golden vectors, step logs
npm run typecheck
```

This is the part of the game Claude can verify without a human.

**Per build:** `npm run build` then `npm run e2e`. The page boots, there are no
console errors, and the named scene objects exist (`Player`, `Ball`, and from
P1 `Goal`, from P2 `Keeper`). A green smoke test is not a human looking.

**Per phase:** the gate, judged by the developer on the deployed preview URL.
W2 and W3 are judged side by side with the `godot-final` build. `/gate-check`
evaluates one honestly and never infers a pass from green tests.

**Performance:** fps and draw calls in the HUD with 6 mannequins on screen, on
the developer's machine and one mid-range laptop.

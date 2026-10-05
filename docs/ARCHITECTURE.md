# Architecture

The `domain` ↔ `game` contract. Owned by the `gameplay-engineer` agent; the
rendering side is `web-engineer`'s.

This repo is the concept test (IMPLEMENTATION.md § *What this repo is for*).
The code here is thrown away when the Godot build starts; the street rules'
design is not. The layers below are kept for the reasons they were kept in
Godot (every rule testable in milliseconds, one place the ball is written), and
street rules are written so they port to C# (§ *Portability to C#*).

---

## Packages

| | | |
|---|---|---|
| `packages/domain` | `@lopfb/domain` | Pure TypeScript. Every rule, every number, every solver: the Godot touch (ported), the ball's flight, the shot, the goal, the keeper, the street rules, the bots' decisions. **Never imports three, the DOM or Node.** |
| `packages/game` | `@lopfb/game` | The Vite app. Thin three.js adapters: render, input, camera, the collision shapes handed to the integrator, the body (clips and simple procedural bone turns), the HUD, the tuning panel. |
| `packages/server` | `@lopfb/server` | IMPLEMENTATION C3 (STREET.md §8). A Node process that runs `@lopfb/domain` as the authority. Not created yet. |

`game` and `server` import `domain`. Nothing imports `game`. `domain` imports
nothing but itself and the JSON under `tools/golden/tuning/`.

Tests live in `packages/<name>/test/`, mirroring `src/`, and the root
`vitest.config.ts` runs them all with `npm test`.

---

## Rule 1 — `domain` never imports three, the DOM or Node

Enforced twice:

- **The compiler.** `packages/domain/tsconfig.json` sets `lib: ["ES2022"]` and
  `types: []`. A `document`, a `window` or a `process` is a type error before it
  is a test failure.
- **`packages/domain/test/architecture.test.ts`.** It reads every file under
  `packages/domain/src` and fails on an import of `three`, of `@lopfb/game`, of
  any `node:` module or Node built-in, and on any use of a DOM or timing global
  (`window`, `document`, `performance`, `requestAnimationFrame`). It also fails
  on `Math.random` and `Date.now`: a rule has no randomness and no clock of its
  own, and the C3 server depends on two runs of the same inputs giving the same
  outputs.

Every rule is testable in milliseconds, and from C3 the server runs the exact
code the client runs.

### The conversion boundary

The domain's vectors are plain readonly values (`Vec3` in
`packages/domain/src/vec.ts`). `THREE.Vector3` lives in `game`. They meet in
exactly one file: **`packages/game/src/bridge/vec.ts`**, the twin of the Godot
build's `Vec.cs`.

- **Convert at the call site, inside the adapter.** Not in a helper three
  layers up.
- **Never hand a three type to a domain function**, and never keep a domain
  vector as long-lived scene state; read it, convert it, use it.
- Y is up and forward is −Z in both. There is no axis flip anywhere. The
  mannequin faces +Z, so the character's root turns 180° at load: engine
  vocabulary, in `game`.

---

## Rule 2 — the ball is written in one place

```
requestAnimationFrame(now)
    │  elapsed real time
    ▼
FixedStep.advance(elapsed)  →  n steps of 1/120 s          (packages/domain/src/fixedStep.ts)
    │
    │  for each step:
    │    LaunchInput: the button holds → queued requests          (game/src/player/launchInput.ts)
    │    PlayerMotor: Locomotion, FollowRule, CarrySpeed            (game/src/player/playerMotor.ts)
    │    BallController.physicsProcess: PossessionArbiter, the state rule, hot balls
    │    BallController.integrate: BounceSolver → a velocity;
    │        BallBody.step: gravity, damp, position, contacts         ← the ONLY write
    │    PassPreview: TrajectorySampler over the queued pass
    ▼
render: draw ball and bodies, interpolated by FixedStep.alpha
```

- **Fixed 120 Hz, as the Godot build.** The shipped numbers in
  `tools/golden/tuning/` were tuned at that step, and the C3 server runs the
  same step. A frame that stalls runs at most `maxSteps` and drops the rest.
- **The integrator** uses the Godot order (`TrajectorySampler.Step`): gravity,
  then `v *= max(1 - LinearDamp·dt, 0)`, then position. Ground, wall boxes and
  goal-post cylinders use `Bounce` and `Friction` from `ball.json`. The arc
  preview runs the same steps, so it cannot disagree with the flight.
- **The solver returns; the integrator writes.** Anything else that wants to
  change the ball (a touch, a shot, a deflection, a keeper's catch) queues a
  request and waits for the next step. Nothing writes the ball's position or
  velocity from a render frame, an event handler or the body.
- The integrator (`ball/ballBody.ts`) is a rule and lives in `domain` with
  tests: a solid sphere against a flat ground, boxes and capsules, with the
  ball's own `Bounce` and `Friction`, and friction turning slip into spin. It
  is the web's stand-in for Jolt. The street's colliders are plain data in
  `street/pitch.ts`, which the scene also draws from, so what is drawn is what
  the ball hits.
- The order inside a step is Godot's: every node's `_PhysicsProcess` (the
  buttons, the motor, the ball's bookkeeping), then the physics step that calls
  the ball's `_IntegrateForces` (the solver, then the integrator).

From C3 the same step runs on the server. **The domain sim is the truth for
every ball**, client and server; the three.js mesh only displays it.

---

## Rule 3 — a rule with a number in it belongs in `domain`

*Could this be wrong in a way a test would catch?* Then it is a rule.

**In `domain`:** the touch (`BounceSolver`, `ContactPlanner`, `StallBalance`,
`ReceptionSolver`, `LaunchSolver`, `PossessionArbiter`), the follow and the
carry speed, the camera modes and their blend, bias and framing, the touch
poses' timing and angles, the ball integrator, the street's colliders, and
later the goal line, the shot, the keeper, the street rules and the bots.

**In `game`:** camera basis maths, mesh and material construction, input
polling, scene lookups, the animation mixer and blend weights, bone lookups,
the 0.79 import scale and the 180° turn.

When a file under `game` multiplies by a tuning value or by a literal that
decides what a player sees the ball *do*, that arithmetic is in the wrong
package. The size of a procedural bone turn is the gray zone: if a playtester
could complain about it, it is a named setting.

---

## Rule 4 — the body shows the touch; nothing in the body writes it

The body here is a stand-in (IMPLEMENTATION § *Stand-ins*): the mannequin's
locomotion clips blended by speed, with one procedural bone turn on top for
the part that plays the touch (`body/touchPose.ts`). The contact plan is
Godot's, ported; the IK that met it there is not.

- **The domain decides; the body shows it.** `ContactPlanner` decides the limb
  and the moment; `game` turns the bones to show it, in the render frame, after
  the fixed steps.
- **A bone is never a solver input.** Reaches and heights enter the domain as
  numbers from `player.json`, never from the live skeleton.
- **Nothing in the body writes the ball or gates a state.** A ball the touch
  calls out of reach is a miss, and the body is seen to miss it.

---

## Tuning

**One source for shipped values:** `tools/golden/tuning/*.json`, written by
`../LopFBBounce/tools/GoldenDump` at `godot-final`. Never edited by hand, and no
value in them is typed into TS a second time. `ball.json` is read whole (it
*is* the ported touch's settings); `player.json` for the motor, the body's
reaches, the stride, the follow and the touch poses; `animator.json` for the
clip thresholds. The strike, pass-load and reaction numbers describe Godot's
IK body and are unused here. `CarryLevelCheck` runs over the shipped files in
a test.

| File | Shape | What it is |
|---|---|---|
| `ball.json` | The C# `BallSettings` record serialised, PascalCase keys, nested by record (`Body`, `Possession`, `Bounce`, …) | The ball's rules |
| `player.json` | `{ source, values, sceneOverrides, notParsed }`: a flat map of `PlayerMotor.cs`'s `[Export]` defaults, plus `player.tscn`'s overrides on the Player node (`HipLateral`) | The body's numbers: Body, Strike, Stride, Pose, Pass Load, Reaction, Follow |
| `camera.json` | Same shape, from `CameraTuning.cs` | Most values are in `notParsed` because they defaulted to `CameraModes` statics in C#; a camera value the web needs is a named setting here |
| `animator.json` | Same shape, from `PlayerAnimator.cs` | The clip swing fractions and locomotion thresholds |

- **Field names stay as in C#** (`TouchHeight`, `LinearDamp`). The JSON loads
  without a rename table, and a name in TUNING_LOG greps to the same word in TS.
- **The flat maps are applied as in Godot:** `values`, then `sceneOverrides`
  on top.
- **Angles.** `player.json` angles are in **degrees** (the keys end in
  `Degrees`). `PlayerMotor` converted them with `Mathf.DegToRad` when it built
  its records, so the web loader converts them to radians the same way. A
  `ball.json` field ending in `Degrees` (`LoftMinDegrees`) is degrees in the C#
  record too, and stays degrees until the code that uses it converts.
- **Loaders are strict.** A missing key the code reads throws, by name. A
  silently defaulted value is how a copy drifts from the shipped one.
- **New values** (a goal size, a keeper reach, a rule's points) have no Godot
  twin. They are named settings under `packages/domain/src/street/`, with their
  starting values in one place, cited from STREET.md.
- **The live panel (lil-gui)** edits a mutable copy of the loaded settings in
  `game`. The fixed step reads the settings every tick, never caches them, so
  an edit lands on the next tick. The panel can export its overrides as JSON
  for TUNING_LOG; it never writes `tools/golden/`.

---

## Portability to C#

The street rules are this repo's product: when the Godot build starts, it takes
them over (IMPLEMENTATION § *What goes back to Godot*). For code under
`packages/domain/src/street/` that means:

- **Plain data in, plain data out.** Inputs and outputs are readonly records of
  numbers, booleans, strings and `Vec3`. No closures kept as state, no
  callbacks into `game`, no TypeScript-only tricks (clever union types,
  prototype games, `any`). A rule is written so it becomes a C# `readonly
  record struct` and a static method without being restructured.
- **State is explicit.** A stateful rule (`StreetRules`, the keeper's hold
  clock) takes its state in and returns the next one, so its steps can be
  dumped and replayed when the C# version is checked against it.
- **Names are STREET.md's.** Types, settings and constants are spelled exactly
  as STREET.md has them (`ShotSolver`, `StreetRules`, `KeeperPlanner`,
  `GoalWidth`), so a grep finds the same word in the spec, the TS and the
  future C#. A name the code needs and STREET.md lacks goes into STREET.md
  first.
- **Tests are football sentences**, as the C# tests are, so they translate to
  xUnit names one for one.
- **The spec is in the docs the same day.** Every street rule is described in
  STREET.md (or an S36+ spec) in engine-neutral words: what it decides, its
  parameters by name, the football behind it. Code and doc never disagree.
- **No culture-dependent formatting or parsing**, in TS or in what it writes:
  the C# side runs on the same Turkish Windows.

The ported touch already is C#: each TS file under `ball/`, `tuning/`,
`player/`, `camera/` and `body/strideClock.ts` is the twin of the C# file of
the same name at `godot-final`, with the same field names (PascalCase on
records, as the JSON has them), the same method names in camelCase, and the
same test names. A change to it is a change to both builds, made in the spec
first.

---

## Conventions

- TypeScript `strict`, `noUncheckedIndexedAccess`, ES modules, no default
  exports.
- **Keep per-tick allocation small.** The ported solvers use immutable `Vec3`
  values, as `System.Numerics.Vector3` is a value type, so they allocate a few
  small objects per step: kept, because the port stays line for line with the
  C#. The integrator, the arc buffer and the HUD do not allocate per tick. If a
  profile ever shows GC stutter, pool there first.
- **Locale.** This machine runs Turkish Windows. `toFixed` and `JSON.stringify`
  are culture-free; `toLocaleString`, `Intl.NumberFormat` without a locale and
  `toLocaleUpperCase` are not. Pass `'en-US'` every time.

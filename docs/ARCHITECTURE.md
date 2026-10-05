# Architecture

The `domain` ↔ `game` contract. Owned by the `gameplay-engineer` agent; the
rendering side is `web-engineer`'s.

---

## Packages

| | | |
|---|---|---|
| `packages/domain` | `@lopfb/domain` | Pure TypeScript. Every rule, every number, every solver. **Never imports three, the DOM or Node.** |
| `packages/game` | `@lopfb/game` | The Vite app. Thin three.js adapters: render, input, camera, the ball integrator's collision shapes, the body drivers, the HUD, the tuning panel. |
| `packages/server` | `@lopfb/server` | STREET.md P4. A Node process that runs `@lopfb/domain` as the authority. Not created yet. |

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
  on `Math.random` and `Date.now`: the C# domain had no randomness and no clock
  of its own, and the server at P4 depends on two runs of the same inputs
  giving the same outputs.

The payoff is the same as in Godot: every rule is testable in milliseconds,
and from P4 the server runs the exact code the client runs.

### The conversion boundary

The domain's vectors are plain readonly values (`Vec3` in
`packages/domain/src/vec.ts`, the stand-in for `System.Numerics.Vector3`).
`THREE.Vector3` lives in `game`. They meet in exactly one file:
**`packages/game/src/bridge/vec.ts`**, the twin of the old `Vec.cs`.

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
    │    read input and the owner's state
    │    domain: PossessionArbiter, ContactPlanner, BounceSolver  →  a velocity
    │    integrator: apply it, then gravity, damp, position, collisions   ← the ONLY write
    │    BallHistory.record(...)
    ▼
render: draw ball and bodies, interpolated by FixedStep.alpha
```

- **Fixed 120 Hz, as the Godot build.** `BounceSolver` differentiates the
  owner's velocity against the previous tick; a variable step changes the
  touch. A frame that stalls runs at most `maxSteps` and drops the rest.
- **The integrator** copies `TrajectorySampler.Step`'s order: gravity, then
  `v *= max(1 - LinearDamp·dt, 0)`, then position. Ground, wall boxes and
  goal-post cylinders use `Bounce` and `Friction` from `ball.json`. The arc
  preview runs the same steps, so it cannot disagree with the flight.
- **The solver returns; the integrator writes.** Anything else that wants to
  change the ball (a pass request, a deflection, from P2 a keeper's catch)
  queues a request and waits for the next step. Nothing writes the ball's
  position or velocity from a render frame, an event handler or the body.
- The integrator's maths is a rule and lives in `domain` with tests. The
  collision shapes are read from the scene by `game` and passed in as plain
  data.

From P4 the same step runs on the server. **The domain sim is the truth for
every ball**, client and server; the three.js mesh only displays it.

---

## Rule 3 — a rule with a number in it belongs in `domain`

*Could this be wrong in a way a test would catch?* Then it is a rule.

**In `domain`:** the touch, the carry, the stall, possession, charge curves,
verb bands, landing prediction, trajectory sampling, reception, the contact
plan and every limb reach, the strike path's timing, the stride clock, how far
a part turns and how a turn is shared down a chain, the ball integrator, and
from P1 the shot, the goal, the keeper and the street rules.

**In `game`:** camera basis maths, mesh and material construction, input
polling, scene lookups, the animation mixer, bone lookups, the `Limb` → bone
name map, IK solving, blend weights, the 0.79 import scale and the 180° turn.

When a file under `game` multiplies by a tuning value or by a literal that
decides what the body *looks like it is doing*, that arithmetic is in the wrong
package.

---

## Rule 4 — the body meets the ball; nothing in the body writes it

```
BounceSolver ──ball state──► ContactPlanner ──► ContactPlan { limb, kind, time, point, reachable }
                                  │  BodyModel: rest-pose reach per limb,         re-planned every step,
                                  │  from player.json, never a live bone          published BEFORE the contact
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  domain │ game
                                  ▼
        game/src/body: mixer (clips seeked to the stride phase) → LegDriver → ThighDriver
        → UpperBodyDriver → ArmDriver (IK targets clamped to the planned reach) → ReactionSprings
```

- **The solver decides; the body delivers.** The body runs in the render
  frame, after the fixed steps, and reads the plan and the ball. Nothing in the
  ball's path reads the body.
- **A bone is never a solver input.** `BodyModel` holds rest-pose numbers,
  checked against the loaded skeleton at boot by the rig check (the port of
  `RigMetrics`). A breathing idle would otherwise make every touch height and
  every tuning result unrepeatable.
- **One reach rule, read twice.** The planner's reach is the forecast the body
  acts on and the gate `BounceSolver` fires the touch through.
- **F1** swaps the mannequin for the capsule, and the contact marker draws the
  plan. Wrong on the capsule too is the solver; right on the capsule and wrong
  on the body is the body.

---

## Tuning

**One source:** `tools/golden/tuning/*.json`, written by
`../LopFBBounce/tools/GoldenDump` at `godot-final`. Never edited by hand, and no
value in them is typed into TS a second time.

| File | Shape | What it is |
|---|---|---|
| `ball.json` | The C# `BallSettings` record serialised, PascalCase keys, nested by record (`Body`, `Possession`, `Bounce`, …) | The ball's rules |
| `player.json` | `{ source, values, sceneOverrides, notParsed }`: a flat map of `PlayerMotor.cs`'s `[Export]` defaults, plus `player.tscn`'s overrides on the Player node (`HipLateral`) | The body's numbers: Body, Strike, Stride, Pose, Pass Load, Reaction, Follow |
| `camera.json` | Same shape, from `CameraTuning.cs` | Most camera values are in `notParsed` because they defaulted to `CameraModes` statics; those are ported once, in `packages/domain/src/camera/` |
| `animator.json` | Same shape, from `PlayerAnimator.cs` | The clip swing fractions and locomotion thresholds |

- **Field names stay as in C#** (`HoldOffset`, `TouchLeadPerSpeed`). The JSON
  loads without a rename table, and a name in TUNING_LOG greps to the same word
  in TS.
- **The flat maps are applied as in Godot:** `values`, then `sceneOverrides`
  on top. The record builders copy `PlayerMotor`'s properties, **including the
  degrees-to-radians conversion** for angle exports: the JSON holds degrees,
  the domain works in radians.
- **Loaders are strict.** A missing key or an unknown key throws, by name. A
  silently defaulted value is how CarrySim's copy drifted.
- **The live panel (lil-gui)** edits a mutable copy of the loaded settings in
  `game`. The fixed step reads the settings every tick, never caches them, so
  an edit lands on the next tick. The panel can export its overrides as JSON
  for TUNING_LOG; it never writes `tools/golden/`.

---

## Golden files

```
tools/golden/
  tuning/    ball.json  player.json  camera.json  animator.json
  vectors/   <Area>/<File>.json         pure functions: input → expected output
             e.g. Ball/Ballistics.json, Ball/TrajectorySampler.json
  steps/     <Solver>/<sequence>.json   stateful solvers: one record per 120 Hz tick
             e.g. BounceSolver/standing-foot.json, PossessionArbiter/contest.json
```

- `<Area>` and `<File>` are the C# folder and file names, so a vector file
  names its source.
- A vector file is `{ source, cases: [{ name, args, expected }] }`. A step log
  is `{ source, dt, settings, ticks: [{ input, state, output }] }`, where
  `state` is the solver's state at the start of the tick, for the re-fed
  replay. GoldenDump defines the exact shape; if it differs, this section
  follows GoldenDump.
- Tests read them with a static JSON import. The compare helpers
  (`expectClose`, the step replayer) live in `packages/domain/test/support/`.
- Default tolerance `1e-4` absolute. The method is in
  [`IMPLEMENTATION.md`](IMPLEMENTATION.md) § Porting method.

---

## Conventions

- TypeScript `strict`, `noUncheckedIndexedAccess`, ES modules, no default
  exports.
- **No per-tick allocation inside the fixed step.** Preallocated arrays where
  C# had a `Span<T>`. A 120 Hz loop that allocates feeds the garbage collector a
  stutter that reads as a broken solver.
- **Locale.** This machine runs Turkish Windows. `toFixed` and `JSON.stringify`
  are culture-free; `toLocaleString`, `Intl.NumberFormat` without a locale and
  `toLocaleUpperCase` are not. Pass `'en-US'` every time.
- **Numbers from C#.** `Math.fround` on both sides of a threshold that C#
  compared in `float`; `roundHalfEven` where C# used `MathF.Round`.

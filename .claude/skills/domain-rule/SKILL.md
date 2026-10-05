---
name: domain-rule
description: Add, change or port a gameplay rule in LopFBStreet - anything with a number in it. Use when porting a C# file from ../LopFBBounce (godot-final) to packages/domain, translating its xUnit tests to Vitest, wiring a golden vector or a step log, chasing a mismatch against tools/golden, adding a tuning field, writing a street solver (shot, goal, keeper, rules), deciding whether code belongs in packages/domain or packages/game, or fixing a type error in either.
---

# Adding, changing or porting a rule

`packages/domain` is pure TypeScript with every rule in it, under test, with no
three, no DOM and no Node. `packages/game` is thin adapters over it. The split
is enforced by the compiler and by `packages/domain/test/architecture.test.ts`,
not by discipline.

## 1. Does it belong in `packages/domain`?

Ask: **could this be wrong in a way a unit test would catch?**

| Rule — goes in `domain` | Engine vocabulary — stays in `game` |
|---|---|
| bounce decay, the touch, the carry, the stall | camera basis maths |
| possession, charge curves, verb bands | mesh and material construction |
| landing prediction, the ball integrator, reception | input polling, scene lookups, the frame loop |
| which limb plays a touch, its side, when and where | IK solving, bone lookups, the limb → bone-name map |
| limb reach, the strike path's timing, the stride clock | the animation mixer, blend weights |
| how far a part turns, how a turn is shared down a chain | which bone, which axis, which skeleton |
| the shot, the goal line, the keeper's reach, the street rules | the HUD, the panel, the arc's line mesh |

**The body drivers are where this is hardest to see**, and it bit twice in the
Godot build: a chest turn of `angle * 0.5` and an arch of `arch / 3` were
written straight into a driver. Both looked like blend weights and both were
rules, untested and untunable, so when the developer said *"the head lean
towards the ball"* there was no value to reach for. They became
`ChestPose.HeadTurn` and `ChestPose.ArchShares`.

The test: **would a playtester ever complain about this number?** Then it is a
rule, however small, and it needs the domain, a tuning field and a test.

## 2. Porting a C# file

The reference is `../LopFBBounce` at the tag `godot-final`. Read it there; never
edit it. If the working tree there has moved, read the tag:
`git -C ../LopFBBounce show godot-final:domain/Ball/Ballistics.cs`.

1. **Find the place in the order.** `docs/IMPLEMENTATION.md` W1 (and W3 for
   `domain/Body/*`) lists every file in dependency order with its C# test
   files. Port nothing whose dependencies are not ported yet; a stub to get
   ahead is a second opinion that will drift.
2. **Read the C# file and every test that touches it**, not only the
   same-named one. The task row names them; `grep -lw <Type>` over
   `../LopFBBounce/tests` finds the rest.
3. **One C# file → one TS file**, `domain/Ball/LaunchSolver.cs` →
   `packages/domain/src/ball/LaunchSolver.ts`. Keep the C# names for types,
   settings fields and constants (`BounceSolver`, `HoldOffset`): the JSON loads
   without a rename table and TUNING_LOG greps to the same word. Functions are
   camelCase. Keep the doc comments; they carry the football and the S-number.
4. **Translate shapes, not behaviour:**
   - `readonly record struct` + `with` → a readonly object type + spread;
   - `System.Numerics.Vector3` → the domain `Vec3`; never a three type;
   - `Span<T>` / `ReadOnlySpan<T>` → a preallocated array passed in;
   - `in` parameters → plain parameters, never mutated;
   - `double` clocks → plain numbers;
   - `MathF.Round` → `roundHalfEven`, never `Math.round`;
   - a `float` comparison on a threshold → `Math.fround` on both sides.
5. **Translate the tests beside it**, `packages/domain/test/ball/LaunchSolver.test.ts`,
   one `it` per `[Fact]`, one table per `[Theory]`, the same football sentence
   as the name. A C# test that cannot be translated is recorded in PROGRESS with
   the reason; it is never dropped quietly.
6. **Wire the golden files.** A pure function gets
   `tools/golden/vectors/<Area>/<File>.json`; a stateful solver gets its step
   logs in `tools/golden/steps/<Solver>/`, replayed both re-fed per tick and
   free-running (ARCHITECTURE § Golden files). If a vector the port needs does
   not exist, the fix is a new case in `tools/GoldenDump` in the old repo, run
   there and copied here. **Never write expected values by hand**, and never
   generate them from the TS itself.
7. `npm test` and `npm run typecheck` green before the next file.

### When the port and the golden file disagree

The port is wrong until proven otherwise. In order:

1. An operation order that differs from C# (damp before gravity, a clamp
   applied after instead of before).
2. Rounding: `Math.round` where C# had half-to-even; a threshold compared in
   double that C# compared in `float`.
3. A default: a value typed in TS instead of loaded from the JSON.
4. Integer division: C# `int / int` truncates; JS does not.
5. Only then a real float-versus-double difference, which shows as a small
   error growing over a step log, never a jump.

**Tolerance:** `1e-4` absolute by default. A wider one is written next to the
case with the reason and the measured error. **A test that only passes after
loosening its tolerance is a failing test.** Never loosen a tolerance to make a
port pass; find which of the five it is.

## 3. The four rules

**Rule 1 — `packages/domain` never imports three, the DOM or Node.** No
`Math.random`, no `Date.now`, no `performance`: the server at P4 runs this code
as the authority. Conversion to and from `THREE.Vector3` happens only in
`packages/game/src/bridge/vec.ts`, at the call site inside an adapter.

**Rule 2 — the integrator is the only write path.** The ball's position and
velocity are written inside the fixed step, by the integrator, from the
solver's output. Prove it after any change near the ball: grep `packages/game`
and `packages/domain` for assignments to the ball's position or velocity and
read every hit. Reads are fine; a write outside the integrator is the bug. A
hazard, a keeper or a pass request asks the domain and queues a request the
next step applies.

**Rule 3 — a rule with a number in it belongs in `packages/domain`, with a
test.**

**Rule 4 — the body meets the ball; nothing in the body writes it.** The
domain plans each contact before it happens; `game` drives the body to meet
it. IK targets are clamped to the planned reach. **A bone is never a solver
input**: body dimensions enter the domain as rest-pose numbers from
`player.json`, checked against the skeleton at boot. A body rule may read the
clip's live bones to decide a *pose*, because nothing in the ball's path reads
what it returns. **Which limb plays a touch never changes the ball's
velocity** — test that.

## 4. The solver shape

A pure function of its inputs: no three types, no side effects, no clock of its
own. The caller passes the step and the time.

```ts
export function solve(input: BounceInput, settings: BounceSettings): Vec3
```

Settings are readonly object types. Stateful solvers own their state
explicitly (a class or a state object passed in and returned), so a step log
can set it.

## 5. The tuning pair

Every shipped value comes from `tools/golden/tuning/*.json`. **No default is
typed into TS a second time.** Which file depends on whose number it is:

- **The ball's** (the touch, the carry, the launch, possession): `ball.json`,
  the C# `BallSettings` record serialised. The TS settings type mirrors the
  record, field for field.
- **The body's** (a reach, the strike path, the stride, a pose, the reaction,
  the follow): `player.json`, a flat map of the Godot exports plus
  `sceneOverrides`. The TS builder copies the C# property that built the
  record, **including degrees → radians** for angles.
- **The animator's**: `animator.json`.
- **The camera's**: the `CameraModes` statics, ported once with that file.
- **A new rule with no C# twin** (the street solvers from P1): the settings
  type in `packages/domain/src/street/`, and its starting values in one JSON
  file under the street package, cited from STREET.md. Never two places.

Loaders are strict: a missing or unknown key throws by name. Read the settings
**every step**, never cache them at boot, or the lil-gui panel's live edits do
nothing.

**A number that is the sum of others is derived, never stored.** A settings
type with both a total and its parts will have one of them wrong the first time
somebody changes the other.

**A contact timing has a constraint outside its group:** the phases of
`ContactTiming` must fit inside the flight, and `CarryLevelCheck` says so by
name. Adding a phase means re-checking that sum.

## 6. Tests

Vitest under `packages/domain/test/`, mirroring `src/`. Names are football
sentences.

**Never change a domain test to make a tuning value pass.** The tests encode
the intended behaviour; a value that breaks one is the wrong value. If a
behaviour genuinely should change, that is a spec change in
`docs/IMPLEMENTATION.md` first (new specs start at S36).

Model inputs the game can actually generate. The motor ramps velocity toward
its target at a fixed acceleration, so a test that assigns a velocity directly
tests an input no player can produce.

```bash
npm test
npm run typecheck
```

## 7. Finish the change

- If any carry-level number moved, `CarryLevelCheck` must still hold against
  the loaded `ball.json`. The constraint chain is the old repo's
  IMPLEMENTATION S8.
- If the change is a response to how the game feels, it belongs in
  `docs/TUNING_LOG.md` through `/tune`, so it is not tried twice.
- Update the task row in `docs/PROGRESS.md`: tests translated, vectors and step
  logs passing, anything left open with its reason.

## Sources

Values and current state live in these; this skill holds only the procedure. If
any of them changed, re-read this skill against them.

- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION.md`
- `docs/TUNING_LOG.md`
- `packages/domain/tsconfig.json`
- `packages/domain/test/architecture.test.ts`
- `packages/domain/src/vec.ts`
- `packages/domain/src/fixedStep.ts`
- `packages/game/src/bridge/vec.ts`
- `tools/golden/tuning/ball.json`
- `tools/golden/tuning/player.json`

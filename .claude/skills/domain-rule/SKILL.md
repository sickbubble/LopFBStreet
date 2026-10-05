---
name: domain-rule
description: Add or change a gameplay rule in LopFBStreet - anything with a number in it. Use when changing the ported Godot touch (BounceSolver, ContactPlanner and the rest), the ball integrator, the goal line, the shot, the keeper, the street rules or the bots' decisions in packages/domain, writing their Vitest tests, reading a shipped value from tools/golden/tuning, adding a tuning field, writing a street rule's spec into docs/STREET.md, keeping a street rule portable to C#, deciding whether code belongs in packages/domain or packages/game, or fixing a type error in either.
---

# Adding or changing a rule

`packages/domain` is pure TypeScript with every rule in it, under test, with no
three, no DOM and no Node. `packages/game` is thin adapters over it. The split
is enforced by the compiler and by `packages/domain/test/architecture.test.ts`,
not by discipline.

This repo is the concept test; the desktop game is Godot. There are two kinds
of rule here:

- **The touch is Godot's, ported** (developer, 2026-10-05: every mechanic
  the Godot build has). `packages/domain/src/ball/`, `tuning/`, `player/`,
  `camera/` and `body/strideClock.ts` are TS twins of `domain/` at
  `godot-final`, file for file, with the C# tests ported under the same names.
  A change to it is a change to both builds: spec first (S1-S35 or S36+).
  The integrator and the body are web stand-ins and do not go back.
- **The street rules** (the goal, the shot, the keeper, the rules, the bots)
  go back to Godot. They are specified in the docs and written to port to C#.

## 1. Does it belong in `packages/domain`?

Ask: **could this be wrong in a way a unit test would catch?**

| Rule — goes in `domain` | Engine vocabulary — stays in `game` |
|---|---|
| the touch (ported): which limb, the apex, where it is aimed | camera basis maths |
| the ball integrator, the ground, walls and posts | mesh and material construction |
| the goal line, the shot, the strike window | input polling, scene lookups, the frame loop |
| the keeper's reaction time, reach and dives | the animation mixer, blend weights |
| the street rules, the bots' decisions | bone lookups, which bone a turn is applied to |
| how far a part turns to show a touch, if a player could complain about it | the HUD, the panel, the arc's line mesh |

**The body is where this is hardest to see**, and it bit twice in the Godot
build: a chest turn of `angle * 0.5` and an arch of `arch / 3` were written
straight into a driver. Both looked like blend weights and both were rules,
untested and untunable, so when the developer said *"the head lean towards the
ball"* there was no value to reach for.

The test: **would a playtester ever complain about this number?** Then it is a
rule, however small, and it needs the domain, a named setting and a test.

## 2. Adding a rule, test-first

1. **Find the spec.** A street rule's spec is in STREET.md (the shot §5, the
   keeper §6, the rules §2–3) or an S36+ spec in IMPLEMENTATION.md. A touch
   rule's is its S-number in `../LopFBBounce/docs/IMPLEMENTATION.md`. If the spec is silent on something the
   code must decide, the spec changes first: write the sentence, then the code.
2. **Write the test first**, in `packages/domain/test/`, mirroring `src/`,
   named as a football sentence. Model inputs the game can actually generate.
3. **Write the rule** as a pure function, or a stateful one with explicit state
   (§4). Keep it as small as the test needs.
4. **Read every shipped number** from the tuning JSON (§5). Never retype one.
5. `npm test` and `npm run typecheck` green.
6. **Write the doc the same day** (§3). For a street rule this is part of the
   task, not a follow-up.

The C# in `../LopFBBounce` at `godot-final` is the source of the ported
touch: read it there (`git -C ../LopFBBounce show godot-final:<path>`), never
edit it. A ported file stays line for line with its C# twin: PascalCase record
fields (as the JSON has them), camelCase methods, `as const` objects for enums,
`null` for C#'s nullables. A ported test is never loosened to pass; a failure
means the port drifted. What is not ported is in IMPLEMENTATION § *Not built
here*.

## 3. Street rules travel back to Godot

The web code is thrown away when the desktop build starts. A street rule that
lives only in TypeScript is lost with it. So, for anything under
`packages/domain/src/street/`:

- **The spec is in `docs/` the same day.** STREET.md (or an S36+ spec)
  describes it in engine-neutral words: what it decides, its parameters by
  name, its starting values and where they came from, and the football
  sentence behind it. No three.js, no browser, no TypeScript in that text. If
  the code and the doc disagree, fix one of them that day.
- **Plain data in, plain data out.** Inputs and outputs are readonly records of
  numbers, booleans, strings and `Vec3`. No closures kept as state, no
  callbacks into `game`, no TypeScript-only tricks. A rule is written so it
  becomes a C# `readonly record struct` and a static method without being
  restructured. ARCHITECTURE § *Portability to C#* has the full list.
- **STREET.md's names, exactly** (`ShotSolver`, `StreetRules`,
  `KeeperPlanner`, `GoalWidth`). A name the code needs and STREET.md lacks goes
  into STREET.md first. Functions are camelCase.
- **Tests are football sentences**, so they translate to xUnit names one for
  one.
- **State is explicit**, so the rule's steps can be dumped and replayed when
  the C# version is checked against it later.

The ported touch is exempt from the street doc rule: its spec is already
S1-S35 in the Godot repo, and it is C# already.

## 4. The four rules

**Rule 1 — `packages/domain` never imports three, the DOM or Node.** No
`Math.random`, no `Date.now`, no `performance`: the C3 server runs this code as
the authority. Conversion to and from `THREE.Vector3` happens only in
`packages/game/src/bridge/vec.ts`, at the call site inside an adapter.

**Rule 2 — the integrator is the only write path.** The ball's position and
velocity are written inside the fixed step, by the integrator, from the
solver's output. Prove it after any change near the ball: grep `packages/game`
and `packages/domain` for assignments to the ball's position or velocity and
read every hit. Reads are fine; a write outside the integrator is the bug. A
keeper or a shot request asks the domain and queues a request the next step
applies.

**Rule 3 — a rule with a number in it belongs in `packages/domain`, with a
test.** Lean is not a licence to skip this.

**Rule 4 — the body shows the touch; nothing in the body writes it.** The
domain decides which part plays the ball and when; `game` shows it with clips
and simple procedural bone turns (no IK here). **A bone is never a solver
input**: reaches and heights come from `player.json`. A ball out of reach is a
miss, never a stretch.

## 5. The solver shape

A pure function of its inputs: no three types, no side effects, no clock of its
own. The caller passes the step and the time.

```ts
export function solveShot(input: ShotInput, settings: ShotSettings): ShotResult
```

Settings are readonly object types. A stateful rule takes its state in and
returns the next state, so a test can set it and a replay can step it.

## 6. The numbers

**Shipped values are read from `tools/golden/tuning/*.json`, never retyped.**
Wherever a Godot value means the same thing here, it comes from the JSON
through a strict loader:

- **`ball.json`**: the C# `BallSettings` record serialised. Ball physics
  (`Radius`, `LinearDamp`, `Bounce`, `Friction`), each level's `TouchHeight`,
  `Apex` and `SpeedFactor`, the bounce's `BounceMaxApex` and
  `BounceChargeTime`, the launch speeds.
- **`player.json`**: a flat map of the Godot exports plus `sceneOverrides`
  applied on top. The body's reaches and heights. **Angles are degrees** (the
  keys end in `Degrees`); `PlayerMotor` converted them with `DegToRad`, and the
  loader does the same. `ball.json` angle fields stay degrees, as in the C#
  record.
- **`animator.json`** and **`camera.json`**: read only what the web uses.

Field names stay as in C#, so the JSON loads without a rename table and
TUNING_LOG greps to the same word. Loaders are strict: a missing key the code
reads throws by name. `tools/golden/` is never edited by hand.

**A new value with no Godot twin** (a goal size, a keeper reach, a rule's
points): a named setting under `packages/domain/src/street/`, with its starting
value in one place, cited from STREET.md. Never two places.

**Read the settings every step**, never cache them at boot, or the lil-gui
panel's live edits do nothing.

**A number that is the sum of others is derived, never stored.** A settings
type with both a total and its parts will have one of them wrong the first time
somebody changes the other.

## 7. Tests

Vitest under `packages/domain/test/`, mirroring `src/`. Names are football
sentences:

    it('a running keep-up lands ahead of the runner, never behind')
    it('a volley struck early goes over the aim point')

**Never change a domain test to make a tuning value pass.** The tests encode
the intended behaviour; a value that breaks one is the wrong value. If a
behaviour genuinely should change, that is a spec change in STREET.md (or an
S36+ spec) first.

Model inputs the game can actually generate. The motor ramps velocity toward
its target at a fixed acceleration, so a test that assigns a velocity directly
tests an input no player can produce.

```bash
npm test
npm run typecheck
```

## 8. Finish the change

- **A street rule:** STREET.md (or the S36+ spec) says what the code does, in
  engine-neutral words, with the same names. Check it before calling the task
  done.
- **A response to how the game feels:** it belongs in `docs/TUNING_LOG.md`
  through `/tune`, tagged *web*, saying whether the value depends on a
  stand-in (the integrator, the body).
- Update the task row in `docs/PROGRESS.md`.

## Sources

Values and current state live in these; this skill holds only the procedure. If
any of them changed, re-read this skill against them.

- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION.md`
- `docs/STREET.md`
- `docs/TUNING_LOG.md`
- `packages/domain/tsconfig.json`
- `packages/domain/test/architecture.test.ts`
- `packages/domain/src/vec.ts`
- `packages/domain/src/fixedStep.ts`
- `packages/game/src/bridge/vec.ts`
- `tools/golden/tuning/ball.json`
- `tools/golden/tuning/player.json`

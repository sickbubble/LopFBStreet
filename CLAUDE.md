# LopFBStreet

Street football in the browser. One goal, one keeper, two to six players who
keep the ball up between them and finish in the air.

**This repo is the concept test. The desktop game is Godot.** The web build
finds out, fast and from a link anyone can open, whether the street game holds
people's attention. If it does, the detailed game is built in `../LopFBBounce`
(Godot), which already has the real touch and the IK body. Decided by the
developer on 2026-10-05.

Design: [`docs/GDD.md`](docs/GDD.md) · Street: [`docs/STREET.md`](docs/STREET.md) · Roadmap: [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) · State: [`docs/PROGRESS.md`](docs/PROGRESS.md) · Football: [`docs/FOOTBALL.md`](docs/FOOTBALL.md) · Layers: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Design travels back to Godot

The code here is thrown away when the desktop build starts; **the design is
not.** Everything learned here must reach the Godot build intact. The full
list is in [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) § *What goes back
to Godot*; the short version:

- **The spec lives in `docs/`, never only in code.** A street rule added to
  `packages/domain/src/street/` is written into STREET.md (or as an S36+ spec)
  in engine-neutral words, the same day. Code and doc never disagree.
- **Street rules are written to port to C#:** plain data in and out, the
  names STREET.md uses, tests named as football sentences.
- **The touch is Godot's, ported faithfully** (developer, 2026-10-05: the web
  has every mechanic and talent the Godot build has). `BounceSolver`,
  `ContactPlanner` and the rest of `domain/` at `godot-final` are TS twins,
  file for file, with their tests. A change to the touch is a change to both
  builds, made in the spec first.
- **The procedural body, the ball integrator and the motor's slide are
  stand-ins** (for the IK body, Jolt and `MoveAndSlide`), listed in
  IMPLEMENTATION § *Stand-ins*. Nothing about them goes back.
- **Values are logged with their origin** (TUNING_LOG entries tagged *web*,
  saying whether they depend on a stand-in).
- **What players said is kept verbatim** in `docs/PLAYTESTS.md`. That is the
  concept test's result.

`../LopFBBounce` at tag **`godot-final`** is where the touch, the body and the
shipped tuning come from. `tools/GoldenDump` there wrote
`tools/golden/tuning/*.json`, which the ported touch reads through strict
loaders (`ball.json` whole; the motor, body, stride and follow from
`player.json`; the clip thresholds from `animator.json`). The
GDD, FOOTBALL.md and TUNING_LOG.md were written for the Godot build; their rules
hold, and their Godot nodes and Remote-tab steps are history here.

---

## The working split

**Claude writes the code, including the scenes. The developer plays it and
reports what they saw.** In Godot the developer built every scene by hand; on
the web a scene is code, so that split is gone. What stays is the reason for
it: Claude cannot see the running game. It can prove a solver correct with
`npm test`, and it cannot tell you whether the ball feels good.

- **The developer reports what they saw.** "It's bad" is not usable. "The ball
  drifts behind me when I sprint" is.
- **The smoke test** (`e2e/`, Playwright) is how a build gets checked without
  a human looking: the page boots, there are no console errors, and the named
  scene objects exist. It replaces Godot's `SceneContract`. A green smoke test
  is not a human looking.
- **Every gate is the developer's judgement**, on the running build.

---

## Commands

```bash
npm install
npm run dev          # Vite dev server for packages/game
npm test             # Vitest, every package
npm run typecheck
npm run build
npm run e2e          # Playwright smoke test against a production build
```

npm workspaces, not pnpm: pnpm is not installed on this machine, and npm needs
nothing extra.

---

## Layout

| | |
|---|---|
| `packages/domain` | Pure TypeScript. Every rule, every number, every solver. **Never imports three, the DOM or Node.** |
| `packages/game` | The Vite app. Thin three.js adapters over `domain`. |
| `packages/server` | From STREET.md P4: the Node process that runs `domain` as the authority. Not created yet. |
| `tools/golden` | JSON from `../LopFBBounce/tools/GoldenDump`: the shipped tuning. Never edited by hand. |
| `e2e` | The Playwright smoke test. |
| `docs` | Design, roadmap, progress, tuning log. |

---

## The four rules

**1. `packages/domain` never imports three, the DOM or Node.**
`packages/domain/test/architecture.test.ts` fails if it ever does. Conversion
between the domain's vectors and `THREE.Vector3` happens in exactly one file,
`packages/game/src/bridge/vec.ts`, at the call site inside an adapter. Never
hand a three type to a domain function.

**2. The ball's position and velocity are written in one place: the fixed-step
integrator.**
The game runs at a fixed 120 Hz, as the Godot build did; `BounceSolver`
differentiates against the previous tick and depends on it. The solver returns
a velocity; the integrator applies it inside the step. Anything else queues a
request and waits for the next step.

**3. A rule with a number in it belongs in `domain`, with a test.**
Camera basis maths, mesh construction, input polling and scene lookups are
engine vocabulary and stay in `game`. Bounce decay, possession, charge curves,
landing prediction, the shot, the keeper's reach and the street rules are rules
and go in `domain`. When in doubt: could this be wrong in a way a test would
catch? Then it is a rule.

**4. The body meets the ball; nothing in the body writes it.**
The domain decides each touch (which part, whether it is in reach); `game`
only shows it. On the web the body is a stand-in: the mannequin's clips plus
one procedural bone turn per touch (a kick, a knee, a chest, a header, a
shoulder) toward the ported contact plan, with no IK. A ball out of reach is a miss the body is seen to swing at, never a
stretch. No bone is ever a solver input, and nothing in the body layer writes
the ball or gates a state. (The Godot build's IK is the real version of this
rule.)

---

## Speed, within limits

The concept test is meant to be fast. The touch is not where it saves time:
it is ported (C1.P). The street rules are built lean, and lean is not sloppy:

- The four rules above hold in full. A lean rule is still a rule, in
  `domain`, with a test.
- **Shipped numbers are read, not retyped.** Where a Godot value means the
  same thing, it comes from `tools/golden/tuning/*.json`. A new value (a goal
  size, a keeper reach) is a named setting, recorded in docs.
- Names follow the Godot build and STREET.md (`HoldOffset`, `TouchHeight`,
  `ShotSolver`), so a grep finds the same word in both repos.

---

## Conventions

- TypeScript `strict`, ES modules, no default exports.
- **Locale.** This machine runs Turkish Windows: a decimal comma and dotless-i
  casing. `toFixed` and `JSON.stringify` are culture-free. `toLocaleString`,
  `Intl.NumberFormat` without a locale, and `toLocaleUpperCase` are not: pass
  `'en-US'` explicitly, every time.
- The mannequin is `packages/game/public/assets/characters/mannequin.glb`
  (Quaternius UAL1, CC0). It is scaled by **0.79** on load, as Godot imported
  it, and faces +Z.

---

## Agents

| Agent | For |
|---|---|
| `web-engineer` | three.js, rendering, assets, performance, the browser, later netcode |
| `game-designer` | Should this mechanic exist, is this fair, is this in scope |
| `level-designer` | The street pitch: size, walls, goal, sight lines |
| `gameplay-engineer` | Writing `domain`, its tests, the thin adapters; keeping street rules portable to C# |
| `tuning-analyst` | Turning a feel complaint into a parameter change |
| `process-tracker` | What is done, what is next, is the gate passed |

All of them share [`docs/FOOTBALL.md`](docs/FOOTBALL.md). **Realism is evidence,
never authority: the GDD and STREET.md win every tie.**

## Skills

| Skill | Loads when |
|---|---|
| `domain-rule` | A rule with a number in it is being added or changed |

Skills hold procedure; `docs/` holds values and state. A skill names
`HoldOffset`; it never writes down what `HoldOffset` currently is.

## Commands

`/session-start` · `/session-end` · `/gate-check` · `/tune <complaint>`

These run only when the developer types them. Claude's part is to **name the
relevant command when the moment arrives**, in one short line, once per
occasion. A feel description: *"`/tune` will log this so we don't retry it"*.
A question about whether a phase is done: *"`/gate-check`, the gate needs your
judgement"*. The end of a session: *"`/session-end` to record this in
PROGRESS.md"*.

---

## Gate discipline

Each phase's gate is its finish line. **Do not start the next phase until the
current gate passes.** The developer decides what more work a failed gate
needs.

The developer is committed to this game. Never describe a gate, a playtest or
a risk as something that could end the project. Design objections are welcome:
say them plainly, as objections.

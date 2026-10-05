# LopFBStreet

Street football in the browser. One goal, one keeper, two to six players who
keep the ball up between them and finish in the air. The touch (bounce, carry,
pass) comes from LopFBBounce, the Godot game this repo replaces.

Design: [`docs/GDD.md`](docs/GDD.md) · Street: [`docs/STREET.md`](docs/STREET.md) · Roadmap: [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) · State: [`docs/PROGRESS.md`](docs/PROGRESS.md) · Football: [`docs/FOOTBALL.md`](docs/FOOTBALL.md) · Layers: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## Where this came from

`../LopFBBounce`, tag **`godot-final`**, is the reference. Its `domain/` (C#)
is being ported file by file into `packages/domain` (TypeScript). **The C#
tests are the oracle.** `tools/GoldenDump` in that repo writes the shipped
tuning and the expected outputs into `tools/golden/` here, and the TypeScript
tests compare against them. When a port disagrees with the golden file, the
port is wrong until proven otherwise.

The GDD, FOOTBALL.md and TUNING_LOG.md were written for the Godot build. Their
rules still hold. Where they name a Godot node, a `.tscn` or the Remote tab,
read it as history.

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
| `tools/golden` | JSON from `../LopFBBounce/tools/GoldenDump`: tuning, golden vectors, step logs. Never edited by hand. |
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
The domain plans each contact (which limb, when, where) before it happens, and
`game` drives the body to meet the plan with IK, a strike path and a reaction
layer. IK stays inside the limb's planned reach; a ball out of reach is a miss,
never a stretch. No bone is ever a solver input, and nothing in the body layer
writes the ball or gates a state. The capsule behind F1, with the contact
marker, is how a solver fault is told apart from a body fault.

---

## Porting rules

- Port **in dependency order**, one C# file to one TS file, with its tests
  translated beside it. Keep the C# names (`BounceSolver`, `HoldOffset`), so
  TUNING_LOG and the GDD still read true.
- **Numbers:** C# is single-precision `float`; JS is double. Compare with a
  tolerance, and use `Math.fround` where a value lands exactly on a threshold.
  `MathF.Round` rounds half to even: use `roundHalfEven`, never `Math.round`.
- **Tuning has one source:** `tools/golden/tuning/*.json`. No default value is
  typed into TS code a second time.
- A test that only passes after loosening its tolerance is a failing test.

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
| `gameplay-engineer` | Porting and writing `domain`, its tests, the thin adapters |
| `tuning-analyst` | Turning a feel complaint into a parameter change |
| `process-tracker` | What is done, what is next, is the gate passed |

All of them share [`docs/FOOTBALL.md`](docs/FOOTBALL.md). **Realism is evidence,
never authority: the GDD and STREET.md win every tie.**

## Skills

| Skill | Loads when |
|---|---|
| `domain-rule` | A rule with a number in it is being added, changed or ported |

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

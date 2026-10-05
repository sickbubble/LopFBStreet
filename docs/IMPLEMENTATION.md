# LopFBStreet — Implementation Plan

Built on [`GDD.md`](GDD.md) and [`STREET.md`](STREET.md). Read those first;
this document does not restate the design, only how to build it and in what
order. Owned by the `game-designer` agent; the code details are
`gameplay-engineer`'s and `web-engineer`'s. Live task state is in
[`PROGRESS.md`](PROGRESS.md). The layer contract is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

**Stack:** TypeScript (strict), npm workspaces, Vite, three.js (pinned),
Vitest, Playwright. No physics engine: the ball has its own integrator.

---

## What this repo is for

**The web build is the concept test. The desktop build is Godot.** Decided by
the developer on 2026-10-05: the street game is built here, lean, to find out
whether it holds people's attention, because a multiplayer game that opens
from a link gets played by people who would never install anything. If it
does, the detailed game is built in Godot (`../LopFBBounce`, tag
`godot-final`), with the touch and the body it already has.

Two consequences shape every phase below:

1. **The touch is Godot's, ported faithfully; the body is not.** *Amended by
   the developer the same day, 2026-10-05:* the web build has every mechanic
   and talent the Godot build has, so the street game is judged on the real
   touch, not a stand-in. `domain/` at `godot-final` (`BounceSolver`,
   `ContactPlanner`, the stall, the trap and the perfect reception, hot balls,
   possession, the pass profiles, the follow, the camera modes,
   `CarryLevelCheck`) is ported one file to one file into
   `packages/domain/src`, with its xUnit tests ported to Vitest under the same
   names. The IK body is still not ported. The first plan, a **lean touch**,
   is superseded.
2. **Every design decision must travel back to Godot.** The street rules, the
   keeper, the shot, the netcode lessons and what players said are the
   product of this repo. They are written so the Godot build can take them
   over (see *What goes back to Godot*).

**S-numbers.** S1–S35 refer to `../LopFBBounce/docs/IMPLEMENTATION.md` at
`godot-final`. A new spec written here starts at **S36**, and every one of them
is written for both builds.

---

## What goes back to Godot

The web code is thrown away when the desktop build starts; the design is not.
These rules make sure nothing learned here lives only in TypeScript.

1. **The spec is in `docs/`, never only in code.** Every rule added to
   `packages/domain/src/street/` is described in STREET.md (or as an S36+ spec
   here) in engine-neutral words: what it decides, its parameters by name, and
   the football sentence behind it. If the code and the doc disagree, fix one
   of them the same day.
2. **Street rules are written to be ported to C#.** Plain data in, data out,
   no TypeScript-only tricks, names exactly as STREET.md has them
   (`ShotSolver`, `StreetRules`, `KeeperPlanner`, `GoalWidth`). Tests are named
   as football sentences, as the C# tests are.
3. **The check runs the other way later.** When the Godot build takes a rule,
   `tools/golden-out/` (to be written then) dumps the TS street rules' inputs
   and outputs, and the C# port is checked against them, as GoldenDump checks
   this repo against C# today.
4. **The touch is the Godot touch.** A playtest complaint about the touch is
   evidence about the Godot touch too, unless it is about the body or the ball
   integrator, which are still stand-ins (below). The port does not change a
   rule: a change to the touch is made in the spec (S1-S35, or S36+) first and
   in both builds.
5. **Values found here are logged with where they came from.** TUNING_LOG
   entries made here are tagged **web**, and say whether the value depends on
   a stand-in (the integrator's contact numbers, the body's swing angles may
   not transfer) or not (a goal size, a keeper reach, a lives count, anything
   in the ported touch).
6. **What players said is kept verbatim** in [`PLAYTESTS.md`](PLAYTESTS.md).
   That file is the concept test's result.
7. **Netcode lessons go into STREET.md §8.** The desktop build will use Steam
   for transport, but the authority model, the keeper handoff and the lag
   numbers transfer.

### Stand-ins

What the web uses in place of the real thing. None of it goes to Godot.

| Stand-in here | The real thing (Godot) |
|---|---|
| Mannequin clips + one procedural bone turn per touch (`body/touchPose.ts`: a kick, a knee, a chest, a header, a shoulder), eased in to the planned contact and out after it | The contact plan driving IK: `LegDriver`, `ThighDriver`, `UpperBodyDriver`, `ArmDriver`, `TwoBoneIk`, the strike paths and the pass load (S16–S30) |
| Own ball integrator, `ball/ballBody.ts`: `TrajectorySampler.Step` in flight; a solid sphere against the ground (restitution, Coulomb friction into spin), boxes and capsules | Jolt `RigidBody3D` (and, for networked play, STREET §8's domain flight sim) |
| The motor's slide: a flat floor, and a circle pushed out of boxes and posts (`street/pitch.ts` `confineBody`) | `CharacterBody3D.MoveAndSlide` |
| The camera arm pulled in by a ray against the street's boxes | `SpringArm3D` |
| Node server, room links | Steam lobbies and Steam Networking Sockets |

**The shipped numbers are read, never retyped:** `ball.json`, `player.json`
and `animator.json` load through strict loaders (`tuning/loaders.ts`), and
`CarryLevelCheck` passes on them. Only the camera modes and the camera rig's
exports, which GoldenDump could not reach, are copied from the C# at
`godot-final` (TUNING_LOG says so).

---

## Phases

Each phase has a gate: its finish line. **Do not start the next phase until
the current gate passes.** The developer judges every gate.

Tasks are tagged:

- **[CODE]**: Claude writes it and can verify it (`npm test`, `npm run
  typecheck`, `npm run build`, `npm run e2e`).
- **[DEV]**: needs the developer: an account, a click, or playing it and
  saying what they saw.

| Phase | Goal | Maps to STREET.md |
|---|---|---|
| W0 | Setup: a loop you trust | — |
| C1 | The Godot touch, then the shot, alone on the street | P1 |
| C2 | The keeper, the rules and bots, offline | P2 + P3, lean |
| C3 | Online, 2 to 6 players from a link | P4 + P5 |
| C4 | The concept test: real players, measured | — |

STREET.md §7's phases and gates describe the full game, and stay the plan for
the Godot build. The gates here are concept gates: is it worth building
properly?

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
| W0.7 | [CODE] | Vite app in `packages/game`: renderer, a greybox street built in code, the game loop driving `FixedStep` | `npm run dev` shows the scene |
| W0.8 | [CODE] | `mannequin.glb` loaded at **0.79** scale, facing +Z, playing `Idle_Loop` | Visible in the dev build |
| W0.9 | [CODE] | Tuning: `tools/golden/tuning/*.json` copied from GoldenDump | The four files are in `tools/golden/tuning/` |
| W0.10 | [CODE] | Playwright smoke test in `e2e/`: production build boots, no console errors, the named objects exist (`Street`, `Goal`, `Player`) | `npm run e2e` green |
| W0.11 | [DEV] | GitHub remote for the new repo | `git push` works |
| W0.12 | [CODE] | CI on push: typecheck, test, build, e2e | Workflow green on GitHub |
| W0.13 | [DEV] | Deploy preview on GitHub Pages (`.github/workflows/pages.yml`); Settings > Pages > Source: GitHub Actions | A pushed commit gets a preview URL |
| W0.14 | [DEV] | **Gate:** edit a `.ts` file with `npm run dev` running and see the change | The developer reports it |

**Gate:** *"I edit a .ts file, the browser reloads with the change, and `npm
test` is green in CI."*

---

## C1 — The Godot touch and the shot

One player on the street, a ball, a goal with nobody in it. The touch is the
Godot build's, ported (C1.P); the shot is new (C1.5). The browser prototype of
2026-10-05 ([`prototypes/alman-ayligi.html`](../prototypes/alman-ayligi.html))
is the reference for how the shot plays.

**The controls are Godot's** (`project.godot`): WASD, Shift to sprint, Space to
jump, hold and release the left mouse to bounce (the height), hold and release
the right mouse to pass (the power), R to reset the ball, C for the camera
modes, F1 for the capsule, Esc to free the mouse; H for the tuning panel.

| Id | Tag | Task | Done when |
|---|---|---|---|
| C1.1 | [CODE] | Tuning loaders: `ball.json` and `player.json` into typed settings, failing on a missing key; degrees to radians where `PlayerMotor` converted | Tests load the shipped files |
| C1.2 | [CODE] | Ball flight: gravity, then `v *= max(1 - LinearDamp·dt, 0)`, then position (the Godot order, `TrajectorySampler.Step`); ground bounce with `Bounce` and `Friction`; walls as boxes; posts and bar as cylinders | Tests: a free flight lands where the closed form says; a post deflects |
| C1.3 | [CODE] | `Goal`: the goal mouth, and the line crossed by the whole ball, tested over two consecutive ball samples, never a thin trigger (STREET §2.1) | Tests: in, wide, over, off the post and in |
| C1.P | [CODE] | **Godot parity:** `domain/` at `godot-final` ported to `packages/domain/src` file for file (`ball/`, `tuning/`, `player/`, `body/strideClock`, `camera/`), every xUnit test ported (`BounceSolverTests` and the rest; `CarrySim` as `test/support/carrySim.ts`). The adapters in `packages/game` mirror Godot's controllers: `BallController` (with `BounceController` and `PossessionController` folded in), `PlayerMotor`, `LaunchInput`, `PassPreview`, `BallMarkers`, `BallTrackingCamera`, the animator, the debug HUD | Every ported test green; `packages/game/test/gameLoop.test.ts` plays the trap, the keep-up, a head stall, a walk and a pass |
| C1.5 | [CODE] | `ShotSolver`: aim point on the goal plane, speed from the charge, the low solution through the point; the strike window by contact height against `SweetHeight[part]`, so early skies and late tops it, deterministic (STREET §5, lean) | Tests: same input, same shot; a clean strike goes through the aim point; the error sign per part |
| C1.6 | [CODE] | Player motor, input (Godot's map, above), the camera rig and its five modes; the crosshair comes with the shot | Runs, sprints, jumps, aims |
| C1.7 | [CODE] | The pass arc (`PassPreview`), the shadow and the landing ring (`BallMarkers`); the shot's arc comes with the shot | The arc is drawn from the same flight steps as the ball |
| C1.8 | [CODE] | Body: `Idle_Loop` / `Walk_Loop` / `Jog_Fwd_Loop` / `Sprint_Loop` blended by speed; simple procedural bone turns on top for foot, knee, chest, header and volley | Each touch shows a part moving |
| C1.9 | [CODE] | HUD: fps, the Godot `DebugHud` readouts, the toast naming each touch (keep-up, stall, BROKE, trap, PERFECT...); the shot's toast (clean, skied, topped) comes with the shot | — |
| C1.10 | [CODE] | lil-gui tuning panel over the live settings (shot, touch, ball); an edit lands on the next step, and a "copy as JSON" button for TUNING_LOG | Changes apply with no reload |
| C1.11 | [CODE] | Smoke test extended: `Ball`, `BallShadow`, `LandingRing`, `PassArc`, and the ball trapped and kept up with nobody pressing anything | `npm run e2e` green |
| C1.12 | [DEV] | Play on the preview URL and report | Reported in PLAYTESTS.md, verbatim |

**Gate:** *"I can run, keep the ball up and volley or head it at the goal, and
after a miss I can say whether I was early, late or aimed wrong."*

---

## C2 — The keeper, the rules and bots

Still offline. The game exists: you against a keeper, with bots in the other
slots.

| Id | Tag | Task | Done when |
|---|---|---|---|
| C2.1 | [CODE] | `KeeperPlanner`, lean: a bot keeper that reads the shot after a reaction time, the commit and react dives with fixed reaches, catch or parry (STREET §6.2–6.4) | Tests: same shot, same save; out of reach is a goal |
| C2.2 | [CODE] | The keeper's ball: the hold clock, the throw back out (STREET §6.5–6.6) | — |
| C2.3 | [CODE] | `StreetRules`: the event state machine of STREET §2.5, with the preset as a settings record. **9 Aylık first** (in the air, points by finish, the keeper leaves at nine), Heads & Volleys as the second preset | Tests feed event sequences: goal, illegal goal, miss, caught, swap, life lost, end |
| C2.4 | [CODE] | Bot outfielders: they keep the ball up and shoot, and err like people (late, early, wrong side), never by dice (STREET §9 question 10) | A bot game runs to the end on its own |
| C2.5 | [CODE] | You in goal: the player controls the keeper when the rules send them there (commit and react dives, catch or parry) | Playable both ways |
| C2.6 | [CODE] | Rules HUD: points, lives, who is in goal and why | Every swap names its reason |
| C2.7 | [DEV] | Play full games against bots and report | Reported in PLAYTESTS.md |

**Gate:** *"A full game against bots is fun, and I never had to ask why I was
sent in goal."*

---

## C3 — Online, 2 to 6 players

| Id | Tag | Task | Done when |
|---|---|---|---|
| C3.1 | [CODE] | `packages/server`: Node runs `packages/domain` as the authority (STREET §8). The transport is chosen here, from a lag-and-loss test, not on paper | A test client plays against it locally |
| C3.2 | [CODE] | Rooms: create a game, share a link, join from it; no accounts | Two browsers in one game from one link |
| C3.3 | [CODE] | Touches as events, sparse snapshots, the shot event at the wind-up, keeper authority handoff, `BallHistory` rewind for touch validation | Tests on the server's rules |
| C3.4 | [CODE] | Lag simulation at 50, 100 and 150 ms | Toggle in the dev build |
| C3.5 | [CODE] | Up to 6: spectating for players who are out, bots fill empty slots | — |
| C3.6 | [DEV] | Hosting: a small server (VPS or Fly.io); the static client stays on Pages | A link works from another network |
| C3.7 | [DEV] | Play with friends and report | Reported in PLAYTESTS.md |

**Gate:** *"Six of us played a full game from one link, nobody asked what just
happened, and at 100 ms no save I made counted as a goal."*

---

## C4 — The concept test

The point of the repo. Real players, and numbers decided **before** they come
in, so the result is not read to fit a hope.

| Id | Tag | Task | Done when |
|---|---|---|---|
| C4.1 | [DEV] | Decide the success bar with numbers, before launch: for example the share of players who finish a game, games per session, the share who come back within a week, rooms started from a shared link | Written in PROGRESS.md |
| C4.2 | [CODE] | Measurement, privacy-light: anonymous session counts and those events, no personal data, no cookies beyond the session | The numbers in C4.1 can be read |
| C4.3 | [CODE] | A feedback line in the game ("what would make you play again?") into PLAYTESTS.md's source | — |
| C4.4 | [DEV] | Publish: the own link first, then CrazyGames (it welcomes multiplayer; its SDK handles ads) | Live |
| C4.5 | [DEV] | Run it for an agreed period and read the numbers against C4.1 | Recorded |

**Gate (the developer's decision):** *"The numbers and what players said tell
me whether to build the desktop version."* Either answer is a result: a yes
starts the Godot build with everything in *What goes back to Godot*, a no says
what to change and test again.

---

## Effort

An estimate for a solo developer with Claude.

| Phase | Time |
|---|---|
| W0 | done but for the developer's steps |
| C1 | 1–2 weeks |
| C2 | 2–3 weeks |
| C3 | 3–4 weeks |
| C4 | 2–4 weeks of running it |

---

## Verification

**Continuously:** `npm test` and `npm run typecheck`. This is the part of the
game Claude can verify without a human.

**Per build:** `npm run build` then `npm run e2e`. The page boots, there are no
console errors, and the named scene objects exist. A green smoke test is not a
human looking.

**Per phase:** the gate, judged by the developer on the deployed preview URL.
`/gate-check` evaluates one honestly and never infers a pass from green tests.

**Performance:** fps and draw calls in the HUD with 6 mannequins on screen, on
the developer's machine and one mid-range laptop.

---

## Not built here

| What | Why |
|---|---|
| The IK body, the strike paths, the pass load, the reaction layer (`domain/Body/*` except `StrideClock`; `game/scripts/Body/*`) | Godot has it; the body here is a stand-in |
| Laundry Lane (`domain/Level/*`, `LEVEL.md`, `DRESSING.md`): the cloth, the hose, the drain, the checkpoints | Parked in the old repo (developer, 2026-10-05: street pitch only). The deflection rule (S34) is ported; nothing on the street triggers it |
| `.tscn` / `.tres` scenes, `SceneContract`, `GODOT_SETUP.md`, `SCENE_SPECS.md` | Godot-only; the Playwright smoke test does the contract's job here |

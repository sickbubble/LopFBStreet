# Progress

Owned by the `process-tracker` agent. Read at session start with
`/session-start`, updated at session end with `/session-end`.

**Last updated:** 2026-10-05 (first session, end: checked against the repo at
`da077cf`, pushed, tree clean but for a one-line `package-lock.json` change
from `npm install`; 19/19 tests, typecheck, build and e2e green; W0.1–W0.13
done, the W0 gate not evaluated)

**Milestone W0 - Setup.** The phases and their tasks are in
[`IMPLEMENTATION.md`](IMPLEMENTATION.md).

**Status: not passed.** Gate: *"I edit a .ts file, the browser reloads with
the change, and `npm test` is green in CI."*

---

## Where we are

**2026-10-05 (first session, end): W0 is built and live; only its gate is
left, and it is the developer's.** The repo's role was settled the same day:
**the web build is a lean concept test, and the detailed desktop game will be
Godot** (`../LopFBBounce`, paused, not abandoned). Phases are W0, then C1 (lean
touch and shot), C2 (keeper, rules, bots), C3 (online 2–6), C4 (the concept
test).

- **Built:**
  - the npm workspace
  - the 120 Hz `FixedStep` and the vec module
  - the architecture test
  - the street greybox
  - the mannequin idling at 0.79 scale (crown 1.829 m × 0.79 = 1.445 m in bind pose, matching `CrownHeight`)
  - the Playwright smoke test
  - CI and the Pages deploy
- **Live:**
  - https://github.com/sickbubble/LopFBStreet (public)
  - https://sickbubble.github.io/LopFBStreet/
- **Reference:** the single-file browser prototype is in `prototypes/alman-ayligi.html`, the reference for how C1 and C2 play.
- **Next:** the developer runs `npm run dev`, edits a `.ts` file and reports whether the page reloaded with the change (W0.14). Then C1, **starting with the bounce** (C1.4b), in a new chat.

**Attempted and changed, so it is not retried:**
- **The faithful port, planned and dropped the same day.** Plan: W1–W3, porting `BounceSolver`, `ContactPlanner` and the IK body file by file, with the C# tests as the oracle. It was dropped when the developer chose a lean concept test: the feel of the touch is Godot's job. See the decision rows.
- **`npm run dev -- --port 5173` serves a 404 page.** The extra argument reaches Vite as its root folder, not as a port. The same happened with `vite preview` in the Playwright config, now fixed to `npm run preview -w @lopfb/game -- --port 4173 --strictPort`. Use plain `npm run dev`.
- **On Windows, stopping the background task does not stop the Node child,** which kept port 5173. Kill the `node` process by id.
- **The `gh` token has no `workflow` scope.** `gh repo create --push` was rejected on `.github/workflows/*`. A plain `git push` succeeded through git's own credential manager, which has it. A `gh` command that edits workflows will need `gh auth refresh -h github.com -s workflow`.

Skill changed: `domain-rule` now names C1.4b as the bounce's spec and lists
`BounceMaxApex` and `BounceChargeTime` among the shipped values it reads,
because C1.4b was added this session.

Nothing has been played on the web yet. The gate has not been evaluated.

---

## W0 — Setup

| Id | Tag | Task | Depends | Done when | Status |
|---|---|---|---|---|---|
| W0.1 | [CODE] | `CLAUDE.md` and the docs: GDD, FOOTBALL, STREET, TUNING_LOG copied; ARCHITECTURE, IMPLEMENTATION, PROGRESS new | — | All present; STREET §8 rewritten for the web | done |
| W0.2 | [CODE] | `.claude/` adapted: agents, the `domain-rule` skill, commands, `check-skills.sh`, `statusline.sh`, `settings.json` | — | `bash .claude/check-skills.sh` runs; the status line shows W0 | done |
| W0.3 | [CODE] | npm workspace: root `package.json`, `tsconfig.base.json`, `packages/domain`, `packages/game` | — | `npm install` clean; `npm run typecheck` green | done |
| W0.4 | [CODE] | Vitest at the root over every package | W0.3 | `npm test` green | done |
| W0.5 | [CODE] | The architecture test, `packages/domain/test/architecture.test.ts` | W0.4 | Fails on a `three`, `node:` or DOM use in domain; green on the tree | done |
| W0.6 | [CODE] | `FixedStep` (120 Hz) and the domain vec module, with tests | W0.4 | `npm test` green | done |
| W0.7 | [CODE] | Vite app: renderer, greybox street in code, the loop driving `FixedStep` | W0.3, W0.6 | `npm run dev` shows the scene | done |
| W0.8 | [CODE] | `mannequin.glb` at 0.79 scale, facing +Z, playing `Idle_Loop` | W0.7 | Crown at ~1.45 m in the dev build | done |
| W0.9 | [CODE] | Tuning JSON copied from GoldenDump (loaders are C1.1) | W0.3 | The four files are in `tools/golden/tuning/` | done |
| W0.10 | [CODE] | Playwright smoke test in `e2e/` | W0.7 | `npm run e2e` green: boots, no console errors, `Street`, `Goal` and `Player` exist | done |
| W0.11 | [DEV] | GitHub remote for the new repo | — | `git push` works | done |
| W0.12 | [CODE] | CI on push: typecheck, test, build, e2e | W0.10, W0.11 | Workflow green on GitHub | done |
| W0.13 | [DEV] | Deploy preview on GitHub Pages (`.github/workflows/pages.yml`) | W0.11 | A pushed commit gets a preview URL | done |
| W0.14 | [DEV] | **Gate:** edit a `.ts` file with `npm run dev` running and see the change; CI green | W0.7, W0.12 | The developer reports it | todo |

## C1 — The lean touch and the shot

Opens when W0's gate passes. Tasks as in IMPLEMENTATION.md; C1.4b emerged at
the end of this session (the developer: *"we will continue bounce
implementation in another chat"*).

| Id | Tag | Task | Depends | Done when | Status |
|---|---|---|---|---|---|
| C1.1 | [CODE] | Tuning loaders: `ball.json`, `player.json` | — | Tests load the shipped files; a missing key fails | todo |
| C1.2 | [CODE] | Ball flight, ground, walls, posts | C1.1 | Flight lands where the closed form says; a post deflects | todo |
| C1.3 | [CODE] | `Goal`: mouth and line crossing over two samples | C1.2 | Tests: in, wide, over, off the post and in | todo |
| C1.4 | [CODE] | Lean touch: keep-up by height band, aimed at where the player will be | C1.2 | A standing keep-up comes back to the feet; a running one lands ahead | todo |
| C1.4b | [CODE] | **The bounce:** a commanded touch whose hold time sets the apex, from `BounceMaxApex` and `BounceChargeTime` in `ball.json` (GDD's bounce, S6), lean. It sets the level the ball is carried at after | C1.4 | Tests: a tap and a full hold give the shipped minimum and maximum apex; the apex picks the level by `LevelForApex`'s rule | todo |
| C1.5 | [CODE] | `ShotSolver` and the strike window | C1.2 | Same input, same shot; a clean strike goes through the aim point | todo |
| C1.6 | [CODE] | Player motor, input, camera, crosshair | C1.1 | Runs, sprints, aims | todo |
| C1.7 | [CODE] | Release-now arc, ground marker | C1.5 | Drawn from the same flight steps as the ball | todo |
| C1.8 | [CODE] | Body: clips by speed + procedural bone turns per part | C1.4 | Each touch shows a part moving | todo |
| C1.9 | [CODE] | HUD: fps, prompt, contact toast | C1.5 | — | todo |
| C1.10 | [CODE] | lil-gui tuning panel, copy as JSON | C1.1 | Edits apply with no reload | todo |
| C1.11 | [CODE] | Smoke test extended: `Ball`, `Goal` | C1.2 | `npm run e2e` green | todo |
| C1.12 | [DEV] | Play on the preview URL and report | all | Reported in PLAYTESTS.md, verbatim | todo |

### Blocked

Nothing. C1 waits on the W0 gate, which is the developer's.

---

## Decisions worth not relitigating

| Date | Decision | Why |
|---|---|---|
| 2026-10-05 | **The web build is the concept test; the desktop game is Godot.** The web is built lean to find out whether the street game holds people's attention. If it does, the detailed game is built in `../LopFBBounce` with its real touch and IK body. **Every design decision made here is written so the Godot build can take it over** (IMPLEMENTATION.md § *What goes back to Godot*). | The developer: *"i will start working with web to decide on the concept and test it whether its takes the people attention if so i will work on godot version in details. because having playable version with multiplayer is easy on the web then the godot have all players install the game etc. so be sure keeping all the design ideas for web later we may easily apply them on the desktop version"*. Claude had recommended shipping the TypeScript build to Steam too; the developer chose Godot for desktop. Not reopened. |
| 2026-10-05 | **Lean touch, no faithful port.** The web skips porting `BounceSolver`, `ContactPlanner` and the IK body (the old W1–W3, about 4–6 weeks). It has a simple tested touch (C1) that reads the shipped Godot numbers where they mean the same thing, and goes straight to the street game and online play. **This supersedes the three rows below about the oracle, the ported IK and "the touch first".** | The developer's choice, between lean, faithful and touch-only. The feel of the touch is Godot's job and already exists there; the concept test needs the street game in front of players in weeks. |
| 2026-10-05 | **The game moves to the web.** TypeScript + Vite + three.js. | The developer liked the browser prototype (one goal, a keeper, volleys and headers): *"i really liked the idea and the look"*, and wants up to 6 players on the web. As far as we know, Godot 4 still cannot export a C# project to the web, so the code has to move. `domain/` was already engine-free and the IK is hand-written maths, so both port. |
| 2026-10-05 | **A new repo; the Godot repo is frozen as the reference** at the tag `godot-final`. | The developer's choice. The old repo keeps one addition, `tools/GoldenDump`, which writes the shipped tuning and the expected outputs this repo is checked against. |
| 2026-10-05 | **The Quaternius mannequin and the ported IK.** Same body as Godot: `mannequin.glb` (UAL1, CC0), scaled 0.79, the hand-written `TwoBoneIk` and the four drivers. | The developer's choice. The Godot body used no engine IK nodes and no AnimationTree, so nothing in it is tied to Godot. |
| 2026-10-05 | **The street game comes first, right after the touch** (W0–W3, then STREET.md P1–P5). **Laundry Lane stays parked** in the old repo. | The developer's choice. The street track had no code yet, so it is written in TypeScript from the start. |
| 2026-10-05 | **npm workspaces, not pnpm.** | pnpm is not installed on this machine, and npm needs nothing extra. The plan said pnpm; nothing else changes. |
| 2026-10-05 | **Our own ball integrator, no physics engine.** It copies `TrajectorySampler.Step`'s order (gravity, damp, position) and handles the ground, wall boxes and goal posts with the ball's `Bounce` and `Friction`. | The arc preview then cannot disagree with the flight, because both run the same steps. And STREET §8 makes the domain sim the truth for the networked ball; on the web that now holds for every ball, client and server alike. |
| 2026-10-05 | **The C# tests are the oracle.** Golden vectors and step logs from GoldenDump, compared at `1e-4`; a test that passes only after loosening its tolerance is a failing test. | 8,803 lines of tuned, tested rules are the asset being moved. A port that is checked only by its own new tests can drift silently; a port checked against the C# outputs cannot. |

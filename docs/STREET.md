# Street — one goal, many shooters

Owned by the `game-designer` agent.

> Approved by the developer 2026-10-02. **M1 (Laundry Lane) is parked, not
> abandoned.** The street work lives in this repo under
> `packages/domain/src/street/` and sits on the touch. Nothing here is built
> yet. Research and the reasoning are in the approved plan
> (*so-keep-the-bouncing-mighty-giraffe*). The pitch is sized by
> `level-designer`; the domain split is reviewed by `gameplay-engineer`.
>
> Moved to the web 2026-10-05 (plan *yes-i-really-liked-iterative-bentley*):
> §8 and the P4 row are rewritten for a browser game with a Node server;
> everything else stands as approved. [`LATER.md`](../../LopFBBounce/docs/LATER.md)
> and `LEVEL.md` stay in `../LopFBBounce` at `godot-final`; the links below
> point there.
>
> **The web build is the concept test (2026-10-05).** It implements this
> design lean, to find out whether the street game holds people's attention
> ([`IMPLEMENTATION.md`](IMPLEMENTATION.md) phases C1–C4), on Godot's
> touch, ported faithfully (the developer, the same day). §7's phases and gates describe the full game,
> to be built in Godot; the web's gates are IMPLEMENTATION's concept gates.
> So this file is written in engine-neutral terms: it is what the Godot build
> takes over.
>
> **On the web, 9 Aylık is the first preset** (IMPLEMENTATION C2.3), because
> the developer's interest is the *alman aylığı* kind of game: in the air,
> points by finish, the keeper leaves at nine. Heads & Volleys stays second.
> §2's ruleset text is unchanged.

[`GDD.md`](GDD.md) still governs the touch: carry, bounce, pass, the levels,
the contact plan, rule 4. This file adds what a goal and a keeper need, and
names every place street mode departs from [`FOOTBALL.md`](FOOTBALL.md) §1
(§4 below). Anything not listed there is unchanged.

---

## 1. Concept

The playground game every country has a name for: **one goal, one keeper, two
to six players**. The outfield players keep the ball up between them and
finish in the air, with a header or a volley. A mistake sends you in goal. A
save that is clean enough gets the keeper out. It is the same touch as the
demo level, with a goal at the end of it instead of a course. **One rule
engine, presets as data** (§3): Heads & Volleys first, the others later.

---

## 2. Heads & Volleys — the ruleset

Every number is a named parameter in a `packages/domain/src/street/` settings
record. Rule
values are **unset** until a playtest picks them. The shot and keeper values
in §5–§6 are starting points for tuning.

### 2.1 Words

| Term | Definition |
|---|---|
| **Touch** | A contact between an outfield player's body and the ball. Any `TouchKind`, by any `Limb`. Keep-ups count |
| **Bounce** | A contact between the ball and anything that is not a player's body. Ground always counts. The goal frame counts only if `FrameIsBounce`. Walls count only if `WallIsBounce` |
| **Clean** | No bounce since the last touch, by anyone |
| **Strike** | A launch (GDD §3.1) played at a ball in flight. A pass fired off a stall (chest or head hold) is **not** a strike: the ball was resting, not arriving |
| **Shot** | A strike whose aim point is on the goal mouth (§5). Any other launch is a pass |
| **Header** | A strike played by the head (`BallVerb.Head`) |
| **Volley** | A strike played by a foot (`BallVerb.Foot`, or `Backheel` if `BackheelIsVolley`) at a clean ball |
| **Half-volley** | A foot strike within `HalfVolleyWindow` after a bounce. Illegal in Heads & Volleys unless `AllowHalfVolley` |
| **Goal mouth** | The rectangle between the inner faces of the posts and under the bar, `GoalWidth` × `GoalHeight` |
| **Crosses the line** | The whole ball is past the goal line, so its centre is `Radius` beyond the line plane (Law 10). Tested as a segment over the two newest `BallHistory` samples, never with a thin trigger |
| **Last toucher** | The outfield player who made the most recent touch. A keeper touch does not change it |

### 2.2 What counts

A **legal goal** is a ball that crosses the line inside the goal mouth when all
of these are true:

1. The last outfield touch was a **header or a volley**, played by a part in
   `FinishParts`.
2. That touch was a **strike**, i.e. first-time. No trap-then-shoot and no shot
   off a stall.
3. The ball was **clean when struck**: no bounce since the touch before it.
4. The ball **stayed clean from the strike to the line**. A keeper touch on the
   way does not void it, so a parry that goes in is a goal.
5. If `SelfSetUp` is false, the touch before the strike was by a different
   player. If it is true, you may juggle yourself into your own volley.

The scorer gets `PointsHeader` or `PointsVolley`. Bounces are free in the
build-up: a dropped keep-up is a loose ball, never an error. **Only the finish
has to be clean.**

### 2.3 What sends a shooter in goal

Each of these is an **error** by the last toucher:

| Error | Trigger |
|---|---|
| **Miss** | The ball crosses the goal-line plane outside the goal mouth (wide or over), and the keeper has not touched it since the last outfield touch |
| **Illegal goal** | The ball crosses the line inside the goal mouth, but 2.2 fails: it bounced, it was not a header or volley, or it was not first-time |
| **Caught** | The keeper **catches** the ball (§6.4, not a parry) before it bounces, after any outfield touch. A shot, a cross or a stray pass all count. A catch after a bounce is just the keeper's ball |
| **Out** (only if `SideOutIsError`) | The ball leaves the pitch over a side or back boundary off an outfield touch |

**On an error:** the offender loses one life. If they still have lives, they
swap with the keeper: the offender goes in goal, and the old keeper comes out
with full outfield rights. If that error takes the offender to zero lives,
they are **eliminated**, and the keeper stays in goal.

**On a legal goal:** the keeper stays in. No life changes hands.

**Restarts:** after every goal, error, keeper catch or dead ball, play
restarts with the keeper's ball (§6.6). After a swap, the new keeper starts
holding it. A ball left loose and untouched in the field for `DeadBallTime`
is a dead ball.

### 2.4 Lives and the end

- Every player starts with `StartingLives`.
- Lives are lost only by errors (2.3). Conceding a goal costs nothing but your
  turn in goal going on.
- **The match ends** when only `FinalPlayers` remain, or when `MatchTime`
  runs out, whichever comes first (`MatchTime` unset means no clock).
- **The player in goal at the end loses.** The rest are ranked by points, then
  lives left. Eliminated players rank below them, latest out highest.
- The forfeit the loser takes in the playground is a cosmetic flourish at
  most. It is never anything a rating board would object to.

### 2.5 What the engine is

`StreetRules` is a pure state machine in `packages/domain/src/street/`. Its inputs are
events (a touch, a bounce, a line crossing, a keeper catch, a tick). Its
outputs are events (goal, error, swap, life lost, eliminated, match end). It
holds no physics and is tested by feeding it event sequences. A preset is a
settings record, never a subclass.

---

## 3. Presets — later

Labelled **later**: data only, built after Heads & Volleys passes P3. Names
are generic on purpose: no "Wembley", "World Cup" or "FIFA". The web build
departs from this order: 9 Aylık first, Heads & Volleys second (see the note
at the top).

| Preset | Valid finish | Scoring by touch | Who goes in goal | Elimination | End |
|---|---|---|---|---|---|
| **Heads & Volleys** (UK) | Header or volley, clean, first-time | `PointsHeader`, `PointsVolley` | The offender (miss, illegal goal, caught) | Lives (§2.4) | `FinalPlayers` or `MatchTime`. The keeper at the end loses |
| **Knockout** (UK) | Any goal | One per goal | A fixed keeper (`FixedKeeper`), a bot or a rotating player | Per round, everyone still in needs a goal to go through. The last without one is out | `FinalPlayers`. The final is first to `FinalTarget` |
| **9 Aylık** (TR) | The ball must enter in the air | A table by touch: foot, header, nutmeg, volley, shoulder, overhead (`PointsByFinish`). Playground values are reported as foot 1 up to bicycle kick 5–15 | The offender: a ground goal, ball out, double touch, a catch | Named tiers (anne, abla, …), one per `KeeperExitPoints` reached | The keeper leaves at `KeeperExitPoints` (nine by name). A penalty decider settles the last place |
| **Luftkönig** (DE) | A first-time volley from an aerial pass. Inside `HeaderOnlyZone` only headers count | One per goal | The offender: caught, headed over, or a bad set-up (`SetUpIsError`) | Lives | Last two take penalties |
| **Centro Gol** (LatAm) | A finish from a cross (`RequireCross`: the previous touch was another player's launch) | One per goal | **The scorer** goes in goal, the reverse of the UK rule (`Rotation = ScorerToGoal`) | None | First to `TargetPoints`, or `MatchTime` |

The columns a preset sets:
- `FinishParts`, plus the clean, first-time, self set-up and zone flags;
- `PointsByFinish`;
- `Rotation` (`OffenderToGoal` · `ScorerToGoal` · `FixedKeeper`);
- `Errors`, each mapped to a consequence (to goal · lose a life · eliminate);
- `KeeperExit` (on a catch · at points);
- `Elimination`;
- `End`.

**Touches that do not exist yet:** a nutmeg is a geometric test (the ball
passes between the keeper's feet). The bicycle and overhead kick are new
strikes with their own `Limb` plan. Both are later than 9 Aylık itself.

---

## 4. Street-mode exceptions to FOOTBALL.md

FOOTBALL.md §1's table, read for street mode. Rows 2, 3 and 5 are unchanged.
**Nothing pulls the ball to anyone, keeper included.**

| Row | In the demo level | In street mode | What replaces it |
|---|---|---|---|
| **4** Aim at where you *will* be | Every touch | Carry and bounce, unchanged. **Not the shot** | A shot aims at a **point on the goal mouth**: the camera ray picks it, the hold picks the speed, and `ShotSolver` solves the angle to pass through it (§5). A pass to a teammate stays the GDD launch |
| **6** A miss costs a level, never the ball | Always | A dropped keep-up still costs only a level. **A missed, illegal or caught finish costs a life and sends you in goal** | Pillar 1, read literally: the error *changes the game state* (you become the keeper), and it never stops the game. Being in goal is a role, not a black screen |
| **1** One optional timing window | The perfect reception | **The strike has a timing window** that sets power and accuracy (§5.3). **The keeper's late dive is a reaction** (§6.3) | Kept honest by three rules: the arc shows what releasing *now* gives, the wind-up is fixed, and the deviation is a function of the timing, never a roll |

**"No random shot error" holds** (FOOTBALL.md §6, EA FC row). There are no
stats, no spread and no dice. The same release on the same ball gives the same
shot every time, and the shooter's preview draws it.

**Objection, stated once.** Row 1 is a departure from GDD pillar 2, and in
Heads & Volleys a worse outcome *can* be a failure: a mistimed volley that
goes over is an error. That is the cost of a versus game, and it is the
developer's call. What I hold the line on is legibility. After any miss, the
shooter must be able to say *early*, *late* or *aimed wrong*. The P1 gate
measures exactly that.

---

## 5. The shot

### 5.1 Profile

| Parameter | Starting point | Note |
|---|---|---|
| `ShotMinSpeed` | ~12 m/s | The pass's `MaxSpeed`, so a tapped shot is a firm pass |
| `ShotMaxSpeed` | ~22–25 m/s | The demo's pass tops out at 12 m/s. A real struck ball goes 25–30 (FOOTBALL.md §2). Capped below that for the keeper (§6.7) |
| `ShotChargeTime` | = `ChargeTime` | One hold-to-power mapping across the game ([LATER.md](../../LopFBBounce/docs/LATER.md) § roles) |
| Per-part ceiling | `PassProfile.PowerScale` | A header is weaker than a volley, already drawn in the arc |
| `ShotWindUp` | 150–250 ms | Fixed. The body's swing from the release to the contact, and the keeper's tell |

Every value here is tuned in P1. `tuning-analyst` owns them once they exist.

### 5.2 Aim

- The aim point is where the camera's aim ray meets the goal plane, clamped
  into the goal mouth plus `AimMargin`. A target off the frame is allowed:
  aiming wide is the shooter's mistake to make.
- `ShotSolver` takes the strike point, the aim point and the speed, and
  returns the **low** solution through the aim point under the same gravity and
  damp `TrajectorySampler` uses. If the speed cannot reach the point, it
  returns the nearest reachable shot, and the arc draws that clamp.
- The part's loft window still applies (S28). A header cannot be driven
  rising into the top corner from the floor.

### 5.3 The strike window

Releasing the button **starts the wind-up**. Contact happens `ShotWindUp`
later, wherever the ball is then. The release sets the contact moment; the
contact plan still decides the limb, and still decides whether that point is
in reach.

- Each part has a **sweet height**, `SweetHeight[part]`: shin-to-knee for a
  volley, the forehead for a header. The timing error δ is how far the contact
  moment lands from the moment the ball passes the sweet height.
- Quality `q` is 1 when |δ| ≤ `StrikeWindow`, then falls linearly to
  `StrikeFloor` at |δ| = `StrikeSlack`.
- **Power:** the speed for the charge × lerp(`MinPowerScale`, 1, `q`).
- **Accuracy:** the shot leaves on its solved line plus
  `sign(δ) × (1 − q) × MaxPitchError[part]`. Early means the ball is above the
  sweet height, so it is skied. Late means below, so it is topped down,
  possibly into the ground (a bounce, so an illegal goal). The sign per part
  is a table, not a guess. A lateral error is an open question.
- **Beyond `StrikeSlack`**, or with the ball out of the limb's reach at
  contact, there is no strike. The body is seen to swing and miss, and the
  ball carries on under physics (rule 4: a miss, never a stretch).
- **The preview is "release now".** While charging, the arc shows the shot
  that releasing at this instant would produce, δ included. It drifts onto the
  aim point as the ball approaches the sweet height. Nothing oscillates and
  nothing is hidden. The arc stays the one statement of where the ball goes
  (GDD §8 risk 2).
- **Charge and release are one hold.** Full power needs the hold to start
  `ShotChargeTime` before the ideal release. Releasing early for safety costs
  power, which is a judgement, golf-style.

---

## 6. The keeper

### 6.1 A separate verb

**`BallVerb` never gains `Hand`** (LATER.md § roles, rule 4 limits). The
keeper's hands are a **street-only catch verb** with its own rules, usable only
by the player in goal and only inside `KeeperBox` (the size is
`level-designer`'s). Outside the box, and for every foot touch, the keeper is
an outfield body with the normal touch.

LATER.md's three conditions on a dead catch are the contract:
1. **The ball reaches the hands by its own flight.** Nothing eases, snaps or
   magnetises it. The planner tests the ball's sampled path against the hand
   volume. The hands go to the ball; the ball never goes to the hands.
2. **The hands never reach past `BodyModel`.** A new `Hands` `LimbReach` is
   measured from the rig at rest, like the others. Dive reach is that reach
   plus the body's dive travel. Neither is stretched by IK. Out of reach is a
   save the body is seen to miss.
3. **A held ball is visibly frozen, on a clock** (§6.5).

### 6.2 `KeeperPlanner`

Given the ball's trajectory (`TrajectorySampler`) and the keeper's input,
`KeeperPlanner` returns the contact plan for the hands: hit or miss, the
time, the point, and catch or parry. It is deterministic: the same flight and
the same input give the same outcome. `LandingPredictor` drives a bot
keeper's positioning.

### 6.3 Two dives

| Dive | When | Reach | Cost |
|---|---|---|---|
| **Commit** | Any time before the strike, including during the wind-up | Long, `CommitDiveReach` | Locked. The direction is set at input, and it lasts `CommitDiveTime`. Guess wrong and the goal is open |
| **React** | After the strike | Short, `ReactDiveReach` | Starts after `ReactStartup`. Reaches only what a late read can |

Standing, the keeper covers `StandReach` with no dive. Real keepers stay
central about 6% of the time, so the design **rewards reading the shooter**:
the wind-up, the run-up, which foot is playing it. It does not reward
waiting.

### 6.4 Catch or parry

- **Catch:** the ball arrives inside `CatchCore` (the central part of the
  hand volume) at or below `KeeperCatchSpeed`. The ball stops dead in the
  hands. In Heads & Volleys, a catch before the bounce is an error by the last
  toucher.
- **Parry:** any other contact in reach, such as a fingertip at full stretch
  or a ball too hot to hold. The ball leaves along the hand normal with
  `ParryRestitution`. The direction is deterministic, and the ball stays
  live.
- A dive at full extent is always a parry.

### 6.5 The hold clock

A caught ball enters a street-only state, **`Held`**: kinematic in the hands
and written only inside the fixed-step integrator (rule 2). `KeeperHoldTime` runs on
a **visible clock** above the keeper. At expiry the ball is released as a
dead drop at the keeper's feet. Whether that is all, or whether it carries a
penalty, is an open question. Inaction is safe but slow, for the keeper too.

### 6.6 Distribution

- **Throw:** aimed like a pass, flat to lofted, capped by `ThrowMaxSpeed`.
- **Punt:** the ball is dropped onto the instep and struck. High, long and
  capped by `PuntMaxSpeed`.

Both use the same hold-to-power mapping and show an arc. A throw is the most
precise release in the game, because the ball is already in the hands. It is
the chest-hold pass of the keeper.

### 6.7 The fairness budget

| Fact | Value | Source |
|---|---|---|
| Human reaction | ~250 ms | `HumanReaction` |
| One-way network | 50–100 ms | `NetLatency` |
| A 20 m shot at ~22 m/s | flies ~0.9 s | fair: a react dive is possible |
| An 11 m shot at ~30 m/s | flies ~0.37 s | guess-only: the commit dive is the only answer |

**The derivation, to redo when a number moves.** A react save needs a flight
time of at least `HumanReaction + NetLatency + ReactDiveTime`. So the
**shortest distance at which a react save exists** is:

`MinReactDistance = ShotMaxSpeed × (HumanReaction + NetLatency + ReactDiveTime)`

For example, 22 m/s × (0.25 + 0.10 + 0.25) ≈ 13 m. Inside that distance only
the commit dive saves. That is acceptable if it is designed: Luftkönig's
header-only zone is the playground's own answer, and headers are slower
(`PowerScale`). `level-designer` sizes the shooting distances and the zone
from this formula.

**The tell is the wind-up.** `ShotWindUp`, 150–250 ms, is readable and
fixed. It is never shortened by a late release, and it is what the keeper
reads to commit. Online, it is also when the shot event is sent (§8).

---

## 7. Phases and gates

Each gate is a sentence the developer judges after playing. A gate is a
finish line: the next phase does not start until it passes.

| Phase | Builds | Gate |
|---|---|---|
| **P1 Offline striker** | `ShotSolver`, `Goal` (frame, line crossing), the strike window and the release-now arc, all in `packages/domain/src/street/` with tests. You against a static keeper, then a simple bot keeper | *"A volley goal feels earned, not random: after every miss I can say whether I was early, late or aimed wrong."* |
| **P2 Offline keeper** | `KeeperPlanner`: the catch verb, both dives, catch or parry, the `Held` state and its clock, throw and punt. Hand IK and the dive on the body side. Bot shooters | *"When I miss a save I can tell why: I read it late, I went the wrong way, or it was out of reach. It never went through my hands."* |
| **P3 Rules and bots** | `StreetRules` with the preset record, Heads & Volleys first. Local play, with bots in the other slots | *"One full game of Heads & Volleys against bots is fun, and I never had to ask why I was sent in goal."* |
| **P4 Online, 2 players** | `packages/server`, a room code or invite link, touch-event sync, the keeper's authority handoff (§8). Lag simulated at 50, 100 and 150 ms | *"At 100 ms of simulated lag, no save I made on my screen counted as a goal."* |
| **P5 Online, up to 6** | The knockout flow, spectating for players who are out, and the other presets as data | *"A six-player game among friends runs to the end, and nobody asks what just happened."* |

**Nothing is networked before P4.** P1–P3 are offline and testable with
`npm test` and one person at the keyboard.

---

## 8. Netcode stance

This is the summary. The multiplayer architecture in
[`LATER.md`](../../LopFBBounce/docs/LATER.md) § *Multiplayer* was written for
Steam and Godot; its principles hold, and this section is what changes on the
web. **Do not drift toward a client-predicted ball.**

The desktop build will use Steam transport (lobbies, Steam Networking
Sockets) with the same authority model: one authority (a host or a server)
running the domain sim, touches as events, the keeper handoff. Only the Node server, room links and
the browser transport below are web-specific.

- **An authoritative Node server running the shared domain sim.**
  `packages/server` imports `packages/domain`, the same code the browser runs,
  and steps it at 120 Hz. **The domain sim is the truth for every ball**,
  client and server: the three.js mesh only displays it. In the Godot build
  the rigidbody was the truth in the demo level and the domain sim only for
  the networked ball; on the web there is no rigidbody, so that split is gone.
  This is also why the shot and the keeper live in `packages/domain`.
- **Room codes and invite links**, not lobbies on a platform. One player makes
  a room and shares a code or a link; the server holds the room. Hosting is a
  small VPS or Fly.io from P4.
- **The transport is decided at P4:** WebSocket (simplest, TCP, head-of-line
  blocking on loss), a WebRTC data channel (unreliable and unordered is
  possible, but needs signalling and TURN), or WebTransport (unreliable
  datagrams over QUIC, the youngest of the three in browsers and in Node).
  The choice is made with a lag and loss test, not on paper.
- **No lockstep and no ball rollback.** Lockstep makes every player wait for
  the slowest connection. And identical code is not identical numbers:
  `Math.sin` and friends are not guaranteed bit-identical across browsers, so
  clients drift and the server corrects.
- **Touches are events:** the tick, the ball state before, the impulse, the
  spin. Between touches, every client runs the same domain flight sim, and the
  server corrects drift with **sparse snapshots**.
- **The shot event is sent when the wind-up starts.** The fixed `ShotWindUp`
  hides one-way latency.
- **Authority hands off to the keeper in reach.** When the ball enters the
  keeper's reach volume, the keeper's client decides the save, and the server
  breaks ties by tick. This is the fix for Rematch's *"my save didn't count"*.
- **Touch validation:** `BallHistory`, rewound by RTT, with a distance check.
  The server runs the same `BallHistory` the client does.

---

## 9. Open questions

1. **Self set-up.** Can a shooter volley their own keep-up (`SelfSetUp`)?
   Solo P1 needs it. The playground often forbids it at 3+ players.
2. **Which parts finish.** Is a thigh, chest or shoulder strike a "volley"?
   Is a backheel volley allowed (`FinishParts`, `BackheelIsVolley`)?
3. **Walls and frame.** Does a ball off a wall or the post stay clean
   (`WallIsBounce`, `FrameIsBounce`)? Street pitches have walls, so this
   changes play a lot.
4. **Out of play.** Is a ball off the sides an error (`SideOutIsError`), or
   just the keeper's ball?
5. **A parry out.** Is a parry over the line a reset (as written), or a
   corner-style restart for the shooters?
6. **Lateral strike error.** Does timing also pull the shot sideways, and if
   so, from what? The side of the foot that met it is the candidate.
7. **The hold clock running out.** A dead drop (as written), or a penalty?
8. **The rule values.** `StartingLives`, `FinalPlayers`, `MatchTime`,
   `PointsHeader`, `PointsVolley` and `DeadBallTime` all wait for P3.
9. **The goal.** What size is a street goal (`GoalWidth`, `GoalHeight`,
   `KeeperBox`)? Jumpers, a garage door, or a painted frame on a wall? This is
   `level-designer`'s, from §6.7.
10. **Bots.** How good, and how are they made fallible without randomness? A
    bot that errs must err the way a human does: late, early or wrong side.
11. **Local play.** Is P3 one human plus bots, or also split-screen or
    hot-seat?
12. **Keeper jumping.** Does a keeper get a vertical dive or jump for the top
    corners, or does the bar height make that unnecessary?

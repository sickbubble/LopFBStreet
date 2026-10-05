# LopFBBounce — Game Design Document

> **Written for the Godot build** (LopFBBounce, tag `godot-final`, in
> `../LopFBBounce`). The rules hold here. The Godot nodes, the `.tscn` scenes,
> the Inspector and the Remote tab it mentions are history: on the web the
> numbers live in `tools/golden/tuning/*.json` and are edited live in the
> lil-gui panel. S-numbers (S1–S35) refer to that repo's
> `docs/IMPLEMENTATION.md`; M-numbers to its milestones.

Owned by the `game-designer` agent.

**Scope of this document is the current game: single-player, one demo level.**
The 1–6 player co-op, the flow meter, the roguelite run structure and the art
pipeline are designed and deliberately unbuilt — they live in
[`LATER.md`](LATER.md). Nothing here should be read as describing them.

---

## 1. What it is

A street footballer moves through a course keeping a ball alive — bouncing it,
past obstacles in the air and on the ground. Ronaldinho *Joga Bonito* style,
built out of two buttons: one keeps the ball up, one sends it.

**Engine:** Godot 4.7.2, C#, Jolt physics. The architecture avoids Godot's one
disqualifying weakness for this genre — see [`LATER.md`](LATER.md) on why the
ball is host-authoritative when multiplayer eventually lands.

**Locked decisions:**

| Decision | Choice |
|---|---|
| Ball control | Three verbs, two buttons. **Carry** (no input): automatic keep-ups at a level — foot, knee, chest, head — slow, and slower the higher. **Every touch is played by a real body part** — left or right instep, left or right thigh, chest, left or right shoulder, head — which the solver plans before the ball arrives and the body is driven to meet (§3.3). **Bounce** (hold sets height): one commanded touch that sets the level and lifts the speed cap for that flight. **Pass** (hold sets power, camera aims): the launch, fired on the next touch. Every touch aims at where you will be; nothing ever pulls the ball toward you. |
| Perspective | 3D third-person, free orbit camera |
| Fail state | Loose-ball scramble — a drop never ends the run |
| Scope now | Single-player, one demo level, four obstacles |
| Engine | Godot 4.7.2, C# |
| Body | One untextured rigged humanoid placeholder (CC0), scaled to the ball heights. **The body plays the ball** (since 2026-09-21): IK and contact timing put the planned limb on the ball, and a physics reaction layer makes the whole body answer every touch. The capsule stays as a runtime diagnostic toggle. The ball is a sphere. No second character, no textures. Real art is a later milestone. |
| Physics | Jolt. The ball is solver-driven while owned and a real rigidbody always; the body's physical bones react to the ball and never push it. |

---

## 2. Design pillars

The tiebreakers. Every proposal gets judged against these.

1. **Failure changes the game state, it never stops it.** A drop spawns a new
   frantic mode, not a black screen.
2. **No reflex timing anywhere.** The skill axis is judging power and angle —
   golf, not fighting games. A mistimed input produces a *worse outcome*, never
   a *failure*.
3. **Inaction is safe but slow.** You can never lose the ball by doing nothing:
   an owned ball is kept up by automatic touches at whatever level you last
   put it, and standing still never misses. But every level of carry is slower
   than running, and the higher the level, the slower. The way to move fast is
   to touch the ball yourself, every touch.
4. **Air hazards threaten the ball; ground hazards threaten the player.** Two
   independent difficulty dials from one rule.
5. **Every obstacle is keyed to ball height**, which is exactly the axis the
   player controls. That is what makes the level language legible at a glance.

---

## 3. The core mechanic: the bounce

### 3.1 Two buttons, one grammar

There are **two ball buttons**, and they share one grammar: **hold for more,
release to do it.** Neither has a timing window — bar one, and it is optional:
the perfect reception of a loose ball (§5).

**Bounce** (left mouse) — *one touch, yours.* On release, the next touch sends
the ball to the height your hold asked for, forward to where you will be. The
ball stays yours: it comes back down to you, and the level it lands in is the
level you carry at afterwards (§3.2). No aiming; the camera does nothing to it.

| Hold | Apex | Carry level afterwards |
|---|---|---|
| tap – 0.15 s | 0.6 – 1.05 m | Foot — keep-ups off the instep; run under a low overhang |
| 0.15 – 0.3 s | 1.05 – 1.25 m | Knee (the thigh, played at 0.85 m) |
| 0.3 – 0.45 s | 1.25 – 1.75 m | Chest |
| 0.45 – 0.6 s (full) | 1.75 – 2.0 m | Head |

Each level gets an equal quarter of the hold, whatever its height (S25,
2026-09-22), so the knee is as easy to pick as the head.

**Launch** (right mouse) — *send it.* Artillery controls: hold time sets the
power, the camera sets the angle.

- **Camera pitch → launch angle.** Look down for a flat drive, look up for a
  loft — within the window the part that plays it allows (below).
- **Camera yaw → direction.**
- **Hold duration → power.** 0 to 1.0 s, the same hold for every part. A full
  foot pass, aimed up, clears a wall (a little over 5 m, derived in S28);
  aimed low it is a long flat drive. Nothing but a foot pass clears the wall.
  A light tap is the same soft pass off every part — only the top power
  differs.
- **A live arc preview draws the exact trajectory while charging.** This is the
  one statement of where the ball goes. It also solves 3D aiming, which is
  otherwise the hardest usability problem in the game. The charge reads off
  the arc growing, with no sweet spot and nothing that oscillates; a part's
  ceiling reads off where the arc stops growing.
- **There is no power bar**, in the world or in a HUD corner (2026-09-23, the
  developer's call: the in-world bar under the ball said nothing the arc did
  not).
- **The body shows the charge too, and agrees with the arc** (2026-09-23,
  S30). While the button is held the body loads for the part that will play
  the pass:
  - a foot pass opens the hips, sinks the knees and swings the opposite arm
    out;
  - a chest or header bows back with the arms spread;
  - a thigh pass leans back;
  - a shoulder pass dips that shoulder;
  - a backheel leans forward over the ball.

  The load is the arc's own progress. It grows only while the arc grows,
  stops where the arc stops at the part's ceiling, and holds still at full,
  so there is nothing to time a release against. When the plan moves to
  another part mid-charge, the load moves with the arc. After the release,
  the strike swings bigger and winds up earlier with the charge. The
  follow-through finishes after the ball has gone, and a backheel swings
  backward through the ball. The keep-ups carry on under the load and a held
  ball stays held. The body never changes where the ball goes (rule 4).

**Every part passes, and each passes differently** (2026-09-23, S28). The pass
is played by whatever part will play the next touch — the one the contact plan
already names — so a pass from a head carry is a header and a pass from the
chest hold is a chest lay-off. The part sets three things, all shown by the
arc before you release:

| Part | Top power | Longest pass | Loft window | Notes |
|---|---|---|---|---|
| Foot (instep) | full | ~15 m | drive to high loft | The long pass. The only part that clears the wall, and the only one that can over-hit a receiver |
| Head | about three-quarters | ~8 m | flat to lofted | A header: redirects, never drives. From 1.9 m, so it carries further than its power suggests |
| Thigh | about two-thirds | ~6 m | always lifts | The knee strikes upward — no flat thigh pass |
| Backheel | a little over half | ~4.5 m | flat to a little lift | Aimed behind you, from the foot (below) |
| Chest (from the hold) | about half | ~4–4.5 m | flat to a little lift | A lay-off, not a loft. Fires at once, the most precise pass in the game |
| Shoulder | about half | ~4 m | flat to a little lift | Out to its own side only — a flick, never across the body |

Weak parts are weaker, never useless: every part's best pass clears about 4 m,
well outside the possession radius, so a pass off any part genuinely leaves.

**A part's limit is a clamp you can see, never a dice roll.** Aim outside the
window and the arc bends to the nearest pass the part can make; aim a shoulder
across your body and it swings round to the nearest direction that shoulder
can play. There is no random error on any pass: the arc is exact, from any
part, every time (§8, risk 2). Harder parts are harder because what they can
do is smaller, not because they miss.

A launch fires on the next touch, from the level's height, and leaves
possession. That is the difference between the buttons: bounce keeps the ball,
launch risks it. A pass queued for a head or a shoulder is shown as queued
until the ball arrives there, and a shoulder that cannot reach the ball misses
it, like any other part. Both tables are indicative; the real mappings are in
[`IMPLEMENTATION.md`](IMPLEMENTATION.md) S1, S6, S8 and S28.

The bounce is the more frequent action by far, so it sits on the primary
button. If the hands disagree, the two are swappable in the Input Map without
touching the design.

### 3.2 Possession is a radius, not a state you toggle

This is the rule everything else hangs off:

> The ball is **owned** by the nearest player within `PossessionRadius` (≈2.5 m)
> whose touch cooldown has expired.

**While owned, every contact is a touch** (S7): it sends the ball to where
you will be when it next comes down to you. Two kinds:

- **Carry** — the default, no input. The ball is kept at a **level** — foot,
  knee, chest or head — and the four levels are **two different activities**:
  - *Keep-ups (foot).* The instep is the touch — left or right, whichever side
    the ball comes down on, alternating when it comes down the middle. Each
    keep-up pops the ball to about thigh height and just ahead of you; a ball
    that reaches the ground is lifted back up by the foot. Never lost by
    standing still. *(Decided 2026-09-21, built by S17. Until then the ground
    plays the foot touch — a bounce-dribble.)*
  - *Stall (chest, head).* The ball is **held on the body**, not bouncing
    off it. It is not placed there: it carries its own balance, thrown off by
    your acceleration and only weakly drawn back. Run smoothly and it sits
    quiet — constant speed costs nothing, however fast. Cut hard and it comes
    away, falls, and you are back on your feet. A break costs a level, never
    the ball. **A ball that comes off leaves with its own velocity and is never
    eased back.**
    *(The **chest** stall is on since 2026-09-23, S27: a ball down the middle
    of the torso sticks, and the player stays leaned back under it until they
    press. The **head** stall came back the same day (S29): the ball rests on
    the forehead with the head tilted back, and it is the most fragile hold on
    the body. **The knee does not stall**, by the developer's call: it keeps
    the ball up like the foot, knee to knee — each touch sends the ball across
    to the other knee, so each knee rises in front of its own hip and the two
    never meet in the middle.)*
  - *Shoulders (S27).* The torso is the one level with a choice in it. A ball
    coming down the **centreline** is chested, and sticks; one coming down
    **out past your shoulder** is bounced off that shoulder and sent straight
    back to it. It is the same rung of the ladder — same pace, same apex — and
    it is how you keep a ball alive at chest height without stopping it. A
    footballer does both, and the difference between them is where the ball
    is, not what you press.

  **Your speed is capped by the level**, foot ≈0.6 down to head ≈0.3: a
  footballer juggling on his head walks. High is slow, precise and fragile; low
  is fast, loose and committed.
- **Commanded touch** — you pressed the bounce button. On release the *next*
  touch is yours: to the height your hold asked for, forward to where you will
  be, at full speed rather than the level's. The carry that follows is at the
  level the apex lands in (§3.3). A tap from a high level is a drop: the ball
  falls to the foot. Pressing is how you go fast and how you change level; they
  are one act.

**Pressing at the level you are already on is the re-settle.** Your stall is
drifting and about to go; you tap, the ball pops a few centimetres off the body
and comes back under control. It costs you the moment the ball is off you, and
it is the only say you have over a break. A pass from a stall fires *now*,
because the ball is already on the body — and it is the most precise shot in the
game, since there is no flight whose landing has to be guessed.

**The cap follows the ball, not the button.** Your speed is the level's while
the ball is at your body, and lifts to full as it gets away from you — a
knock-on frees your legs because the ball is genuinely three metres ahead and
you are running onto it, not because you pressed something. So a sprinting tap
at the feet is fast, and a tap at head level moves the ball ten centimetres and
buys you nothing. There is no way to sprint while juggling on your head, which
is the one thing football is blunt about.

**A touch gathers the ball; it never fetches it.** Each touch takes out part of
however far the ball has drifted — most of it at the head, less than half at the
feet — so a ball knocked out of position comes back over several touches and the
rest is yours to run down. A touch that put the ball back on the hold point in
one go was the invisible string arriving once per bounce instead of once per
frame, and it is what survived two rewrites aimed at it. You can never lose the
ball standing still: the drift shrinks every touch. You can absolutely be made
to work for it.

**The ball never chases the player.** No easing toward the body, on the ground
or in the air. A ball between touches is a rigidbody with a weak lean toward
your intended direction, nothing more. The landing ring is where to run. This
is the one rule every football game agrees on
([`IMPLEMENTATION.md`](IMPLEMENTATION.md) S7 has the precedent).

**Reach is the body's.** A touch fires only if a limb can get to where the ball
comes down — the leg from the hip, the chest, the head (S16) — and never from
behind you (S13). Standing still it always does. *(Until S16 lands, reach is
the `KeepUpReach` arc, ≈1.5 m — well past what a leg reaches, which is part of
why the body could not be made to match.)* Miss — cut hard at foot
pace, stop under a knock-on — and the ball carries on under physics, falls,
rolls; the next time it is on the ground within reach the foot picks it up. A
miss costs a level, never the ball. Only leaving the radius loses it.

**No request has a timing window** — except the first touch of a loose ball,
where a tap as it arrives is the perfect reception (§5), and missing it costs
nothing but the perfect part. A bounce or a launch released at any moment is
consumed by the next touch. You cannot mistime a touch, only mis-size it. The
keep-up is automatic; the level and the pace are not.

**Leaving possession:** the launch, on the next touch, sends the ball into
**flight** — real physics, no lean, fully droppable. Running out of the radius
also releases it, into **loose**.

The consequence: **inaction is safe but slow.** The fast way through the level
is the risky way, and the risk is chosen bounce by bounce.

It was rewritten twice on 2026-09-16, before the gate was judged once; the
history is in §8, risk 1. This is the last rewrite before the gate.

### 3.3 Body parts are output, not input

The head/chest/thigh/foot vocabulary survives, but as the *result* of the charge
rather than a separate choice. The resulting height picks the physics flavour —
built as of S9, where it is two numbers per level, the lead and the correction.
The levels are a property of the game, not of the body — obstacle heights
derive from them (§6) — so a character is scaled to fit the ladder, never the
reverse.

**And the body plays it** (2026-09-21, S16). One rule governs the body:

> The solver decides what the ball does, and which limb plays it, when and
> where — and says so **before** the contact. The body is driven to meet that
> plan. Nothing in the body writes the ball, gates a state, or feeds a bone back
> into a solver.

The solver can do this because it authored the ball's arc: at every touch it
already knows where and when the next one will be, about half a second ahead.
So the side is decided (the ball comes down on your left, the left foot plays
it; down the middle while standing, the feet alternate), the limb is put there
on time — IK, a strike path, a pose — and the whole body reacts to the contact
through a physics layer. The ball never goes to the body; the body goes to the
ball, and a ball no limb can reach is a miss, never a stretch.

| Resulting height | Part | Side | Flavour |
|---|---|---|---|
| < 0.5 m | Foot (instep) | left / right | Flat, fast, topspin |
| 0.5–0.95 m | Thigh | left / right | Short pop, keeps it close |
| 0.95–1.45 m, on the centreline | Chest | — | **Holds it** — the one part that stops the ball |
| 0.95–1.45 m, out past the shoulder | Shoulder | left / right | Short pop, back to the same shoulder |
| > 1.45 m | Head | — | High arc, low forward speed |
| aim behind facing | Backheel | — | Reverses direction |

The full visual variety of freestyle football from two buttons. A carry level
*is* a body part; a launch fires from the level's height, which is why a pass
from a head carry is always a header. **And the part that plays the pass sets
what the pass can be** — its power, its loft window, its spin, and for a
shoulder its side (§3.1, S28). The part is still output, never chosen: to make
a long pass, drop the ball to your feet first.
Backheel is the only aim-derived special, and it is discoverable by accident —
which is how it should be found.

Implemented as `VerbBands.VerbFor(height)` in
`domain/Tuning/BallSettings.cs`.

---

## 4. The three ball states

```
   POSSESSION ──launch, on the next touch──► FLIGHT ──enters radius under CatchSpeed──► POSSESSION
   (safe: kept up at a level)                (vulnerable)
   carry ⇄ commanded touch                        │
        ▲                                         ▼ lands with nobody in radius
        └──── walks into the radius ─────────── LOOSE (rolling, hazard-exposed)
```

**POSSESSION** — kept at a level by automatic touches (slow, by level) or sent
on by a commanded touch (full speed, one flight). Cannot be lost by inaction; a
missed touch drops the level, not the ball.

**FLIGHT** — unowned, full physics. **Air hazards live here.** This is the only
place the ball is genuinely at risk, and also the only way to make progress.
That coupling is the whole design.

**LOOSE** — hit the ground with nobody in range. Keeps its momentum and rolls.
Still live, now exposed to ground hazards. Walking into the radius recovers it.
Losing a loose ball respawns it at the last checkpoint — **it never ends the
run.**

`domain/Ball/BallState.cs`.

---

## 5. Reception

Auto-catch, **with a speed cap**, and **a first touch the body plays** (S24,
2026-09-22):

| Arrival | Result |
|---|---|
| Under `CatchSpeed` (≈9 m/s), inside the radius | Owned, and **trapped** by the highest part that can reach it on the way down — chest, thigh or foot, never the head — or scooped off the floor. The body takes the last step to it, never a chase. An untimed trap takes the ball to the feet and is heavier the faster it came: it pops higher and comes off the way it came in. **Always works**: the ball is under control after it, and the body follows it. |
| Over `CatchSpeed` | Ricochets off the body. Comedy. Now a loose ball. *(M1, with the pass.)* |
| Bounce button released as it arrives (±0.12 s) | **Perfect reception** — clean, no rebound, momentum kept, straight into keep-ups at the level the hold asked for. A fraction late still counts: the second touch settles it |

This makes **power management the skill**, not reflexes: an over-hit shot is a
mistake of judgement rather than reaction. The optional perfect-catch tap raises
the ceiling without raising the floor.

Matters less in single-player than it will with teammates, but it is what makes
a rebound off a wall land cleanly. Solver in
[`IMPLEMENTATION.md`](IMPLEMENTATION.md) S5.

---

## 6. Obstacle grammar

Every obstacle is keyed to ball height, which is the axis the player controls.
That makes the whole level language legible in one glance.

| Primitive | Demands | In the demo level |
|---|---|---|
| **Low overhang** | Keep the ball in dribble. Run under. | yes — first |
| **Ground hurdle** | Jump it. Threatens the player, not the ball. | yes |
| **Moving hazard** | Time the bounce so the ball is high or low as it sweeps past. | yes |
| **High wall** | Full loft over it; run around through a gate and receive on the far side. | yes |
| **Gap / pit** | Long flat drive across; sprint; catch on the other side. | later |
| **Height corridor** | Ceiling *and* ground spikes — the ball must thread a narrow band. The signature obstacle. | later |
| **Wall rebound corner** | The only way round is off a surface. | later |

**Teaching order does most of the work for the M1 gate.** Overhang first,
because the *default* state already solves it — it teaches "the level reads ball
height" at zero cost. Then the hurdle (new verb: jump). Then the sweeper (new
verb: time it). Then the wall (new verb: loft, and leave the ball). Each adds
exactly one thing. An obstacle that needs explaining has failed.

**Heights are derived, not chosen.** The overhang must clear a dribble bounce
and reject a chest-height one. If tuning moves `FootApex`, the overhang
height is wrong until it is re-derived. Since 2026-09-24 every band is
computed by `CourseHeights` and checked at boot (IMPLEMENTATION S31).

**The demo level's forms (the developer's call, 2026-09-24).** The level is
Laundry Lane, an Istanbul backstreet.
- **Low overhang:** a washing line with laundry hanging from it. It blocks the
  ball only; the body passes through it. There is no crouch verb.
- **Ground hurdle:** a storm drain, a gap the player jumps. The ball floats
  over at any level.
- **Moving hazard:** a shopkeeper's hose. It sweeps a low fan of water across
  the lane, which catches a foot keep-up and passes under a knee carry.
- **High wall:** a courtyard wall with an arched gate beside it.

The layout is in [`LEVEL.md`](LEVEL.md).

---

## 7. Camera and readability

3D third-person, free orbit. The known cost is that ball height is hard to read
in 3D. Three mitigations, all **mandatory, not polish**:

1. **Ground shadow** under the ball, scaling with height.
2. **Landing marker** — the predicted touchdown point. Without this, 3D juggling
   is a camera problem rather than a difficulty curve.
3. **Arc preview** while charging — the trajectory you are about to send,
   solved for the part that will play it (§3.1).

Plus a **soft ball-tracking camera** that leans toward the ball only once it is
genuinely overhead, weakly enough that it never steals aim.

**Trial camera modes** (IMPLEMENTATION M1.C1): C cycles Chase / Street / High /
Sideline / Shoulder, each a different framing aimed at one obstacle. They are
tuning tooling. Chase is the default and the game's camera until the developer
promotes another. Every mode changes the *view* only: the aim is the rig's
yaw and pitch nodes, never the rendered camera, so camera pitch → launch angle
and camera yaw → direction hold in every mode, and the lean no longer touches
the aim at all.

A fourth channel: the body itself. A human silhouette is the strongest scale
cue there is, and since 2026-09-21 it is also the thing that visibly plays
every touch — which foot, which part. It still replaces none of the three
above, and the `balance` bar is not retired because the body leans: the ball's
rules must stay readable with the body switched off, which is what makes the
capsule run a usable diagnostic (§8, risk 5).

---

## 8. Risks

1. **Bounce feel.** If running-while-juggling is not satisfying with zero
   obstacles present, obstacles will not fix it — they are built on top of it.
   First thing to build. This is why M0 exists.
   *History:* the first build (2026-09-16) auto-bounced the ball on every
   contact with a single aimed-launch button. The developer's first minutes on
   it produced one sentence — *"I wanted to press to bounce"* — and §3.1/§3.2
   were rewritten to the two-button, carry-or-bounce design before the gate
   was judged. The third playtest, same day: *"the ball is not moving with
   me, it is following me"* — the bounce went straight up and the in-air
   easing dragged the ball after the player. Fixed by making every bounce a
   touch aimed at where the player will be (S7), the way FIFA, FIFA Street
   and Rocket League all do it. The fourth, same day: the ground carry — a
   dead ball eased to a hold point — *"follows from behind"*, the same chase
   S7 had just removed from the air, and *"the player may carry the ball on
   chest, on knee, on feet or on head."* §3.2 was rewritten a second time
   before the gate: the carry is automatic keep-ups at a level, each an S7
   touch, on the ground or off any body part; the bounce commands one touch
   and sets the level; the launch fires on the next touch. No button added,
   no easing left anywhere (S8). The auto-bounce toggle went with it — an
   automatic keep-up is what it was, minus the level and the button.
   **This is the last rewrite before the gate is judged.** If it fails, that
   is a finding about touch-and-run-onto-it, not a request for a fifth carry
   model. *2026-09-17:* the rigged placeholder body arrives before the gate,
   at the developer's call — not a rewrite, a lens. See risk 5 for what it
   costs. *2026-09-21:* the body plays the ball (S16–S22). Not a fifth carry
   model either: the ball's rules — the levels, the touch, the stall, the miss
   — are unchanged, and the body is made to meet them. The one change to the
   ball itself is the foot, which is now played by the instep instead of the
   ground (S17).
2. **Arc preview accuracy vs drag.** If the preview lies, players stop trusting
   it and the control scheme collapses. Either keep drag low enough that the
   preview is honest, or make the inaccuracy visible so the lie is a designed
   one.
3. **Readability in 3D.** Mitigated by §7, but those three things are load-
   bearing and cutting any of them re-opens this risk.
4. **Obstacle legibility.** A first-time player must read what an obstacle wants
   without being told. Teaching order and unmistakable materials are the levers.
5. **Animation masks the mechanic.** A limb swinging near the ball reads as
   *having hit it*, and a positional snap reads as a *deliberate reach* — which
   is precisely the defect that survived S7 and S8 and was caught only in S9.
   A body is that bug's camouflage, and sports games lose months to it.
   *2026-09-21:* the body now plays the ball, at the developer's call, so
   keeping it away from the ball is no longer the guard. The guards are:
   **IK only inside the limb's reach** — the planner decides reach, and a ball
   out of it is a miss that the body is seen to miss, never a stretched limb or
   a ball nudged toward one (a foot reaching for a ball it could not reach
   *would* be the invisible string rendered); **the plan is drawn on the
   capsule** as a marker, and **F1 still swaps the capsule back at runtime**,
   so every complaint can be split — wrong on the capsule too means the solver
   or the planner, right there and wrong on the body means the body; the model
   stays grey and untextured. The gate is judged on the body. The tells that
   you are judging the animation rather than the ball still hold: your report
   has adjectives about the player and none about the ball; you have stopped
   watching the landing ring; you like it better standing still than moving;
   after a break you cannot say why it came off.
6. **The reaction layer on Godot.** Godot has no built-in powered ragdoll, and
   community reports say 4.6 broke an older force-based approach. S22 is
   spiked on 4.7.2 + Jolt before it is built; if the spike fails, the same
   contact event drives a procedural spring reaction instead. The body reacts
   either way — only the technique changes.

---

## 9. Open questions

- Does the possession radius need a visible ring, or does that make it look like
  a board game?
- Should the arc preview show the *full* bounce chain or only the first arc?
- Does the player need a slide or dive to recover a loose ball?
- Are checkpoints per-obstacle or more sparse?
- Should sprint be blocked entirely while carrying, rather than scaled? Scaled
  is the M0 answer because it keeps one rule; blocked may read more clearly.
- Standing keep-ups down the middle alternate feet (S16). Should a player have
  a preferred foot instead — or as well — the way real footballers do?

---

## Appendix — build status

**Written and tested, engine-free** (`domain/`): possession arbitration with
margin-and-dwell hysteresis, the touch — carry levels, the crossing trigger,
reach, the commanded bounce, the drop and the aim — the level speed ramp,
ballistics, landing prediction on flat ground, the launch solver with the
backheel rule, the verb bands, the camera lean, the ball-position ring buffer,
and the audio volume curve.

**Written, untested by design** (`game/`, thin adapters): the ball, bounce,
possession, player, camera, the two ball buttons, markers, HUD, the M0
composition root, and the animator and touch-point gizmo for the rigged body
(S11), each with a scene contract. The POSSESSION / FLIGHT / LOOSE transitions
live in `BallController`. The carry-level coherence check runs at boot against
the loaded tuning resource.

**Built in the editor:** the six M0 scenes, verified headlessly, and the rigged
mannequin under `Model/Character` (locomotion and the jump only).

**Also written and tested (2026-09-23):**
- The body playing the ball, S16–S29: the contact plan, every part's strike,
  the reaction layer, the follow, the first touch, and the stalls.
- The pass by part (S28) and the arc preview (S4).
- Reception of a ball too hot to catch (S5): the ricochet off the body, and
  the timed catch.

**Not written:** most of the level: the obstacles, the checkpoints and the
run director. The obstacle forms are decided (§6, 2026-09-24), and their
bands are derived and tested (`CourseHeights`, IMPLEMENTATION S31). The wall
height (M1.Q3) is a pick inside its band, and it is still open.

**Played:** M0 closed 2026-09-23 on the developer's judgement. The pass check
passed the same day, after one fix: the launch pitch now maps from camera
pitch through `AimLoftOffset`/`AimLoftGain`.

---

## Next deliverable

Small improvements to the pass, then the level: **a first-time player clears
it in under five attempts, told only "keep the ball alive, get to the end."**

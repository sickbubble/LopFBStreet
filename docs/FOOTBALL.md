# Football — the reference brief

> **Written for the Godot build** (LopFBBounce, tag `godot-final`, in
> `../LopFBBounce`). The rules hold here. The Godot nodes, the `.tscn` scenes,
> the Inspector and the Remote tab it mentions are history here: on the web
> the shipped numbers are in `tools/golden/tuning/*.json` and are edited live
> in the lil-gui panel. S-numbers (S1–S35) refer to that repo's
> `docs/IMPLEMENTATION.md`; M-numbers to its milestones.
>
> The web build is a concept test and plays a lean stand-in for the touch
> ([`IMPLEMENTATION.md`](IMPLEMENTATION.md) § *Stand-ins*). The football here
> applies to both builds; where it judges the touch, it judges Godot's.

Owned by the `game-designer` agent. Read by all five.

This is what an agent working on LopFBBounce should know about football that is
not in the code: how a real ball behaves, how a footballer actually keeps one up
and runs with one, and what the reference games settled before us.

---

## 1. How to use this

**Realism is evidence, never authority.** [`GDD.md`](GDD.md) wins every tie.

Use this file to *argue* and to *diagnose* — "a real keep-up rises about thigh
height, so `FootApex` 0.40 is right and 1.0 would be a beginner punting it" is a
usable sentence. Do not use it to *correct* the design toward simulation. The
departures below are deliberate, load-bearing, and were each paid for with a
playtest:

| The game does | A real ball would | Why |
|---|---|---|
| One timing window, and it is optional: the perfect reception | Reward a well-timed foot on every touch | GDD pillar 2 — the skill axis is judging power and angle. Golf, not fighting games. GDD §5's first-touch tap (S24, 2026-09-22) raises the ceiling and never the floor: an untimed trap still keeps the ball. The GDD wins this tie; this row said "no timing window anywhere" until then |
| Never pull the ball toward the player | — | The ball is a rigidbody with a weak lean. Three playtests killed every version of a positional pull; see [`TUNING_LOG.md`](TUNING_LOG.md) |
| The body follows the ball between touches | Let your legs do what you tell them | S23 (2026-09-22). Every football game locks the dribbler's body to the ball between touches and applies new input at the next touch — FIFA's dribble is this. It is the body going to the ball, never the ball to the body, so it is not the rejected string |
| Aim each touch at where you *will* be | Go where it was hit | S7. The one place the game is unphysical on purpose, and what makes running with the ball work at all |
| Four fixed apexes, 0.40 / 0.90 / 1.40 / 1.90 | Be continuous | A legibility ladder, not a physiological one. The player must be able to *read* which level a hold will give |
| A miss costs a level, never the ball | Cost you the ball | GDD pillar 1 — failure changes the state, it never stops it |

If a proposal's only justification is "that is how real football works", that is
not a justification. If its justification is "that is how real football works
**and** it makes the level language more legible", that is one.

---

## 2. The real ball

A FIFA size 5 ball. Values marked **in code** are already the game's numbers and
should not be changed for a reason that amounts to "realism".

| | Value | |
|---|---|---|
| Circumference | 68–70 cm | → radius ≈ **0.11 m**, **in code** (`Radius`, and the `SphereShape3D`) |
| Mass | 410–450 g | → **0.43 kg**, **in code** (`Mass`) |
| Pressure | 0.6–1.1 bar | reference |
| Rebound, 2 m onto steel | 135–155 cm (FIFA Quality Pro) | → COR ≈ 0.82–0.88 on a hard surface |
| COR at a 1 ft drop | ≈ 0.78 | the ball's `Bounce` is **0.72** — a shade duller than concrete, which is right for a street pitch |
| COR at a 5 ft drop | ≈ 0.74 | **restitution falls as impact speed rises** |
| Struck-ball speed | 25–30 m/s | the game's `MaxSpeed` is **12 m/s** — a firm driven pass, not a shot |
| Sprint (player) | ≈ 8–9 m/s | reference, for reading `TouchLeadPerSpeed` |
| Jog (player) | ≈ 3.5 m/s | reference |
| Drag coefficient | ≈ 0.05 at 20 m/s, ≈ 0.35 at 30 m/s | the drag crisis — **not monotonic**. Reference only; the game has linear damp |
| Magnus, 8–10 rev/s at 25–30 m/s | ≈ 3.5 N of lift, ≈ 4 m of curve over 30 m | reference. `LaunchSpin` is 6.0 rad/s ≈ 1 rev/s — visual and landing friction, not aerodynamic |
| Knuckleball, no spin | wanders ≈ 27 cm, unpredictably | reference. Worth knowing the effect is real before anyone asks for a "wobble" |

Two of these earn their keep immediately.

**Restitution falls with impact speed.** A constant `Bounce` is the wrong model
of a real ball — a hard impact keeps proportionally less of it. The game does not
simulate that and does not need to, but it is why "a hard landing feels too
lively" is a plausible complaint rather than an imaginary one.

**Drag is non-monotonic.** Nobody should add a drag term "for realism" expecting
textbook air resistance. Above 20 m/s a real ball gets *draggier*, not less.

---

## 3. Keep-ups and carrying

The carry (GDD §3.2) is keep-ups. Here is what the body is actually doing.

**The touch.** Contact is the instep — the laces, between midfoot and toes — with
the ankle locked, and the lift comes from the knee rather than from a swing. A
locked ankle is what makes the pop repeatable; a loose one is what makes it spray.
The ball is met a hand's width or two off the ground, before it lands, and the
standing leg stays planted. Juggling in place, most players alternate feet;
running, they use the foot that is already swinging forward. **Since 2026-09-21
this is the game's foot level** (S17): the instep plays the ball, left or right,
where until then the ground did.

**The height.** The ball rises to roughly thigh height, about **0.45 m**, and
**no higher than necessary**. This is the single most useful fact in this file.
Good juggling is low, quiet and boring to watch. Punting it head-high between
touches is what a beginner does, because a high ball buys thinking time at the
cost of all control. `FootApex` 0.40 m is a competent footballer's keep-up; a
value near 1.0 would look like someone who cannot do it.

**The surfaces.** Foot, thigh, knee, chest, shoulder, head. Never hand or arm —
which is exactly why `BallVerb` has the members it has, and why there is no catch.

**The ladder is real.** Each level up is genuinely slower and more committed:

| Level | What the body is doing | Why it is slower |
|---|---|---|
| Foot | Small instep pops, ball just ahead | Barely interrupts the stride — this is the fast one |
| Thigh / knee | Knee drives up into the ball | Each touch costs a step's worth of balance |
| Chest | Chest arched back, ball cushioned and popped | You must square up and lean; you cannot do it at pace |
| Head | Neck and legs, eyes up and off the ground | A footballer juggling on his head **walks**. There is no running version |

So `FootSpeedFactor` 0.6 down to `HeadSpeedFactor` 0.3 is not an arbitrary
penalty curve — it is the real thing. A proposal to flatten it is a proposal to
make chest and head juggling something a footballer cannot actually do.

**Where this bites the design.** The higher you carry, the more air the ball has,
which is what clears an obstacle — but the slower you move, which is what costs
you the course. High is slow and agile; low is fast and committed. That trade is
the skill ladder, and it comes from the sport rather than from a spreadsheet.

---

## 4. Running with the ball

**The cadence.** A player speed-dribbling touches the ball **every five to eight
steps, in stride, almost always with the same foot**, keeping it out in front and
running onto it. Not every step. Not a ball glued to the boot.

That sentence is this game's core loop stated in coaching language, and it is
independent confirmation that S7 is right: **the player runs onto the ball; the
ball never comes to the player.** The pre-S7 model, where the ball eased toward
its owner, was not a tuning mistake. It was a different sport.

**The taxonomy.** Three distinct things get called dribbling:

| | Player speed | The touch |
|---|---|---|
| Short dribble | Low | Frequent, ball within a stride — close control, beating someone |
| Break dribble | Accelerating | One big touch past the defender, then a race |
| Long dribble | Steady and high | Repeated contacts, ball a long way out front |

The game's version: a carry at a level is the short dribble; a commanded touch
while sprinting is the break dribble.

**The knock-on.** Knocking the ball several yards ahead to win a footrace — you
give up control for a burst of speed, and you have to get there first.
`TouchLeadPerSpeed` is the knock-on knob, and its two failure modes are football
failure modes: too short and you run into your own ball, too long and it gets
away and you have given it to nobody.

**Passing off each surface.** Real ranges, and the ratios S28's pass
profiles are drawn from (2026-09-23). The metres are coaching-level
estimates, not measurements. The ratios are what matters:

| Surface | Real pass range | Real × instep | What it can do | Game `PowerScale` | Game × foot (45°) |
|---|---|---|---|---|---|
| Instep / laces | 35–45 m, driven or lofted | 1.0 | Everything: flat drive to high loft, topspin | 1.00 | 1.00 (14.7 m) |
| Head | 15–20 m | ~0.45 | Redirects, lofts; cannot drive, no roll | 0.74 | 0.55 (8.0 m) |
| Thigh / knee | 8–12 m | ~0.25 | Always up — the knee drives into the ball | 0.65 | 0.42 (6.2 m) |
| Backheel | 5–10 m | ~0.2 | Flat or popped, behind you | 0.58 | 0.34 (4.9 m) |
| Chest | 5–8 m | ~0.15 | A lay-off off an arched chest; pushed, not lofted | 0.55 | 0.30 (4.4 m) |
| Shoulder | 3–5 m | ~0.1 | A flick to its own side; rarely on purpose | 0.53 | 0.28 (4.1 m) |

The real ratios set the **order**. The game **compresses the spacing**, and
the scale multiplies only the top speed (every part keeps `MinSpeed`). The
first table (2026-09-23) followed the real ratios closely: the shoulder got
12% of the foot's range, 1.8 m, less than a touch lead. It played as broken
rather than weak. A real chest lay-off of 5–8 m is the floor the weak parts
were raised towards, so every part's best pass clears about 4 m. A legible
ladder of bar lengths matters more than the real ratio (§1: realism is
evidence).

---

## 5. The first touch

Reception (GDD §5, spec S5, **not yet built**) is the first touch, and the sports
games have already worked out what makes one hard. EA FC grades a first touch's
difficulty on six factors:

1. **Ball speed relative to the player's** — not absolute. Running onto a fast
   ball is easier than being hit by one while stationary.
2. **Ball height** — chest and thigh are harder than a rolling ball.
3. **Requested exit angle** — killing it dead is easy; turning it 90° is not.
4. **Pressure** — nobody near you, no problem.
5. **The body part used** — a consequence of 2, and why the verb is output rather
   than input here.
6. **How far the player had to stretch** — reach is part of difficulty.

The game currently has **one of the six**: `CatchSpeed` 9 m/s, absolute rather
than relative. That list is the natural spec for `ReceptionSolver` when M1 gets
there. Factor 4 does not exist in single-player and factor 6 is `KeepUpReach`
wearing a different name — so the honest gaps are 1 (make it relative), 2 and 3.

This matters more than it sounds. GDD §5 wants an over-hit pass to be *a mistake
of judgement rather than reaction*. The six factors are how a judgement error is
made legible: the player can see, before releasing, that they are asking for a
hard touch.

---

## 6. The lineage

What each reference settled, and where the repo already leans on it.

| Reference | What it does | What it settles here |
|---|---|---|
| **EA FC / FIFA** | The touch pushes the ball ahead of the run. Controlled Sprint knocks it several yards to win a footrace | S7 and the knock-on. Already cited in [`IMPLEMENTATION.md`](IMPLEMENTATION.md) S7 |
| **FIFA Street** | The "invisible string" — a stationary ball stays glued to the player | **Rejected**, and precisely what `HorizontalEase` and `CenteringGain` reintroduced by accident. Cited in S7 as the anti-pattern |
| **Rocket League** | Applies an extra impulse to the ball centre that deliberately violates Newton's third law — momentum is not conserved — purely so hits feel good. Plus a 0.35 vertical dampening of the contact normal | The licence to be unphysical in service of control. **Condition: the result must stay predictable.** Players never notice non-conservation; they notice a ball they cannot predict |
| **Rocket League's ball cam** | Frames car and ball together; too close loses the field, too far loses your own body | GDD §7. The camera must show the ball's apex *and* the next obstacle, which is why `BallTrackingCamera`'s bias is weak and late |
| **Football games generally** | The ball is physics-simulated; the players are kinematic animation. For a controlled touch the ball's path is computed (or the ball rides a foot or hand socket and is released at the contact frame), and the animation is chosen and adjusted so the limb arrives | The ball is the simulation, the player is the puppet. Matches the split here exactly — `RigidBody3D` ball, `CharacterBody3D` player — and S16 is the "limb arrives" half: the solver plans the contact before it happens and the body is driven to meet it |
| **FIFA 12's Player Impact Engine, Unreal's Physical Animation, PuppetMaster** | A physics layer over the animation: a powered ragdoll that follows the pose and reacts to impacts | The precedent for S22, the reaction layer. In every one of them the physics layer *reacts*; it does not decide a controlled touch |
| **Xie, Starke, Ling, van de Panne — *Learning Soccer Juggling Skills*, SIGGRAPH 2022 (UBC + EA)** | A physics-simulated character that juggles by foot, knee, chest and head and does stalls, controlled by a neural network trained with deep reinforcement learning | Proof that a ragdoll *can* be the authority on the touch — as a research result. It is why this game's ragdoll reacts and does not decide: a physical leg striking a physical ball turns tiny timing differences into different outcomes, which is pillar 2's failure and the Rocket League row's condition — *the result must stay predictable* — broken |
| **Golf, Worms, Angry Birds** | Artillery: pick power and angle, no timing window, and the trajectory preview is part of the contract | GDD pillar 2's actual genre. Angry Birds' dotted arc is the precedent for the arc preview, S4. Golf's club selection (the same swing and the same meter, with a different maximum per club) is the precedent for S28's per-part bar length |
| **PES / eFootball free kick** | A direction arrow plus a power gauge, set before the kick | The arc replaces the arrow, because a flat arrow hides the landing when pitch is the angle. The gauge was built as S28's in-world bar and removed 2026-09-23: the growing arc shows the charge |
| **EA FC pass error** | Pass accuracy rolled from stats, weak foot, ball height and pressure; headed and volleyed passes are less accurate | **Rejected** for the roll. A random spread makes the arc lie. The body-part difference is kept, as an exact clamp the preview draws (S28) |
| **Mario Strikers** | A charge meter with a timing sweet spot | **Rejected** — pillar 2 |
| **Endless runners** | A 20–40 s loop, a warm-up zone that cannot be failed, obstacles telegraphed enough to react to | GDD §7 and M1's teaching order. The genre's failure mode is *"I died because I couldn't see what hit me"* |

---

## 7. Glossary — football word to codebase name

When the developer says the left column, the code means the right.

| They say | The code calls it |
|---|---|
| Keep-up, keepie-uppie, juggle | The automatic carry touch — `BounceSolver`, `TouchKind.KeepUp` |
| Carrying it on his chest / head | `CarryLevel`, named by `BallVerb` |
| Knock-on | A commanded tap while sprinting — `TouchKind.Bounce` with the speed cap lifted |
| Drop it to the feet | A tap from a high level — `TouchKind.Drop` |
| First touch, trap, cushion, kill it | Reception — `ReceptionSettings.CatchSpeed`, and `ReceptionSolver` when it exists |
| Keep-ups on the instep | Foot-level carry. Played by the instep from S17; before it, the ground played it (a street bounce-dribble, `FootApex` 0.40) |
| Left foot / right foot / weaker foot | The limb in the contact plan (S16). The side is where the ball comes down; down the middle, standing, the feet alternate |
| Loft it, chip it | Launch with the camera pitched up |
| Drive it, hit it flat | Launch with the camera pitched down |
| Backheel | Launch aimed more than 110° from facing, at foot height — `LaunchSolver` |
| Header | A pass from a head carry. The verb follows the height, always |
| Lay-off, chest pass, knee pass, shoulder flick | A pass played by that part — `PassPart` and its `PassProfile` (S28) |
| Loose ball | `BallState.Loose` |
| On a string | The FIFA Street failure. Impossible since S8 — if it happens it is a `BounceSolver` bug, not a value |
| It got away from me | The ball left `PossessionRadius`, or `KeepUpReach` was too tight to catch it |
| I tripped over it | The touch lead was too short — the ball came down where the player already was |

---

## Sources

- Ball spec and the rebound test — [FIFA Quality Programme rebound standard](https://iopscience.iop.org/article/10.1088/1757-899X/1101/1/012037/pdf)
- Restitution falling with impact speed — [Coefficient of restitution of sports balls: a normal drop test](https://iopscience.iop.org/article/10.1088/1757-899X/36/1/012038)
- Bounce, spin and COR of a football — [Cross, *Football*, University of Sydney](https://www.physics.sydney.edu.au/~cross/PUBLICATIONS/49.%20Football.pdf)
- Drag crisis, Magnus lift, knuckleball — [*The physics of football*, Physics World](https://physicsworld.com/a/the-physics-of-football/) · [Britannica, why a football swerves](https://www.britannica.com/sports/Why-Does-a-Football-Swerve)
- Keep-up technique and heights — [Keepie uppie](https://en.wikipedia.org/wiki/Keepie_uppie) · [Freestyle football](https://en.wikipedia.org/wiki/Freestyle_football) · [Juggling with a pro freestyler](https://soccerzoneusa.com/blogs/blog-zone/5-secret-tips-to-improve-your-soccer-juggling-with-a-pro-freestyler)
- The five-to-eight step cadence — [Speed dribbling, Coaching American Soccer](https://coachingamericansoccer.com/intermediate-soccer-skills/soccer-speed-dribbling/) · [Dribble taxonomy, video analysis study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10405817/)
- First-touch difficulty factors — [EA SPORTS FC 26 Pitch Notes: gameplay deep dive](https://www.ea.com/en/games/ea-sports-fc/fc-26/news/pitch-notes-fc26-gameplay-deep-dive) · [PhysicsFC, arXiv](https://arxiv.org/html/2504.21216v1)
- Rocket League's non-conserving feel impulse — [smish.dev, ball simulation](https://www.smish.dev/rocket_league/ball_simulation_3/) · [Designing game feel: a survey](https://arxiv.org/pdf/2011.09201)
- Physics-based juggling, and why it stays research — [Learning Soccer Juggling Skills with Layer-wise Mixture-of-Experts, SIGGRAPH 2022](https://www.cs.ubc.ca/~van/papers/2022-SIGGRAPH-juggle/index.html) · [EA's summary](https://www.ea.com/technology/news/learning-soccer-juggling-skills-layerwise-mixture-experts) · [Liu & Hodgins, basketball dribbling, 2018](https://dl.acm.org/doi/10.1145/3197517.3201315)
- A physics layer over animation — [FIFA 12 Player Impact Engine](https://gamerant.com/fifa-12-developer-diaries-impact-engine-pro-player-intelligence/) · [PuppetMaster with Final IK](http://root-motion.com/puppetmasterdox/html/page7.html) · [ball sockets and release frames in sports animation](https://mocaponline.com/blogs/mocap-news/sports-animation-games-guide)
- Runner telegraphing and the warm-up block — [Studying gameplay progression on runners, Game Developer](https://www.gamedeveloper.com/design/studying-gameplay-progression-on-runners)
- Artillery, judgement rather than timing — [Artillery game](https://en.wikipedia.org/wiki/Artillery_game) · [Koster on Angry Birds](https://www.raphkoster.com/2011/03/08/great-design-analysis-of-angry-birds/)

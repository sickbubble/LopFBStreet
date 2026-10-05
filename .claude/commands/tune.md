---
description: Turn a feel complaint into specific parameter changes, and log it
argument-hint: <what feels wrong, in your own words>
---

Use the `tuning-analyst` agent.

The complaint: **$ARGUMENTS**

It should:

1. **Read `docs/TUNING_LOG.md` first.** If this value has been tried before, in the Godot build or on the web, say what happened last time instead of suggesting it again.
2. If the complaint is *"it feels different from the Godot build"*, stop: that is a port bug, not a value. Hand it to `gameplay-engineer` to find where the TypeScript and the C# disagree.
3. Name **one** parameter to change, with a from-value (the current one, from `tools/golden/tuning/*.json` or the panel's override) and a to-value, and say what to look for when the change is applied. One at a time — two at once and the result teaches nothing.
4. Say where to change it, naming **the panel folder as well as the property**: the lil-gui tuning panel in the dev build → `Ball` for the ball's numbers (Touch, Carry Levels, Bounce, Stall, Launch, Possession, Reception, Verb Bands), → `Player` for the body's (Body, Strike, Stride, Pose, Reaction, Follow), → `Animator` for the clip swing fractions. Live, no reload. **A body number looked for under `Ball` is not there** and reads as a dead parameter.
5. Add the row to `docs/TUNING_LOG.md` before the next attempt starts, including the complaint in the developer's own words, marked as a web row.

If the complaint is too vague to act on, ask for the shape of it — *when* does it happen (standing, sprinting, stopping, turning, shooting, saving) and *what* does the ball do — rather than guessing.

If no combination of values would fix this, say so. That is a design problem for `game-designer`, not a fifty-first iteration.

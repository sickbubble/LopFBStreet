---
description: Turn a feel complaint into specific parameter changes, and log it
argument-hint: <what feels wrong, in your own words>
---

Use the `tuning-analyst` agent.

The complaint: **$ARGUMENTS**

It should:

1. **Read `docs/TUNING_LOG.md` first.** If this value has been tried before, in the Godot build or on the web, say what happened last time instead of suggesting it again.
2. **Say which layer it is.** The street game (the shot, the save, the rules, the pitch) travels back to Godot and is worth tuning. The touch and the body are stand-ins (IMPLEMENTATION.md § *Stand-ins*): if the complaint is *"it feels different from the Godot build"*, that is expected, not a bug. Log it, and act only if it stops the street game being judged.
3. Name **one** parameter to change, with a from-value (the current one, from `tools/golden/tuning/*.json`, the street settings, or the panel's override) and a to-value, and say what to look for when the change is applied. One at a time — two at once and the result teaches nothing.
4. Say where to change it, naming **the panel folder as well as the property**, in the lil-gui tuning panel in the dev build. Live, no reload. A number looked for in the wrong folder reads as a dead parameter.
5. Add the row to `docs/TUNING_LOG.md` before the next attempt starts: the complaint in the developer's own words, tagged **web**, and saying whether the value depends on a stand-in (the ball integrator or the body may not transfer to Godot; a touch value, a goal size or a keeper reach does).

If the complaint is too vague to act on, ask for the shape of it — *when* does it happen (standing, sprinting, stopping, turning, shooting, saving) and *what* does the ball do — rather than guessing.

If no combination of values would fix this, say so. That is a design problem for `game-designer`, not a fifty-first iteration.

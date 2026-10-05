---
description: Honest pass/fail on the current phase gate
---

Use the `process-tracker` agent to evaluate the current phase gate. If the judgement is a design one, bring in `game-designer`.

Do this properly:

1. **State the gate verbatim** from `docs/IMPLEMENTATION.md` (W0, C1–C4). Not a paraphrase. STREET.md §7's P1–P5 are the Godot build's gates, not this repo's.
2. **Say what evidence exists.** For every phase it is the developer's own report of using or playing the build, on the deployed preview; for C1–C3 it should be in `docs/PLAYTESTS.md`, and for C4 it is the numbers read against the success bar written in PROGRESS.md before launch, plus what players said. Say so explicitly, and do not infer a pass from green tests. Passing unit tests mean the rules do what they say, not that the game holds anyone's attention.
3. **Give a verdict: passed, not passed, or not yet evaluated.** "Not yet evaluated" is the honest answer whenever the gate needs a human judgement that nobody has made.

The C-gates are concept gates: is the street game worth building properly? A complaint about the touch or the body is about a stand-in: it fails a gate only when it stops the street game being played or judged, never because it differs from the Godot build.

A phase does not advance because its code is written. It advances because its gate passed.

If it has not passed, say what the developer reported missing — *"what did you want to do that you couldn't?"* — so the next piece of work is aimed at that. Never frame a gate as something that could end the project.

$ARGUMENTS

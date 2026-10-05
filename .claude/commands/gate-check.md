---
description: Honest pass/fail on the current phase gate
---

Use the `process-tracker` agent to evaluate the current phase gate. If the judgement is a design one, bring in `game-designer`.

Do this properly:

1. **State the gate verbatim** from `docs/IMPLEMENTATION.md` (STREET.md §7 for P1–P5). Not a paraphrase.
2. **Say what evidence exists.** For W1 that is `npm test` and its actual output. For W0 and every other phase it is the developer's own report of using or playing the build — say so explicitly, and do not infer a pass from green tests. Passing unit tests mean the rules are ported, not that the game is fun. W2 and W3 are judged side by side with the `godot-final` build.
3. **Give a verdict: passed, not passed, or not yet evaluated.** "Not yet evaluated" is the honest answer whenever the gate needs a human judgement that nobody has made.

A phase does not advance because its code is written. It advances because its gate passed.

If it has not passed, say what the developer reported missing — *"what did you want to do that you couldn't?"* — so the next piece of work is aimed at that. Never frame a gate as something that could end the project.

$ARGUMENTS

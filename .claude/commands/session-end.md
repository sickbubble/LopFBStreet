---
description: Record what actually happened this session in docs/PROGRESS.md
---

Use the `process-tracker` agent to update `docs/PROGRESS.md`.

Record what actually happened, not what was planned. Specifically:

- Move a task to `done` only if its done-condition is genuinely met. Work having started on it is not the same thing.
- If something was attempted and abandoned, record that it was attempted **and why** — that is what stops it being attempted again in three weeks.
- If a new task emerged, add it with an id, a tag, dependencies and a checkable done-condition.
- If the phase gate was evaluated, record the judgement and who made it.
- Keep the `**Milestone ...**` and `**Status: ...**` header lines current; the status line reads them.

Verify against `git log` and `git status` before writing. Then show the diff of what changed in `PROGRESS.md`.

The commit that records the session starts its subject with `Record the session`: `check-skills.sh` uses the newest such commit as the start of the next session.

---

## Then: the skills

`.claude/skills/*/SKILL.md` hold **procedure**; `docs/` holds values and state. A skill that names a parameter which no longer exists is worse than no skill, because it is trusted.

Do this part yourself, in this session. Not through `process-tracker` — it does not own `.claude/`, and spawning an agent for context this session already holds is waste.

1. Run `bash .claude/check-skills.sh`.

2. **Every `REVIEW` line** names a skill whose `## Sources` include a file that changed this session. Re-read that skill against what actually changed, then either fix it or confirm it is still true. **Confirming is a real outcome — say which you did, per skill.**

3. **Every `STALE` line is a defect** — a file naming something that exists neither in `packages/` nor in the C# reference. Fix the file. Only if the name is genuinely one of the cases in `.claude/known-names.txt` — browser or library vocabulary, a retired name kept as a tombstone, or a spec named before it is built — add it there **with its reason**. An unexplained entry is how a real stale name gets hidden.

4. **`PENDING` lines** are names that exist in `../LopFBBounce` but not yet in `packages/`: the port has not reached them. Not a defect while W1–W3 are open. A `PENDING` name whose file the port has already passed is a rename the port made silently; fix whichever side is wrong.

5. If a skill changed, add one line to `PROGRESS.md` saying which and why. A clean run needs no line.

The check is not a gate. `REVIEW` and `PENDING` exit 0; only `STALE` exits 1.

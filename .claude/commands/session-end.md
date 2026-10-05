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
- **New design is in the docs.** The desktop build will be Godot and takes the design over from `docs/`, not from the TypeScript. If a street rule, a preset, a keeper behaviour, a pitch size or a netcode lesson was added or changed this session, STREET.md (or an S36+ spec) says so in engine-neutral words, the same names as the code. If not, that is unfinished work: name it.
- **Playtest quotes go to `docs/PLAYTESTS.md`**, verbatim, one row per session someone played: build commit, who by role, what they said, what was seen, whether it is about the touch stand-in. The *Read* column is `game-designer`'s with the developer; leave it empty rather than guess.

Verify against `git log` and `git status` before writing. Then show the diff of what changed in `PROGRESS.md`.

The commit that records the session starts its subject with `Record the session`: `check-skills.sh` uses the newest such commit as the start of the next session.

---

## Then: the skills

`.claude/skills/*/SKILL.md` hold **procedure**; `docs/` holds values and state. A skill that names a parameter which no longer exists is worse than no skill, because it is trusted.

Do this part yourself, in this session. Not through `process-tracker` — it does not own `.claude/`, and spawning an agent for context this session already holds is waste.

1. Run `bash .claude/check-skills.sh`.

2. **Every `REVIEW` line** names a skill whose `## Sources` include a file that changed this session. Re-read that skill against what actually changed, then either fix it or confirm it is still true. **Confirming is a real outcome — say which you did, per skill.**

3. **Every `STALE` line is a defect** — a file naming something that exists neither in `packages/` nor in the Godot reference. Fix the file. Only if the name is genuinely one of the cases in `.claude/known-names.txt` — browser or library vocabulary, a retired name kept as a tombstone, or a spec named before it is built — add it there **with its reason**. An unexplained entry is how a real stale name gets hidden.

4. **`PENDING` lines** are Godot-only names: they exist in `../LopFBBounce` and not in `packages/`, and most of them never will (the touch, the IK body; IMPLEMENTATION.md § *Not built here*). Not a defect and not a backlog. Read the list for one thing only: a `.claude/` file that tells an agent to *use* a Godot-only name here as if it existed. That file is wrong; fix it.

5. If a skill changed, add one line to `PROGRESS.md` saying which and why. A clean run needs no line.

The check is not a gate. `REVIEW` and `PENDING` exit 0; only `STALE` exits 1.

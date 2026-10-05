---
description: Get oriented - current phase, gate, last done, next up, blockers
---

Use the `process-tracker` agent to report where the project stands.

It should read `docs/PROGRESS.md`, then verify that file against reality rather than trusting it — `git log --oneline -10`, `git status`, and `npm test`. If the file and the repo disagree, say so and correct the file.

Report, briefly:

1. Current phase and its gate, stated in full.
2. Last completed task, with the commit.
3. Next task, tagged `[DEV]` (the developer: an account, a click, or playing it) or `[CODE]` (Claude, verifiable with the npm scripts).
4. Anything blocked, and on what.

Keep it under fifteen lines. This is orientation, not a status report.

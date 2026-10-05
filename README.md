# LopFBStreet

Street football in the browser: one goal, one keeper, two to six players
keeping the ball up and finishing in the air. TypeScript, Vite and three.js.

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run typecheck
npm run e2e        # first time: npx playwright install chromium
```

The rules are ported from the Godot game [LopFBBounce](https://github.com/sickbubble/LopFBBounce),
tag `godot-final`. See [`CLAUDE.md`](CLAUDE.md) for how the repo is organised
and [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) for the phases.

The character is Quaternius's Universal Animation Library mannequin, CC0
(`packages/game/public/assets/characters/mannequin_license.txt`).

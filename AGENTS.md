# Notes for coding agents

Read `TECH_SPEC.md` (stack and platform rules) and `SPEC.md` (game design) first.

## Layout
- `src/sim/`: rules engine. Plain TypeScript, no DOM or Phaser. Fixed 10 ticks/s (`TICK_HZ`). Deterministic: every random choice uses a seeded `Rng`, so a painting is stored as a list of actions (`doc.ts`) and replayed exactly. Tests live next to it (`*.test.ts`, Vitest).
  - `brush.ts`: stroke points to dabs. `spray.ts`: blowpipe stencil particles (one RNG stream per tick). `shapes.ts`: stencil objects as signed distance functions. `torch.ts`: flame flicker. `sim.ts`: orchestrates and emits events.
- `src/render/`: Phaser 3. Only draws what the sim reports. `CaveScene.ts` (input, paint layer, torch), `lightShader.ts` (lighting of wall + paint), `wallgen.ts` (procedural rock), `textures.ts` (procedural dab, object and torch textures).
- `src/units.ts`: every tuning number plus tools, pigments and stencils as data. Change balance here, not in logic.
- `src/content/lines.json`: all player-facing text.
- `src/ui/`: plain DOM toolbar and pause menu. `src/audio/`: one AudioContext, buses sfx / music / voice, synthesised sounds.
- `src/boot/precache.ts` + `scripts/precache-plugin.ts` + `src/sw-template.js`: offline-first PWA (the loading screen fills the cache, not the service worker, and only when running as the installed app).

## Rules
- Keep the sim free of rendering code and keep it deterministic. Never call `Math.random()` inside `src/sim/` except through `randomSeed()` for new seeds.
- Changing dab generation or spray changes how saved paintings replay. If you must, bump the save version in `src/save/store.ts`.
- No modern colours: new pigments must pass the earth-tone test in `sim.test.ts`.
- Pointer events only (Phaser input is disabled). Use the real elapsed time (`game.loop.rawDelta`) for the fixed tick, not Phaser's smoothed delta.

## Commands
- `npm run dev`: dev server reachable on the LAN (for iPad testing).
- `npm test`: Vitest. `npm run test:e2e`: Playwright smoke tests (builds first).
- `npm run build`, `npm run icons`, `npm run deploy` (build, then `cf deploy dist`).
- Debug URL flags: `?seed=N` (wall seed), `?fresh` (ignore the saved painting), `?debug` (exposes `window.cave`).

## Git
- Always commit your work when a change is done (small, focused commits with a clear message), then push.

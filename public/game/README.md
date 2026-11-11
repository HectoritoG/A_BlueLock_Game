# Game core

This folder will hold the game code that is independent from the DOM and can eventually run in a Node server for online rooms.

## Current phase

The files in `core/` are still loaded as classic scripts from `public/bluelock.html` through a small global bridge:

```html
<script src="./game/core/constants.js"></script>
<script src="./game/core/math.js"></script>
<script src="./game/core/rng.js"></script>
<script src="./game/core/match-state.js"></script>
<script src="./game/entities.js"></script>
<script src="./game/render/entities.js"></script>
<script src="./game/ai.js"></script>
<script src="./game/audio/sfx.js"></script>
<script src="./game/session/local-session.js"></script>
<script src="./game/ui/hud.js"></script>
<script src="./game/input/input.js"></script>
```

Each module uses a UMD wrapper so it can be:

- loaded by the browser as a classic script (`window.BLConstants`, `window.BLMath`, `window.BLRng`, `window.BLMatchState`, `window.BLEntities`, `window.BLEntityRenderer`, `window.BLAI`, `window.BLAudio`, `window.BLSession`, `window.BLHud`, `window.BLInput`);
- required from Node for tests and, later, the multiplayer server.

This bridge keeps the current `file://` workflow and the existing regression tests working. When the main game script is moved to `public/game/main.js`, these modules can be converted to native ES modules.

## Layers

- `core/match-state.js` creates one independent state per match. This is the state a future room will own.
- `entities.js` contains the transitional `Ball` and `Player` simulation classes. Rendering is no longer part of the classes. Audio is injected as `runtime.audio`, and randomness goes through `runtime.rng` when a deterministic seed is available.
- `render/entities.js` contains the canvas renderer for balls and players. It receives the canvas context, camera, viewport and character images through `createEntityRenderer(runtime)`.
- `ai.js` contains pure tactical helpers for support runs, defensive shape, loose balls and goalkeepers. It works on plain snapshots and has no DOM access.
- `audio/sfx.js` wraps the procedural Web Audio sound manager behind `createSfx()`. It disables itself safely when no `AudioContext` exists.
- `session/local-session.js` owns one `MatchState` and its start/end/pause lifecycle. A future room can create one session per match without sharing arrays or nested state.
- `ui/hud.js` owns the DOM HUD updates through `createHud(runtime)`.
- `input/input.js` owns keyboard and touch bindings through `createInput(runtime)`. Game actions are injected, so the module does not depend on audio or the HUD.
- The next phase is the private 1v1 room lobby and host/guest networking. The browser game will keep running as a classic script until `public/game/main.js` replaces the inline bootstrap.

## Rules

- `core/` and `ai.js` must not use `window`, `document`, `canvas`, `Image`, `Audio` or `localStorage`.
- New gameplay randomness must go through an injected `rng` function. Local play currently defaults to `Math.random` until seeded sessions are wired.
- `visualRng` is only for cosmetic effects.
- Constants and math helpers must stay pure and serializable.
- `entities.js` must stay free of canvas and DOM access. `render/` is the only layer that draws.
- Browser-only code belongs in `audio/`, `input/` or `ui/`; match lifecycle code belongs in `session/`.
- A future network adapter should send inputs or snapshots, never DOM objects or canvas contexts.

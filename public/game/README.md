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
```

Each module uses a UMD wrapper so it can be:

- loaded by the browser as a classic script (`window.BLConstants`, `window.BLMath`, `window.BLRng`, `window.BLMatchState`, `window.BLEntities`, `window.BLEntityRenderer`);
- required from Node for tests and, later, the multiplayer server.

This bridge keeps the current `file://` workflow and the existing regression tests working. When the main game script is moved to `public/game/main.js`, these modules can be converted to native ES modules.

## Layers

- `core/match-state.js` creates one independent state per match. This is the state a future room will own.
- `entities.js` contains the transitional `Ball` and `Player` simulation classes. Rendering is no longer part of the classes. Audio is injected as `runtime.audio`, and randomness goes through `runtime.rng` when a deterministic seed is available.
- `render/entities.js` contains the canvas renderer for balls and players. It receives the canvas context, camera, viewport and character images through `createEntityRenderer(runtime)`.
- The next phases will move input/audio/UI out of the main script, add a `LocalSession`, and later add the 1v1 room lobby and host/guest networking.

## Rules

- `core/` must not use `window`, `document`, `canvas`, `Image`, `Audio` or `localStorage`.
- New gameplay randomness must go through an injected `rng` function. Local play currently defaults to `Math.random` until seeded sessions are wired.
- `visualRng` is only for cosmetic effects.
- Constants and math helpers must stay pure and serializable.
- `entities.js` must stay free of canvas and DOM access. `render/` is the only layer that draws.

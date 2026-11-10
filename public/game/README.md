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
```

Each module uses a UMD wrapper so it can be:

- loaded by the browser as a classic script (`window.BLConstants`, `window.BLMath`, `window.BLRng`, `window.BLMatchState`, `window.BLEntities`);
- required from Node for tests and, later, the multiplayer server.

This bridge keeps the current `file://` workflow and the existing regression tests working. When the main game script is moved to `public/game/main.js`, these modules can be converted to native ES modules.

## Layers

- `core/match-state.js` creates one independent state per match. This is the state a future room will own.
- `entities.js` contains the transitional `Ball` and `Player` classes. They still include rendering/audio calls and receive their dependencies through `createEntityClasses(runtime)`.
- The next phases will split `entities.js` into pure simulation state and a separate render layer.

## Rules

- `core/` must not use `window`, `document`, `canvas`, `Image`, `Audio` or `localStorage`.
- Gameplay randomness must use `createRng(seed)` from `rng.js`.
- `visualRng` is only for cosmetic effects.
- Constants and math helpers must stay pure and serializable.
- `entities.js` is a browser-facing layer until its draw/audio dependencies are extracted.

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
<script src="./game/vendor/peerjs.min.js"></script>
<script src="./game/net/protocol.js"></script>
<script src="./game/net/transport.js"></script>
<script src="./game/net/room.js"></script>
<script src="./game/net/snapshot.js"></script>
<script src="./game/ui/lobby.js"></script>
```

Each module uses a UMD wrapper so it can be:

- loaded by the browser as a classic script (`window.BLConstants`, `window.BLMath`, `window.BLRng`, `window.BLMatchState`, `window.BLEntities`, `window.BLEntityRenderer`, `window.BLAI`, `window.BLAudio`, `window.BLSession`, `window.BLHud`, `window.BLInput`, `window.BLNetProtocol`, `window.BLNetTransport`, `window.BLRoom`, `window.BLNetSnapshot`, `window.BLLobby`);
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
- `input/input.js` owns keyboard and touch bindings through `createInput(runtime)`. Game actions are injected, so the module does not depend on audio or the HUD. In guest mode it forwards compact movement/action input instead of mutating local state.
- `net/protocol.js` defines the versioned wire messages shared by host and guest.
- `net/transport.js` wraps the two transports: PeerJS/WebRTC for different devices and `BroadcastChannel` for two tabs in the same browser. Both implement the same ready-handshake and message queue. The PeerJS transport splits payloads larger than its 16 KB JSON limit into chunks and reassembles them on the other side, so match snapshots do not fail with `message-too-big`.
- `net/room.js` implements the room lifecycle: hello/welcome, ready, start, input, snapshot, pause, end and leave.
- `net/snapshot.js` serializes the authoritative match into stable player/ball fields and applies it on the guest. Entity references are resolved by stable IDs, never by object identity.
- `ui/lobby.js` owns the private-room modal, host/join tabs, hero selects and ready/start flow. It is the only networking module that touches the DOM.

## Private 1v1 rooms

The browser game stays a classic script until `public/game/main.js` replaces the inline bootstrap.

- The host owns the authoritative `MatchState` and simulation. It sends snapshots at 12 Hz.
- The guest controls one red rival hero and sends compact movement/action input at 30 Hz.
- The guest never simulates the match; it applies snapshots and interpolates visually.
- If the guest leaves, the host keeps playing and the guest hero falls back to AI control.
- If the host leaves, the guest pauses and can return to the menu.
- PeerJS uses its public signaling broker, then a WebRTC data channel, so two players can be in different cities as long as both have internet. Most home networks connect directly; very restrictive NAT/firewall setups may need a TURN relay, which the public PeerJS broker does not provide. The `BroadcastChannel` mode is only for two tabs in the same browser.
- GitHub Pages can host this because it only serves static files; the signaling broker is external and gameplay traffic is peer-to-peer.
- Keep the host tab visible. The game includes a watchdog that keeps the simulation alive when the browser throttles `requestAnimationFrame`, but a visible tab has the best frame rate.

## Rules

- `core/` and `ai.js` must not use `window`, `document`, `canvas`, `Image`, `Audio` or `localStorage`.
- New gameplay randomness must go through an injected `rng` function. Local play currently defaults to `Math.random` until seeded sessions are wired.
- `visualRng` is only for cosmetic effects.
- Constants and math helpers must stay pure and serializable.
- `entities.js` must stay free of canvas and DOM access. `render/` is the only layer that draws.
- Browser-only code belongs in `audio/`, `input/`, `ui/` or `net/`; match lifecycle code belongs in `session/`.
- Network code sends inputs or snapshots, never DOM objects or canvas contexts.
- Snapshot/input payloads must stay small and versioned. Add new fields to `PLAYER_SYNC_FIELDS`/`BALL_SYNC_FIELDS` instead of sending whole objects.

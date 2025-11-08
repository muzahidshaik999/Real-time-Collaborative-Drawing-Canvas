# ARCHITECTURE

This document explains the high-level architecture, WebSocket protocol, undo/redo strategy, and performance decisions for the collaborative drawing canvas demo.

Overview
- Frontend: Vanilla JS + HTML5 Canvas. No frameworks or drawing libraries.
- Backend: Node.js + Express + Socket.io for WebSocket messaging.
- Single room ("main") for the demo; `rooms.js` can be extended to support multiple isolated rooms.

Data flow
1. User pointer events (down/move/up) collected; freehand strokes accumulate a growing point list, shape tools keep start/end, symbol tool uses a single point.
2. Client emits transient partial stroke ops (final=false) every few points for real-time previews on other clients.
3. On pointerup (final=true) client sends final op; server persists only final ops in history and rebroadcasts them.
4. All clients render ops: final ops committed to backing canvas; transient ops drawn atop for smooth in-progress feedback.
5. Undo/redo/clear events trigger server-side history mutation and clients perform state resync via authoritative snapshot.

WebSocket protocol (message types)
- connect: socket.io lifecycle event.
- init: server -> client on join: { id, color, state: { ops, redoStack }, users }
- stroke: bidirectional; op = { id, userId, color, width, tool, points, final, serverTs, symbol?, fontSize? }
- removeOp: server -> clients: { id } after undo or explicit removal.
- undo: client -> server (global undo) triggers removeOp + state snapshot.
- redo: client -> server (global redo) triggers stroke + state snapshot.
- state: server -> clients authoritative { ops } snapshot after history mutations.
- cursor: client -> server -> others: { id, x, y, color } for live user pointers.
- clear: client -> server -> clients: canvas cleared + empty state snapshot.

Undo/Redo strategy
- Server authoritative list (only final ops). Transient partial ops are ignored for persistence, simplifying history.
- Undo: pop last op to redoStack, emit removeOp + full state snapshot for consistency.
- Redo: pop from redoStack back to ops, emit stroke + state snapshot.
- Clear: wipe ops & redoStack; broadcast clear + empty state.

Why this strategy?
- Deterministic global ordering and simpler conflict handling (last-writer undo).
- Network efficiency: partial strokes give live feedback without polluting undo history.
- Snapshot fallback solves any client drift or missed events.
Performance decisions
- Backing canvas for committed ops reduces redraw cost; only transients re-render each frame.
- Point simplification (distance-based) trims noisy freehand input before broadcasting.
- Partial emission every N points (currently 5) balances smoothness vs bandwidth.
- Cursor throttling (~50ms) avoids flooding socket channel.
- Symbol stamping uses single-point ops to minimize payload.

Conflict resolution
- Overlapping freehand strokes are simply layered; eraser uses destination-out to subtract pixels without tracking ownership.
- Global undo removes most recent finalized op regardless of author—simple but predictable.
- Alternative strategies (not implemented): per-user undo stacks, CRDT for pixel regions, operation tagging with z-indices.

Edge cases & handling
- Rapid disconnect/reconnect: init + state snapshot restores full canvas.
- Lost removeOp event: subsequent state snapshot corrects mismatch.
- High latency: partial previews still show early segments locally before final commit.
- Empty undo/redo gracefully ignored (no events broadcast).

Future improvements (not yet implemented)
- Multi-room support: extend rooms.js to create/join arbitrary room ids.
- Persistence: store ops in Redis/Postgres for reload continuity.
- Mobile/touch gesture optimization & pressure sensitivity.
- CRDT-based stroke merging for advanced conflict resolution.
- Binary protocol (e.g., protobuf) for more compact stroke messages.

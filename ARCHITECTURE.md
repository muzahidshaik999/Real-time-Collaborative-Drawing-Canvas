# ARCHITECTURE

This document explains the high-level architecture, WebSocket protocol, undo/redo strategy, and performance decisions for the collaborative drawing canvas demo.

Overview
- Frontend: Vanilla JS + HTML5 Canvas. No frameworks or drawing libraries.
- Backend: Node.js + Express + Socket.io for WebSocket messaging.
- Single room ("main") for the demo; rooms.js is prepared to be extended.

Data flow
- User draws -> client collects pointer points -> periodically sends a 'stroke' message with a small points array (live updates) to server.
- Server appends the received operation to global history and broadcasts the 'stroke' to other clients.
- Clients receive incoming 'stroke' messages and render them immediately.

WebSocket protocol (message types)
- connect: socket.io built-in
- init: server -> client on join: { id, color, state: { ops, redoStack }, users }
- stroke: client -> server (op) and server -> clients (op): op = { id, userId, color, width, tool, points, serverTs }
- removeOp: server -> clients: { id } (used for undo or explicit removal)
- undo: client -> server (requests server to undo last op)
- redo: client -> server (requests server to redo last undone op)
- cursor: client -> server -> others: { id, x, y, color }
- clear: client -> server -> clients: clear canvas

Undo/Redo strategy
- Centralized server-managed operation history (drawing-state.js) stores the ordered list of operations.
- Undo: server pops the last operation (global last op) and moves it to redo stack; then broadcasts a 'removeOp' with op id. Clients remove that op and re-render.
- Redo: server pops from redo stack, pushes to ops, and broadcasts the op again.

Why this strategy?
- Simplicity and determinism: a single source of truth (server) ensures every client has the same ordered operation list.

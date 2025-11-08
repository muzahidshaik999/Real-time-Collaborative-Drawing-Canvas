# Real-Time Collaborative Drawing Canvas

Vanilla JS + HTML5 Canvas + Node.js (Express + Socket.io). Multiple users draw together in real time with live stroke streaming, shared undo/redo, shapes, and symbol stamping.

## ✨ Features (Assignment Mapping)

| Requirement | Implemented | Notes |
|-------------|-------------|-------|
| Brush / Eraser | Yes | Freehand strokes with smoothing + destination-out eraser |
| Colors & Width | Yes | Color input + range slider for stroke width |
| Real-time Sync (live, not post-stroke) | Yes | Partial stroke packets every few points (final flag on commit) |
| User Cursors | Yes | Throttled broadcast (50ms) per pointer move |
| Global Undo / Redo | Yes | Server authoritative last-op undo/redo with snapshot resync |
| Conflict Resolution | Basic | Layered compositing + eraser pixel subtraction; last-op global undo |
| User List / Presence | Basic | Shows count; structure present for per-user metadata |
| Shapes (bonus) | Yes | Line, Rectangle, Circle, Triangle tools |
| Symbol / Shape Stamping (bonus) | Yes | Popover grid of many Unicode symbols |
| Light Theme UI Polish | Yes | Custom toolbar, button group, popover palette |

## 🚀 Quick Start

```powershell
cd "C:\Users\mujah\OneDrive\Desktop\Real-time Collaborative Drawing Canvas\collaborative-canvas"
npm install
npm start
```

Open two (or more) browser tabs at:

http://localhost:3000

Draw simultaneously to observe real-time sync, cursors, and undo/redo behavior.

## 🕹 Usage Guide

Toolbar buttons:
- ✏️ Pencil: Freehand drawing
- 🧽 Eraser: Removes pixels (non-destructive to history order other than adding eraser ops)
- 📏 Line / ⬛ Rectangle / ⚪ Circle / 🔺 Triangle: Click-drag-release for shape previews
- 🔷 Shapes: Opens symbol palette; click a symbol to stamp it at next click

Other controls:
- Color picker: Stroke/shape color
- Width slider: Stroke/shape thickness (also scales symbol font size)
- Undo / Redo: Global history operations (last committed op)
- Clear: Wipes all committed ops

## 🔌 WebSocket Message Reference

See `ARCHITECTURE.md` for full protocol. Core types: init, stroke, removeOp, state, undo, redo, cursor, clear.

## 🧠 Undo/Redo Model

Only final strokes are persisted server-side. Partial (in-progress) strokes are transient and ignored for history—this keeps undo deterministic and compact. After undo/redo the server also emits a `state` snapshot for guaranteed convergence.

## ⚙ Performance Choices
- Backing canvas caches all finalized ops for O(1) composite.
- Transients re-render atop backing only while active.
- Point simplification (distance-based) reduces payload size.
- Partial emission every ~5 points balances smoothness vs bandwidth.
- Cursor updates throttled to 20 FPS.

## 🧪 Testing Multi-User Locally
1. Run the server.
2. Open multiple tabs (or devices on LAN using your machine IP + :3000).
3. Draw concurrently: verify minimal latency and correct layering.
4. Perform undo/redo from different tabs—result should be consistent everywhere.

## 🧩 Conflict Resolution Strategy
Simple layering: later ops draw over earlier ones; eraser uses compositing (destination-out). Global undo always removes the latest finalized op (any author). More advanced ownership or CRDT merging intentionally omitted for clarity.

## 📁 Project Structure
```
collaborative-canvas/
	client/
		index.html
		style.css
		canvas.js
		websocket.js
		main.js
		utils.js
	server/
		server.js
		rooms.js
		drawing-state.js
	render.yaml
	package.json
	README.md
	ARCHITECTURE.md
```

## 🌐 Deployment (Render Example)
Included `render.yaml`. Typical settings:
- Build: `npm install`
- Start: `npm start`

## 🧱 Known Limitations
- No authentication; identity = socket id.
- Global undo removes the most recent finalized op only.
- No persistence (reload resets state) unless process memory retained.
- User list UI minimal (only count displayed in current toolbar version).
- Not yet optimized for mobile touch gesture edge-cases (basic pointer events work).

## 🧭 Potential Enhancements
- Per-user undo stacks or tagged selective undo.
- Multi-room support (extend `rooms.js`).
- Persistence layer (Redis/Postgres) for session recovery.
- Binary protocol (e.g., protobuf) for more compact ops.
- Pressure-based stroke width on stylus devices.

## ⏱ Time Spent
- Initial core (real-time drawing, basic undo/redo): ~2 hours
- Reliability & smoothing improvements: ~1 hour
- Shapes, symbols palette & UI polish: ~1.5 hours
- Documentation & architectural detailing: ~45 minutes

## 📄 License
MIT (optional placeholder — adjust as needed).

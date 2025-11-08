# Collaborative Canvas

This is a small demo of a real-time collaborative drawing canvas built with vanilla JavaScript on the frontend and Node.js + Socket.io on the backend.

Features included:
- Brush and eraser
- Color and stroke width
- Real-time drawing (live stroke streaming)
- User cursors
- Global undo/redo (server-driven)
- Simple user list

Quick start
1. Install dependencies

```powershell
cd "C:\Users\mujah\OneDrive\Desktop\Real-time Collaborative Drawing Canvas\collaborative-canvas"
npm install
npm start
```

2. Open http://localhost:3000 in two browser windows to test collaboration.

Git & GitHub

Initialize (first time):

```powershell
cd "C:\Users\mujah\OneDrive\Desktop\Real-time Collaborative Drawing Canvas\collaborative-canvas"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/muzahidshaik999/Real-time-Collaborative-Drawing-Canvas.git
git push -u origin main
```

Subsequent updates:

```powershell
git add .
git commit -m "Update features (shapes, undo fixes)"
git push
```

Deploy on Render

1. Push the repository to GitHub (see above).
2. Log into https://render.com and click New + Web Service.
3. Select your GitHub repo.
4. Settings:
	- Environment: Node
	- Build Command: `npm install`
	- Start Command: `npm start`
5. (Optional) Add `render.yaml` for Infrastructure as Code. This repo already includes `render.yaml` so Render can auto-detect settings.
6. Click Create Web Service. After build succeeds you’ll get a public URL.

Troubleshooting Render
 - If the service shows “listening on 3000” in logs but 502 on browser, ensure the server starts without binding to 127.0.0.1 only (current code uses default, fine).
 - Confirm no dev-only dependencies block production (nodemon only in devDependencies, so fine).
 - Redeploy from the dashboard if a build got cached incorrectly.

Notes and limitations
- Global undo simply removes the last operation in the global history (not per-user undo). This is a deliberate, simple strategy for the assignment. ARCHITECTURE.md describes alternative strategies.
- Stroke events are sent in segments (partial bursts) to provide live updates while typing; the server stores each op as it's received.
- No authentication; user identity is socket id.
- This is a minimal example intended for evaluation; production systems should add authorization, per-room permissions, persistence, and better conflict resolution.

Time spent: ~2 hours for core implementation and documentation (demo-level readiness) + incremental enhancements for shapes and deployment guidance.

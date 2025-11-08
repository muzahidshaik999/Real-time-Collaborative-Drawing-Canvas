const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const DrawingState = require('./drawing-state');
const rooms = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PUBLIC = path.join(__dirname, '..', 'client');
app.use(express.static(PUBLIC));

const PORT = process.env.PORT || 3000;

// For demo, single room 'main'
const ROOM = 'main';
const drawingState = new DrawingState();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  // assign simple color
  const userColor = getRandomColor();
  const defaultName = `User-${String(socket.id).slice(-4)}`;
  const user = { id: socket.id, color: userColor, name: defaultName };
  rooms.addUser(ROOM, socket.id, user);

  // send init state
  socket.join(ROOM);
  socket.emit('init', { id: socket.id, color: userColor, state: drawingState.getState(), users: rooms.listUsers(ROOM) });
  socket.to(ROOM).emit('userJoined', user);

  // incoming stroke (partial or final). op = {id, userId, color, width, tool, points, final}
  socket.on('stroke', (op) => {
    try {
      const pts = (op && op.points) ? op.points.length : 0;
      const isFinal = !!(op && op.final);
      console.log('received stroke from', socket.id, 'points=', pts, 'final=', isFinal);
      if (!op) return;
      op.serverTs = Date.now();
      // Persist ONLY final strokes; partials are transient to keep undo/redo semantics clean
      if (isFinal) {
        drawingState.addOp(op);
        console.log('ops count=', drawingState.ops.length);
      }
      // Broadcast to others so they can render (sender already renders locally)
      socket.to(ROOM).emit('stroke', op);
    } catch (err) {
      console.error('stroke handler error', err);
    }
  });

  // client can request server to remove a specific op id (not used by default)
  socket.on('removeOp', (opId) => {
    const removed = drawingState.removeOpById(opId);
    if (removed) io.in(ROOM).emit('removeOp', { id: opId });
  });

  socket.on('undo', () => {
    const op = drawingState.popLastOp();
    console.log('[undo] requested by', socket.id, 'removed id=', op && op.id);
    if (op) io.in(ROOM).emit('removeOp', { id: op.id });
    // broadcast authoritative state snapshot for full resync
    io.in(ROOM).emit('state', { ops: drawingState.getState().ops });
  });

  socket.on('redo', () => {
    const op = drawingState.redoLast();
    console.log('[redo] requested by', socket.id, 'restored id=', op && op.id);
    if (op) io.in(ROOM).emit('stroke', op);
    io.in(ROOM).emit('state', { ops: drawingState.getState().ops });
  });

  socket.on('cursor', (pos) => {
    // broadcast cursor to others, include user color for visibility
    const u = rooms.getUser(ROOM, socket.id);
    const color = (u && u.color) ? u.color : undefined;
    const name = (u && u.name) ? u.name : undefined;
    socket.to(ROOM).emit('cursor', { id: socket.id, color, name, ...pos });
  });

  // Simple latency check: client sends timestamp, server echos back
  socket.on('pingCheck', (ts) => {
    socket.emit('pongCheck', ts);
  });

  socket.on('clear', () => {
    const count = drawingState.ops.length;
    drawingState.clear();
    console.log('[clear] requested by', socket.id, 'cleared ops=', count);
    io.in(ROOM).emit('clear');
    io.in(ROOM).emit('state', { ops: [] });
  });

  socket.on('disconnect', () => {
    rooms.removeUser(ROOM, socket.id);
    socket.to(ROOM).emit('userLeft', { id: socket.id });
  });

  // Set/Update display name
  socket.on('setName', (nameRaw) => {
    try {
      const name = sanitizeName(nameRaw);
      const updated = rooms.updateUser(ROOM, socket.id, { name });
      if (updated) io.in(ROOM).emit('userUpdated', { id: updated.id, name: updated.name });
    } catch (e) {
      console.warn('setName error', e);
    }
  });
});

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});

function getRandomColor() {
  const colors = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c','#fabebe'];
  return colors[Math.floor(Math.random()*colors.length)];
}

function sanitizeName(s) {
  try {
    let v = String(s || '').trim();
    if (!v) return `User-${Math.random().toString(36).slice(2,6)}`;
    v = v.replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ');
    // strip non-printable
    v = v.replace(/[\u0000-\u001f\u007f]/g, '');
    if (v.length > 24) v = v.slice(0,24);
    return v;
  } catch {
    return `User-${Math.random().toString(36).slice(2,6)}`;
  }
}

// main.js wires UI, canvas and websocket together
(function(){
  const canvasEl = document.getElementById('canvas');
  const cursorsEl = document.getElementById('cursors');
  const toolEl = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const widthEl = document.getElementById('width');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const clearBtn = document.getElementById('clear');
  const userListEl = document.getElementById('userList');
  const statusEl = document.getElementById('status');

  const { canvas, ctx } = (function(){
    const c = document.getElementById('canvas');
    const { canvas:ca, ctx:ct } = window.setupCanvas(c);
    return { canvas: ca, ctx: ct };
  })();

  // drawing state for current stroke
  let drawing = false;
  let currentPoints = [];
  let myId = null;
  let currentOpId = null;

  const makeId = () => (window.Utils && Utils.uid ? Utils.uid('op') : `op_${Date.now()}_${Math.random().toString(36).slice(2,6)}`);

  function getPos(e){
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Throttle cursor sending
  let lastCursorSend = 0;

  canvas.addEventListener('pointerdown', (e)=>{
    drawing = true;
    currentOpId = makeId();
    const start = getPos(e);
    currentPoints = [start];
    if (window.DEBUG) console.log('pointerdown', currentOpId, start, 'tool=', toolEl.value);
  });
  canvas.addEventListener('pointermove', (e)=>{
    const pos = getPos(e);
    if (drawing) {
      // For shape tools we keep just start + current point for live preview
      if (toolEl.value === 'line' || toolEl.value === 'rect' || toolEl.value === 'circle') {
        if (currentPoints.length === 1) currentPoints.push(pos); else currentPoints[currentPoints.length-1] = pos;
        const previewOp = buildOp(currentPoints.slice(), false);
        CanvasApp.addOrReplaceOp(previewOp);
      } else {
        currentPoints.push(pos);
        // send partial stroke every ~4 points for lower-latency updates
        if (currentPoints.length >= 4) {
          const op = buildOp(currentPoints.slice(), false);
          CanvasApp.addOrReplaceOp(op);
          WS.sendStroke(op);
          currentPoints = [currentPoints[currentPoints.length-1]];
          if (window.DEBUG) console.log('partial stroke sent', op.id, op.points.length);
        }
      }
    }

    const now = Date.now();
    if (now - lastCursorSend > 50) {
      WS.sendCursor({ x: pos.x, y: pos.y });
      lastCursorSend = now;
    }
  });
  window.addEventListener('pointerup', (e)=>{
    if (!drawing) return;
    drawing = false;
    const pos = getPos(e);
    if (toolEl.value === 'line' || toolEl.value === 'rect' || toolEl.value === 'circle') {
      if (currentPoints.length === 1) currentPoints.push(pos); else currentPoints[currentPoints.length-1] = pos;
    } else {
      currentPoints.push(pos);
    }
    const op = buildOp(currentPoints.slice(), true);
    CanvasApp.addOrReplaceOp(op);
    WS.sendStroke(op);
    currentPoints = [];
    if (window.DEBUG) console.log('final stroke sent', op.id, op.points.length, 'tool=', toolEl.value);
    currentOpId = null;
  });

  function buildOp(points, finalize=false){
    return { id: currentOpId || makeId(), userId: myId, color: colorEl.value, width: Number(widthEl.value), tool: toolEl.value, points, final: !!finalize };
  }

  // Wire websocket events
  WS.on('connect', (id)=>{ myId = id; });
  WS.on('status', (txt)=>{ if (statusEl) statusEl.textContent = txt; });

  WS.on('init', (data)=>{
    myId = data.id;
    // load ops into committed list and draw backing
    CanvasApp.ops = data.state.ops || [];
    // ensure backing canvas is built and redrawn
    if (typeof CanvasApp._redrawBacking === 'function') {
      // Create backing if not present by triggering a redraw path that uses it
      if (!CanvasApp._backingCanvas) {
        // If there are existing ops, build the backing and draw them now
        if (CanvasApp.ops && CanvasApp.ops.length) {
          // call addOrReplaceOp for each op to ensure consistent commit path
          const ops = CanvasApp.ops.slice();
          CanvasApp.ops = [];
          for (const op of ops) CanvasApp.addOrReplaceOp(op);
        }
      } else {
        CanvasApp._redrawBacking();
      }
    }
    CanvasApp.reRender();
    // users
    userListEl.textContent = (data.users || []).length;
    if (window.DEBUG) console.log('init received', data);
  });

  WS.on('stroke', (op)=>{ if (window.DEBUG) console.log('[ws] stroke', op && op.id, 'final=', op && op.final); CanvasApp.addOrReplaceOp(op); });

  WS.on('removeOp', ({id})=>{ if (window.DEBUG) console.log('[ws] removeOp', id); CanvasApp.removeOp(id); });

  WS.on('userJoined', (u)=>{ /* update user list */ });
  WS.on('userLeft', (u)=>{ /* update user list */ });

  WS.on('cursor', (c)=>{
    let el = document.getElementById('cursor_'+c.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'cursor'; el.id = 'cursor_'+c.id; el.style.background = c.color || '#000';
      document.getElementById('cursors').appendChild(el);
    }
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y}px`;
  });

  WS.on('clear', ()=>{ if (window.DEBUG) console.log('[ws] clear'); CanvasApp.ops = []; if (CanvasApp.transients && CanvasApp.transients.clear) CanvasApp.transients.clear(); if (CanvasApp._backingCanvas && CanvasApp._backingCtx) { CanvasApp._backingCtx.clearRect(0,0,CanvasApp._backingCanvas.width, CanvasApp._backingCanvas.height); } CanvasApp.reRender(); });

  undoBtn.addEventListener('click', ()=>{ WS.sendUndo(); });
  redoBtn.addEventListener('click', ()=>{ WS.sendRedo(); });
  clearBtn.addEventListener('click', ()=>{ WS.sendClear(); });

  // Extra debug instrumentation for undo/redo/clear flow
  if (window.DEBUG) {
    undoBtn.addEventListener('click', ()=> console.log('[ui] undo clicked'));
    redoBtn.addEventListener('click', ()=> console.log('[ui] redo clicked'));
    clearBtn.addEventListener('click', ()=> console.log('[ui] clear clicked'));
    WS.on('removeOp', (d)=> console.log('[dbg] removeOp event', d));
    WS.on('stroke', (op)=> console.log('[dbg] stroke event', op && op.id, 'final=', op && op.final));
    WS.on('clear', ()=> console.log('[dbg] clear event received'));
  }

  // start websocket connection
  WS.connect();
})();

// main.js wires UI, canvas and websocket together
(function(){
  const canvasEl = document.getElementById('canvas');
  const cursorsEl = document.getElementById('cursors');
  const toolEl = document.getElementById('tool');
  const shapeSymbolsEl = document.getElementById('shapeSymbols');
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
    const start = getPos(e);
    // If symbol tool, stamp immediately on click
    if (toolEl.value === 'symbol') {
      const op = buildOp([start], true);
      op.symbol = shapeSymbolsEl.value;
      op.fontSize = Math.max(12, Number(widthEl.value) * 6);
      CanvasApp.addOrReplaceOp(op);
      WS.sendStroke(op);
      if (window.DEBUG) console.log('[symbol] stamped', op.symbol, 'at', start);
      return;
    }

    drawing = true;
    currentOpId = makeId();
    currentPoints = [start];
    if (window.DEBUG) console.log('pointerdown', currentOpId, start, 'tool=', toolEl.value);
  });
  canvas.addEventListener('pointermove', (e)=>{
    const pos = getPos(e);
    if (drawing) {
      // For shape tools we keep just start + current point for live preview
      if (toolEl.value === 'line' || toolEl.value === 'rect' || toolEl.value === 'circle' || toolEl.value === 'triangle') {
        if (currentPoints.length === 1) currentPoints.push(pos); else currentPoints[currentPoints.length-1] = pos;
        const previewOp = buildOp(currentPoints.slice(), false);
        CanvasApp.addOrReplaceOp(previewOp);
      } else if (toolEl.value === 'symbol') {
        // For symbols, show a transient preview at cursor
        const preview = buildOp([pos], false);
        preview.symbol = shapeSymbolsEl.value;
        preview.fontSize = Math.max(12, Number(widthEl.value) * 6);
        CanvasApp.addOrReplaceOp(preview);
      } else {
        currentPoints.push(pos);
        // Maintain full point history so final undo removes entire stroke.
        // Only broadcast periodically to avoid excessive network usage.
        if (currentPoints.length === 2 || currentPoints.length % 5 === 0) {
          const simplified = (window.Utils && Utils.simplifyByDistance) ? Utils.simplifyByDistance(currentPoints, 2) : currentPoints.slice();
          const op = buildOp(simplified, false);
          CanvasApp.addOrReplaceOp(op); // show progressive path
          WS.sendStroke(op); // transient update (server ignores non-final)
          if (window.DEBUG) console.log('partial stroke sent (full history)', op.id, op.points.length);
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
    if (toolEl.value === 'line' || toolEl.value === 'rect' || toolEl.value === 'circle' || toolEl.value === 'triangle') {
      if (currentPoints.length === 1) currentPoints.push(pos); else currentPoints[currentPoints.length-1] = pos;
    } else if (toolEl.value === 'symbol') {
      // place a symbol at click position (use pointerup to commit)
      currentPoints = [pos];
    } else {
      currentPoints.push(pos);
    }
    const finalPoints = (window.Utils && Utils.simplifyByDistance) ? Utils.simplifyByDistance(currentPoints, 2) : currentPoints.slice();
    const op = buildOp(finalPoints, true);
    if (toolEl.value === 'symbol') {
      op.symbol = shapeSymbolsEl.value;
      op.fontSize = Math.max(12, Number(widthEl.value) * 6);
    }
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

  // Fallback redraw after undo/redo to guarantee consistency (in case of race)
  WS.on('removeOp', ()=>{ if (window.DEBUG) console.log('[ws] removeOp -> force redraw'); if (CanvasApp._backingCanvas && CanvasApp._backingCtx) { CanvasApp._redrawBacking(); CanvasApp.reRender(); } });

  // State resync (authoritative list of ops)
  WS.on('state', (snapshot)=>{
    if (window.DEBUG) console.log('[ws] state snapshot', snapshot && snapshot.ops && snapshot.ops.length);
    if (!snapshot || !Array.isArray(snapshot.ops)) return;
    CanvasApp.ops = snapshot.ops.slice();
    // rebuild backing from scratch
    if (CanvasApp._backingCanvas && CanvasApp._backingCtx) {
      CanvasApp._backingCtx.clearRect(0,0,CanvasApp._backingCanvas.width,CanvasApp._backingCanvas.height);
    }
    for (const op of CanvasApp.ops) {
      if (op.final) {
        CanvasApp.addOrReplaceOp(op); // commits to backing
      }
    }
    CanvasApp.reRender();
  });

  // Button handlers (single binding with optional debug log)
  undoBtn.addEventListener('click', ()=>{ if(window.DEBUG) console.log('[ui] undo click'); WS.sendUndo(); });
  redoBtn.addEventListener('click', ()=>{ if(window.DEBUG) console.log('[ui] redo click'); WS.sendRedo(); });
  clearBtn.addEventListener('click', ()=>{ if(window.DEBUG) console.log('[ui] clear click'); WS.sendClear(); });

  // start websocket connection
  WS.connect();

  // --- Dynamic cursor to match tool ---
  function setToolCursor() {
    const tool = toolEl.value;
    const size = Math.max(6, Number(widthEl.value));
    const color = colorEl.value || '#000000';
    // Use a classic crosshair '+' for shapes like Word; generate pencil/eraser icons otherwise
    if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'triangle' || tool === 'symbol') {
      canvas.style.cursor = 'crosshair';
    } else {
      const url = makeCursorForTool(tool, size, color);
      canvas.style.cursor = url ? `url(${url}) ${Math.ceil(size/2)} ${Math.ceil(size/2)}, crosshair` : 'crosshair';
    }
    // Toggle shapes dropdown visibility
    const shapeLabel = document.getElementById('shapeLabel');
    if (shapeLabel) shapeLabel.classList.toggle('hidden', tool !== 'symbol');
  }

  function makeCursorForTool(tool, size, color) {
    try {
      const c = document.createElement('canvas');
      const d = Math.max(24, size + 8);
      c.width = c.height = d;
      const ctx = c.getContext('2d');
      ctx.clearRect(0,0,d,d);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, Math.min(3, size/2));

      const cx = d/2, cy = d/2, r = Math.max(3, size/2);
      if (tool === 'pencil') {
        // draw a simple pencil tip
        ctx.fillStyle = color; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx - r, cy - r); ctx.closePath(); ctx.fill();
      } else if (tool === 'eraser') {
        const s = r*2; ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
        ctx.strokeRect(cx - s/2, cy - s/2, s, s);
      } else if (tool === 'line') {
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.stroke();
      } else if (tool === 'rect') {
        const s = r*2; ctx.strokeRect(cx - s/2, cy - s/2, s, s);
      } else if (tool === 'circle') {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
      } else if (tool === 'triangle') {
        const s = r*2; ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + s/2, cy + r);
        ctx.lineTo(cx - s/2, cy + r);
        ctx.closePath(); ctx.stroke();
      }
      return c.toDataURL('image/png');
    } catch(e) {
      console.warn('cursor build failed', e);
      return '';
    }
  }

  // Update cursor when tool/size/color changes
  toolEl.addEventListener('change', setToolCursor);
  widthEl.addEventListener('input', setToolCursor);
  colorEl.addEventListener('input', setToolCursor);
  // If a symbol is chosen while another tool is active, switch to 'symbol' tool automatically
  if (shapeSymbolsEl) {
    shapeSymbolsEl.addEventListener('change', ()=>{
      if (toolEl.value !== 'symbol') {
        toolEl.value = 'symbol';
        setToolCursor();
      }
    });
  }
  // Initialize once
  setToolCursor();
})();

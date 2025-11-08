// main.js wires UI, canvas and websocket together
(function(){
  const canvasEl = document.getElementById('canvas');
  const cursorsEl = document.getElementById('cursors');
  // New tool UI elements
  const toolGroupEl = document.getElementById('toolGroup');
  const shapePaletteBtn = document.getElementById('shapePaletteBtn');
  const shapePaletteEl = document.getElementById('shapePalette');
  const shapeSymbolsGridEl = document.getElementById('shapeSymbols');
  const closeShapePaletteBtn = document.getElementById('closeShapePalette');
  const usersBtn = document.getElementById('usersBtn');
  const usersPanelEl = document.getElementById('usersPanel');
  const usersListEl = document.getElementById('usersList');
  const closeUsersPanelBtn = document.getElementById('closeUsersPanel');
  const displayNameInput = document.getElementById('displayName');
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
  // current tool + symbol state (replaces old <select id="tool"> and shapes <select>)
  let currentTool = 'pencil';
  let currentSymbol = '■';

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
    if (getTool() === 'symbol') {
      const op = buildOp([start], true);
      op.symbol = currentSymbol;
      op.fontSize = Math.max(12, Number(widthEl.value) * 6);
      CanvasApp.addOrReplaceOp(op);
      WS.sendStroke(op);
      if (window.DEBUG) console.log('[symbol] stamped', op.symbol, 'at', start);
      return;
    }

    drawing = true;
    currentOpId = makeId();
    currentPoints = [start];
    if (window.DEBUG) console.log('pointerdown', currentOpId, start, 'tool=', getTool());
  });
  canvas.addEventListener('pointermove', (e)=>{
    const pos = getPos(e);
    if (drawing) {
      // For shape tools we keep just start + current point for live preview
      if (getTool() === 'line' || getTool() === 'rect' || getTool() === 'circle' || getTool() === 'triangle') {
        if (currentPoints.length === 1) currentPoints.push(pos); else currentPoints[currentPoints.length-1] = pos;
        const previewOp = buildOp(currentPoints.slice(), false);
        CanvasApp.addOrReplaceOp(previewOp);
      } else if (getTool() === 'symbol') {
        // For symbols, show a transient preview at cursor
        const preview = buildOp([pos], false);
        preview.symbol = currentSymbol;
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
    if (getTool() === 'line' || getTool() === 'rect' || getTool() === 'circle' || getTool() === 'triangle') {
      if (currentPoints.length === 1) currentPoints.push(pos); else currentPoints[currentPoints.length-1] = pos;
    } else if (getTool() === 'symbol') {
      // place a symbol at click position (use pointerup to commit)
      currentPoints = [pos];
    } else {
      currentPoints.push(pos);
    }
    const finalPoints = (window.Utils && Utils.simplifyByDistance) ? Utils.simplifyByDistance(currentPoints, 2) : currentPoints.slice();
    const op = buildOp(finalPoints, true);
    if (getTool() === 'symbol') {
      op.symbol = currentSymbol;
      op.fontSize = Math.max(12, Number(widthEl.value) * 6);
    }
    CanvasApp.addOrReplaceOp(op);
    WS.sendStroke(op);
    currentPoints = [];
    if (window.DEBUG) console.log('final stroke sent', op.id, op.points.length, 'tool=', getTool());
    currentOpId = null;
  });

  function buildOp(points, finalize=false){
    return { id: currentOpId || makeId(), userId: myId, color: colorEl.value, width: Number(widthEl.value), tool: getTool(), points, final: !!finalize };
  }

  // Wire websocket events
  WS.on('connect', (id)=>{ myId = id; });
  WS.on('status', (txt)=>{ if (statusEl) statusEl.textContent = txt; });
  WS.on('latency', (ms)=>{ const el = document.getElementById('latency'); if (el) el.textContent = `${ms} ms`; });

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
    const users = data.users || [];
    updateUserCountDisplay(users.length);
    renderUsers(users);
    if (window.DEBUG) console.log('init received', data);
  });

  WS.on('stroke', (op)=>{ if (window.DEBUG) console.log('[ws] stroke', op && op.id, 'final=', op && op.final); CanvasApp.addOrReplaceOp(op); });

  WS.on('removeOp', ({id})=>{ if (window.DEBUG) console.log('[ws] removeOp', id); CanvasApp.removeOp(id); });

  // Update simple user count on join/leave
  function updateUserCountDisplay(count){
    const span = document.getElementById('userCount');
    if (span) span.textContent = String(Math.max(0, count));
  }
  function renderUsers(list){
    if (!usersListEl) return;
    usersListEl.innerHTML = '';
    for (const u of list){
      const li = document.createElement('li');
      const dot = document.createElement('span'); dot.className = 'user-dot'; dot.style.background = u.color || '#000';
      const name = document.createElement('span'); name.textContent = u.id.slice(0,6);
      li.appendChild(dot); li.appendChild(name); usersListEl.appendChild(li);
    }
  }
  // Maintain internal user map
  const userMap = new Map();
  WS.on('userJoined', (u)=>{ userMap.set(u.id, u); updateUserCountDisplay(userMap.size); renderUsers(Array.from(userMap.values())); });
  WS.on('userLeft', (u)=>{ userMap.delete(u.id); updateUserCountDisplay(userMap.size); renderUsers(Array.from(userMap.values())); });
  // Users panel toggle
  function toggleUsersPanel(show){
    if (!usersPanelEl) return;
    const shouldShow = typeof show === 'boolean' ? show : usersPanelEl.classList.contains('hidden');
    usersPanelEl.classList.toggle('hidden', !shouldShow);
  }
  if (usersBtn) usersBtn.addEventListener('click', ()=> toggleUsersPanel());
  if (closeUsersPanelBtn) closeUsersPanelBtn.addEventListener('click', ()=> toggleUsersPanel(false));

  WS.on('cursor', (c)=>{
    let el = document.getElementById('cursor_'+c.id);
    if (!el) {
      el = document.createElement('div'); el.className = 'cursor'; el.id = 'cursor_'+c.id;
      // Build label container
      const dot = document.createElement('span'); dot.className = 'cursor-dot';
      const label = document.createElement('span'); label.className = 'cursor-label';
      el.appendChild(dot); el.appendChild(label);
      document.getElementById('cursors').appendChild(el);
    }
    const dotEl = el.querySelector('.cursor-dot');
    const labelEl = el.querySelector('.cursor-label');
    if (dotEl) dotEl.style.background = c.color || '#000';
    if (labelEl) labelEl.textContent = (c.name ? c.name : (c.id||'')).slice(0,16);
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y}px`;
  });
  // Update user name in presence list on userUpdated
  WS.on('userUpdated', (u)=>{
    if (u && u.id && userMap.has(u.id)) {
      const existing = userMap.get(u.id);
      userMap.set(u.id, { ...existing, name: u.name });
      renderUsers(Array.from(userMap.values()));
    }
  });
  // Handle setting display name (debounced)
  if (displayNameInput) {
    const send = window.Utils ? Utils.debounce((v)=> WS.sendName(v), 400) : (v)=> WS.sendName(v);
    displayNameInput.addEventListener('input', (e)=>{
      const v = e.target.value;
      send(v);
    });
  }

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
    const tool = getTool();
    const size = Math.max(6, Number(widthEl.value));
    const color = colorEl.value || '#000000';
    // Use a classic crosshair '+' for shapes like Word; generate pencil/eraser icons otherwise
    if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'triangle' || tool === 'symbol') {
      canvas.style.cursor = 'crosshair';
    } else {
      const url = makeCursorForTool(tool, size, color);
      canvas.style.cursor = url ? `url(${url}) ${Math.ceil(size/2)} ${Math.ceil(size/2)}, crosshair` : 'crosshair';
    }
    // Show palette if symbol tool is selected and palette isn't open (open on button click only)
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

  // Update cursor when size/color changes
  widthEl.addEventListener('input', setToolCursor);
  colorEl.addEventListener('input', setToolCursor);
  
  // --- Tool group wiring ---
  function getTool(){ return currentTool; }
  function setTool(tool){
    currentTool = tool;
    if (toolGroupEl) {
      for (const btn of toolGroupEl.querySelectorAll('.tool-btn')) {
        btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
      }
    }
    setToolCursor();
  }
  if (toolGroupEl) {
    toolGroupEl.addEventListener('click', (e)=>{
      const btn = e.target.closest('.tool-btn');
      if (!btn) return;
      const tool = btn.getAttribute('data-tool');
      if (tool === 'symbol') {
        // Open/Toggle palette; don't immediately change tool until a symbol is picked
        toggleShapePalette(true);
      } else {
        setTool(tool);
      }
    });
  }

  // --- Shapes palette wiring ---
  function toggleShapePalette(show) {
    if (!shapePaletteEl) return;
    const shouldShow = typeof show === 'boolean' ? show : shapePaletteEl.classList.contains('hidden');
    shapePaletteEl.classList.toggle('hidden', !shouldShow);
  }
  if (shapePaletteBtn) shapePaletteBtn.addEventListener('click', ()=> toggleShapePalette());
  if (closeShapePaletteBtn) closeShapePaletteBtn.addEventListener('click', ()=> toggleShapePalette(false));

  // Build shape grid buttons from any <option> children that might be present (migration-safe)
  (function buildShapeGrid(){
    if (!shapeSymbolsGridEl) return;
    // Collect options from any nested <option> tags
    const opts = Array.from(shapeSymbolsGridEl.querySelectorAll('option'));
    let hadOptions = false;
    if (opts.length) {
      hadOptions = true;
      // Clear grid content before injecting buttons
      shapeSymbolsGridEl.innerHTML = '';
      for (const opt of opts) {
        const symbol = opt.getAttribute('value') || opt.textContent.trim();
        const label = opt.textContent.trim();
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'shape-item'; b.textContent = symbol; b.title = label;
        b.dataset.symbol = symbol;
        shapeSymbolsGridEl.appendChild(b);
      }
    }
    // If no options, provide a small default set
    if (!hadOptions && !shapeSymbolsGridEl.querySelector('.shape-item')) {
      const defaults = ['■','□','●','○','★','☆','▲','△','◆','◇','⬤','⬛','⬜','◯','◉'];
      for (const s of defaults) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'shape-item'; b.textContent = s; b.title = s;
        b.dataset.symbol = s; shapeSymbolsGridEl.appendChild(b);
      }
    }
    // Click to select symbol and switch tool
    shapeSymbolsGridEl.addEventListener('click', (e)=>{
      const btn = e.target.closest('.shape-item');
      if (!btn) return;
      currentSymbol = btn.dataset.symbol || btn.textContent.trim();
      setTool('symbol');
      toggleShapePalette(false);
    });
  })();

  // Initialize once
  setToolCursor();
  // Ensure initial active tool button state
  setTool('pencil');
})();

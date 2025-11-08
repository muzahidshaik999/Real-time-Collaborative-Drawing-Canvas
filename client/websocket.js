// websocket.js - wrapper around socket.io client (robust + fallback)
(function () {
  let socket = null;
  const listeners = {};

  function emitLocal(ev, data) {
    const fns = listeners[ev] || [];
    for (const fn of fns) try { fn(data); } catch (e) { console.error(e); }
  }

  function on(ev, fn) {
    (listeners[ev] ||= []).push(fn);
  }

  function off(ev, fn) {
    if (!listeners[ev]) return;
    listeners[ev] = listeners[ev].filter(f => f !== fn);
  }

  function connect(url = '/', opts = {}) {
    // Allow websocket OR polling (polling helps behind restrictive networks/proxies)
    const options = Object.assign(
      { transports: ['websocket', 'polling'], path: '/socket.io' },
      opts
    );

    // io(...) is provided by <script src="/socket.io/socket.io.js"></script>
    socket = io(url, options);

    // Connection lifecycle
    socket.on('connect', () => {
      emitLocal('status', 'Connected');
      emitLocal('connect', socket.id);
    });

    socket.on('disconnect', (reason) => {
      emitLocal('status', `Disconnected (${reason})`);
    });

    socket.on('reconnect', (attempt) => {
      emitLocal('status', `Reconnected (#${attempt})`);
    });

    socket.on('connect_error', (err) => {
      console.error('socket connect_error:', err);
      emitLocal('status', 'Connect error');
      // Tip: socket.io will retry automatically; polling fallback usually succeeds.
    });

    socket.on('reconnect_error', (err) => {
      console.error('socket reconnect_error:', err);
    });

    socket.on('reconnect_failed', () => {
      console.error('socket reconnect_failed');
      emitLocal('status', 'Reconnect failed');
    });

    // --- App protocol (kept exactly as you had it) ---
    socket.on('init', (data) => emitLocal('init', data));
    socket.on('stroke', (op) => emitLocal('stroke', op));
    socket.on('removeOp', (data) => emitLocal('removeOp', data));
    socket.on('userJoined', (u) => emitLocal('userJoined', u));
    socket.on('userLeft', (u) => emitLocal('userLeft', u));
    socket.on('cursor', (c) => emitLocal('cursor', c));
    socket.on('clear', () => emitLocal('clear'));

    // Optional latency ping if your server supports it:
    setInterval(() => {
      if (socket && socket.connected) {
        const ts = Date.now();
        socket.emit('pingCheck', ts);
      }
    }, 5000);
    socket.on('pongCheck', (tsSent) => {
      const ms = Date.now() - tsSent;
      emitLocal('latency', ms);
    });
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  // Client -> Server
  function sendStroke(op) { socket && socket.emit('stroke', op); }
  function sendUndo() { socket && socket.emit('undo'); }
  function sendRedo() { socket && socket.emit('redo'); }
  function sendCursor(pos) { socket && socket.emit('cursor', pos); }
  function sendClear() { socket && socket.emit('clear'); }

  // Public API
  window.WS = {
    connect, disconnect, on, off,
    sendStroke, sendUndo, sendRedo, sendCursor, sendClear
  };
})();

// canvas.js - improved: backing canvas + transient partial-op rendering
(function(){
	const exports = {};

	function setupCanvas(canvas) {
		const ctx = canvas.getContext('2d');
		function resize() {
			const rect = canvas.getBoundingClientRect();
			canvas.width = Math.floor(rect.width);
			canvas.height = Math.floor(rect.height);
			if (exports._backingCanvas) {
				exports._backingCanvas.width = canvas.width;
				exports._backingCanvas.height = canvas.height;
				exports._redrawBacking();
			}
		}
		window.addEventListener('resize', resize);
		resize();
		return { canvas, ctx, resize };
	}

	exports.ops = [];
	exports.transients = new Map();
	exports._backingCanvas = null;
	exports._backingCtx = null;

	function ensureBacking(main) {
		if (!exports._backingCanvas) {
			exports._backingCanvas = document.createElement('canvas');
			exports._backingCanvas.width = main.width;
			exports._backingCanvas.height = main.height;
			exports._backingCtx = exports._backingCanvas.getContext('2d');
		}
	}

	exports.applyOp = function(op, ctx) {
		const points = op.points || [];
		if (!points.length) return;
		ctx.save();
		let isEraser = op.tool === 'eraser';
		if (isEraser) {
			ctx.globalCompositeOperation = 'destination-out';
			ctx.strokeStyle = 'rgba(0,0,0,1)';
		} else {
			ctx.globalCompositeOperation = 'source-over';
			ctx.strokeStyle = op.color || '#000';
		}
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = op.width || 4;

		if (op.tool === 'line' && points.length >= 2) {
			ctx.beginPath();
			ctx.moveTo(points[0].x, points[0].y);
			const last = points[points.length-1];
			ctx.lineTo(last.x, last.y);
			ctx.stroke();
			ctx.restore();
			return;
		}
		if (op.tool === 'rect' && points.length >= 2) {
			const a = points[0];
			const b = points[points.length-1];
			const x = Math.min(a.x, b.x);
			const y = Math.min(a.y, b.y);
			const w = Math.abs(a.x - b.x);
			const h = Math.abs(a.y - b.y);
			ctx.beginPath();
			ctx.strokeRect(x, y, w, h);
			ctx.restore();
			return;
		}
		if (op.tool === 'triangle' && points.length >= 2) {
			const a = points[0];
			const b = points[points.length-1];
			// Equilateral-ish triangle based on drag bounding box
			const midX = (a.x + b.x) / 2;
			ctx.beginPath();
			ctx.moveTo(midX, a.y); // top vertex
			ctx.lineTo(b.x, b.y);  // bottom right
			ctx.lineTo(a.x, b.y);  // bottom left
			ctx.closePath();
			ctx.stroke();
			ctx.restore();
			return;
		}
		if (op.tool === 'circle' && points.length >= 2) {
			const a = points[0];
			const b = points[points.length-1];
			const rx = (b.x - a.x);
			const ry = (b.y - a.y);
			const r = Math.sqrt(rx*rx + ry*ry);
			ctx.beginPath();
			ctx.arc(a.x, a.y, r, 0, Math.PI*2);
			ctx.stroke();
			ctx.restore();
			return;
		}

		if (op.tool === 'symbol' && points.length >= 1 && op.symbol) {
			const p = points[0];
			const fontSize = Math.max(12, op.fontSize || 24);
			ctx.fillStyle = op.color || '#000';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
			ctx.fillText(op.symbol, p.x, p.y);
			ctx.restore();
			return;
		}

		// default: freehand / eraser path
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		for (let i=1;i<points.length;i++){
			const p = points[i];
			const prev = points[i-1];
			const cx = (prev.x + p.x)/2;
			const cy = (prev.y + p.y)/2;
			ctx.quadraticCurveTo(prev.x, prev.y, cx, cy);
		}
		ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
		ctx.stroke();
		ctx.restore();
	};

	exports.reRender = function() {
		const canvas = document.getElementById('canvas');
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		// Always clear the main canvas first to avoid ghost pixels after undo/clear
		ctx.clearRect(0,0,canvas.width,canvas.height);
		if (exports._backingCanvas) ctx.drawImage(exports._backingCanvas, 0, 0);
		for (const [, op] of exports.transients) exports.applyOp(op, ctx);
	};

	exports._redrawBacking = function() {
		if (!exports._backingCanvas) return;
		const bctx = exports._backingCtx;
		bctx.clearRect(0,0,exports._backingCanvas.width, exports._backingCanvas.height);
		for (const op of exports.ops) {
			if (op && op.final) exports.applyOp(op, bctx);
		}
	};

	exports.removeOp = function(opId) {
		// remove any transient preview with same id
		exports.transients.delete(opId);
		const idx = exports.ops.findIndex(o => o.id === opId);
		if (idx !== -1) {
			exports.ops.splice(idx, 1);
			// ensure we have a backing canvas when there are remaining ops
			const main = document.getElementById('canvas');
			if (exports.ops.length > 0 && main) {
				if (!exports._backingCanvas || !exports._backingCtx) {
					exports._backingCanvas = document.createElement('canvas');
					exports._backingCanvas.width = main.width;
					exports._backingCanvas.height = main.height;
					exports._backingCtx = exports._backingCanvas.getContext('2d');
				}
				exports._redrawBacking();
			} else if (exports._backingCtx && exports._backingCanvas) {
				// no ops left; clear backing
				exports._backingCtx.clearRect(0,0,exports._backingCanvas.width,exports._backingCanvas.height);
			}
		}
		exports.reRender();
	};

	exports.addOrReplaceOp = function(op) {
		if (op.final) {
			exports.transients.delete(op.id);
			const idx = exports.ops.findIndex(o => o.id === op.id);
			if (idx !== -1) exports.ops[idx] = op; else exports.ops.push(op);
			ensureBacking(document.getElementById('canvas'));
			exports.applyOp(op, exports._backingCtx);
			exports.reRender();
		} else {
			exports.transients.set(op.id, op);
			exports.reRender();
		}
	};

	window.CanvasApp = exports;
	window.setupCanvas = setupCanvas;
})();
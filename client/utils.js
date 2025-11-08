// client/utils.js - small helpers for the canvas app (non-module, exposes window.Utils)
(function(){
	const Utils = {};

	// Generate a short unique id with optional prefix
	Utils.uid = function(prefix = 'id') {
		return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
	};

	// Simple throttle: ensures fn runs at most once per wait ms
	Utils.throttle = function(fn, wait){
		let last = 0;
		let timeout = null;
		return function(...args){
			const now = Date.now();
			const remaining = wait - (now - last);
			if (remaining <= 0) {
				if (timeout) { clearTimeout(timeout); timeout = null; }
				last = now;
				fn.apply(this, args);
			} else if (!timeout) {
				timeout = setTimeout(() => {
					last = Date.now();
					timeout = null;
					fn.apply(this, args);
				}, remaining);
			}
		};
	};

	// Debounce: run fn after wait ms of inactivity
	Utils.debounce = function(fn, wait){
		let t = null;
		return function(...args){
			if (t) clearTimeout(t);
			t = setTimeout(()=> fn.apply(this, args), wait);
		};
	};

	Utils.distance = function(a,b){
		const dx = a.x - b.x; const dy = a.y - b.y; return Math.sqrt(dx*dx + dy*dy);
	};

	// Get event position relative to canvas top-left (useful for pointer events)
	Utils.getCanvasPos = function(evt, canvas){
		const rect = canvas.getBoundingClientRect();
		const x = (evt.clientX !== undefined) ? evt.clientX - rect.left : (evt.touches && evt.touches[0] && evt.touches[0].clientX - rect.left) || 0;
		const y = (evt.clientY !== undefined) ? evt.clientY - rect.top : (evt.touches && evt.touches[0] && evt.touches[0].clientY - rect.top) || 0;
		return { x: Math.round(x), y: Math.round(y) };
	};

	// clamp and lerp helpers
	Utils.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
	Utils.lerp = (a,b,t) => a + (b-a)*t;

	// Simplify points by removing points that are within `minDist` of the previous
	// This is a fast filter (not RDP) to reduce point count while preserving shape
	Utils.simplifyByDistance = function(points, minDist = 2){
		if (!points || points.length <= 2) return points.slice();
		const out = [points[0]];
		let last = points[0];
		for (let i=1;i<points.length;i++){
			const p = points[i];
			if (Utils.distance(last, p) >= minDist) {
				out.push(p);
				last = p;
			}
		}
		// always include final point
		if (out[out.length-1] !== points[points.length-1]) out.push(points[points.length-1]);
		return out;
	};

	// Average a list of points (useful for smoothing)
	Utils.averagePoints = function(points){
		if (!points || points.length === 0) return [];
		const avg = { x:0, y:0 };
		for (const p of points){ avg.x += p.x; avg.y += p.y; }
		avg.x /= points.length; avg.y /= points.length; return avg;
	};

	window.Utils = Utils;
})();
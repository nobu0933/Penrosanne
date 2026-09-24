import { handDisplayTile, handTileLayout } from './HandTileLayout.js';

// 表示専用の持ち上げ・運搬・着地。配置確定は呼び出し側のGameEngineが扱う。
export class TileDrag {
	constructor({ view, overlay, hand, getTile, getCandidates, canStart, onPreview, onChange }) {
		Object.assign(this, { view, overlay, hand, getTile, getCandidates, canStart, onPreview, onChange });
		this.ctx = overlay.getContext('2d');
		this.active = null;
		this.frame = null;
		this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
		window.addEventListener('pointermove', event => this.move(event));
		window.addEventListener('pointerup', event => this.release(event));
		window.addEventListener('pointercancel', event => { if (event.pointerId === this.active?.pointerId) this.cancel(); });
		window.addEventListener('pointerdown', event => {
			if (event.pointerType === 'touch' && this.active && event.pointerId !== this.active.pointerId) this.cancel();
		}, true);
		window.addEventListener('blur', () => this.cancel());
		window.addEventListener('resize', () => { this.cancel(true); this.resize(); });
		this.resize();
		hand?.addEventListener('pointerdown', event => this.begin(event, null, true));
	}
	get busy() { return Boolean(this.active); }
	resize() {
		const dpr = devicePixelRatio || 1;
		this.overlay.width = innerWidth * dpr; this.overlay.height = innerHeight * dpr;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}
	boardPosition(tile) {
		const point = this.view.screenFromWorldPoint({ x: tile.centerX, y: tile.centerY });
		const rect = this.view.canvas.getBoundingClientRect();
		return { x: rect.left + point.x, y: rect.top + point.y, side: this.view.options.side * this.view.camera.zoom };
	}
	begin(event, preview = null, fromHand = false, handElement = this.hand) {
		if (event.button !== 0 || this.busy || !this.canStart() || (!preview && !fromHand)) return;
		const tile = preview || this.getTile?.();
		if (!tile) return;
		const displayTile = fromHand ? handDisplayTile(tile) : tile;
		const handRect = fromHand ? handElement.getBoundingClientRect() : null;
		const handLayout = fromHand ? handTileLayout(displayTile, handRect.width, handRect.height) : null;
		const origin = fromHand
			? { x: handRect.left + handLayout.x, y: handRect.top + handLayout.y, side: handLayout.side }
			: this.boardPosition(tile);
		event.preventDefault();
		this.active = { tile: displayTile, sourceTile: tile, preview, fromHand, origin, x: origin.x, y: origin.y, side: origin.side, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, started: performance.now(), lift: 0 };
		// 公開手札のDOMが再配置されてもポインター捕捉を維持する。
		this.capture = this.view.canvas;
		this.capture?.setPointerCapture?.(event.pointerId);
		this.onPreview(null);
		this.onChange();
		const lift = now => {
			if (!this.active || this.active.settling) return;
			this.active.lift = 10 * (this.reduced.matches ? 1 : Math.min(1, (now - this.active.started) / 100));
			this.draw();
			if (this.active.lift < 10) this.frame = requestAnimationFrame(lift);
		};
		this.frame = requestAnimationFrame(lift);
	}
	move(event) {
		const active = this.active;
		if (!active || active.settling || event.pointerId !== active.pointerId) return;
		active.x = active.origin.x + event.clientX - active.startX;
		active.y = active.origin.y + event.clientY - active.startY;
		this.updateTarget(event);
		this.draw();
	}
	updateTarget(event) {
		const active = this.active;
		const top = document.elementFromPoint(event.clientX, event.clientY);
		const onBoard = top === this.view.canvas;
		const rect = this.view.canvas.getBoundingClientRect();
		const world = this.view.worldPoint({ x: active.x - rect.left, y: active.y - rect.top });
		const distance = tile => Math.hypot(tile.centerX - world.x, tile.centerY - world.y);
		const candidates = onBoard ? this.getCandidates(active.sourceTile).filter(tile => distance(tile) < this.view.options.side * .65) : [];
		let nearest = candidates.sort((a,b) => distance(a) - distance(b))[0] || null;
		if (nearest && active.target && candidates.includes(active.target) && distance(active.target) <= distance(nearest) + this.view.options.side * .08) nearest = active.target;
		active.target = nearest;
		this.view.dropTarget = nearest;
		this.view.render();
	}
	release(event) {
		if (!this.active || this.active.settling || event.pointerId !== this.active.pointerId) return;
		this.move(event);
		const target = this.active.target;
		this.settle(target ? this.boardPosition(target) : this.active.origin, target || this.active.preview);
	}
	cancel(immediate = false) {
		if (!this.active) return;
		if (immediate) { const preview = this.active.preview; this.finish(preview); return; }
		this.settle(this.active.origin, this.active.preview);
	}
	settle(destination, preview) {
		cancelAnimationFrame(this.frame);
		const active = this.active;
		active.settling = true;
		const from = { x: active.x, y: active.y, side: active.side, lift: active.lift };
		const start = performance.now(), duration = this.reduced.matches ? 0 : 100;
		const rotation = active.tile.rotation || 0;
		const targetRotation = preview?.rotation ?? rotation;
		const angle = Math.atan2(Math.sin(targetRotation - rotation), Math.cos(targetRotation - rotation));
		// 目的候補の地形変換を描画にも適用し、最後のフレームと仮置きを一致させる。
		if (preview) active.tile = { ...preview, rotation };
		const tick = now => {
			if (this.active !== active) return;
			const t = duration ? Math.min(1, (now - start) / duration) : 1, eased = 1 - (1-t)**3;
			for (const key of ['x','y','side']) active[key] = from[key] + (destination[key] - from[key]) * eased;
			active.lift = from.lift * (1-eased);
			active.tile = { ...active.tile, rotation: rotation + angle * eased };
			this.draw();
			if (t < 1) this.frame = requestAnimationFrame(tick);
			else this.finish(preview);
		};
		this.frame = requestAnimationFrame(tick);
	}
	finish(preview) {
		cancelAnimationFrame(this.frame);
		const pointerId = this.active?.pointerId;
		this.active = null;
		this.view.dropTarget = null;
		if (pointerId !== undefined && this.capture?.hasPointerCapture?.(pointerId)) this.capture.releasePointerCapture(pointerId);
		this.capture = null;
		this.ctx.clearRect(0,0,innerWidth,innerHeight);
		this.onPreview(preview || null);
		this.onChange();
	}
	draw() {
		this.ctx.clearRect(0,0,innerWidth,innerHeight);
		const active = this.active;
		if (active) this.view.drawTileAtScreen(this.ctx, active.tile, active.x, active.y, active.side, active.lift);
	}
}

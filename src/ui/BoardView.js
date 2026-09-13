import { edgeIndex, edgeVertexPairs, verticesFor } from '../game/Tile.js';
import { loadMeepleImages, meepleKindForFeature, meepleLayerColors, playerColor } from './MeepleAssets.js';

const palette = {
	field: '#a9c579',
	road: '#c69b67',
	city: '#b55850',
	monastery: '#d9b462',
};
// ミープル配置時の対象領域。通常色から少しだけ色相をずらし、輪郭を増やさずに
// 対象の道・都市・修道院を見分けられるようにする。
const hoverPalette = {
	road: { theme: 'rgba(62, 174, 198, .48)', outer: '#57b8c8', inner: '#1f6979' },
	city: { theme: 'rgba(255, 202, 82, .48)', fill: 'rgba(231, 137, 72, .92)', stroke: '#ffd26a' },
	monastery: { theme: 'rgba(100, 174, 235, .48)', fill: '#83b8e2', stroke: '#306b96', detail: '#275777' },
};
const lerp = (from, to, amount) => ({
	x: from.x + (to.x - from.x) * amount,
	y: from.y + (to.y - from.y) * amount,
});
const midpoint = (one, two) => ({ x: (one.x + two.x) / 2, y: (one.y + two.y) / 2 });
const pointDistance = (one, two) => Math.hypot(one.x - two.x, one.y - two.y);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export class BoardView {
	constructor(canvas, options) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.options = options;
		this.camera = { x: 0, y: 0, zoom: 1 };
		this.drag = null;
		this.candidatesVisible = true;
		this.selected = null;
		this.previewTile = null;
		this.featureMarkers = [];
		this.meeples = [];
		// タイル一覧など、ゲーム状態に属さない常設の表示用ミープル。
		// `meeples` をゲーム画面の状態更新で差し替えても消えないよう分離する。
		this.staticMeeples = [];
		this.hoverMarker = null;
		this.markerDrag = null;
		this.touchPoints = new Map();
		this.pinch = null;
		this.tileTheme = options.tileTheme || null;
		this.meepleImages = loadMeepleImages(() => this.render());
		this.tintedMeeples = new Map();
		this.resize();
		this.bind();
	}
	setStaticMeeples(meeples) {
		this.staticMeeples = Array.isArray(meeples) ? meeples.map((meeple) => ({ ...meeple })) : [];
		this.render();
	}
	resize() {
		const rect = this.canvas.getBoundingClientRect(),
			dpr = devicePixelRatio || 1;
		this.canvas.width = rect.width * dpr;
		this.canvas.height = rect.height * dpr;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.width = rect.width;
		this.height = rect.height;
	}
	bind() {
		window.addEventListener('resize', () => {
			this.resize();
			this.render();
		});
		this.canvas.addEventListener('pointerdown', (event) => {
			if (event.pointerType === 'touch') {
				this.touchPoints.set(event.pointerId, this.screenPoint(event));
				if (this.touchPoints.size >= 2 && this.options.allowCameraControls !== false) {
					// 二本指になった時点で一指のクリック／ドラッグとしては扱わない。
					this.drag = null;
					this.markerDrag = null;
					this.beginPinch();
					this.canvas.setPointerCapture(event.pointerId);
					event.preventDefault();
					return;
				}
			}
			const world = this.worldPoint(this.screenPoint(event));
			const marker = this.markerAt(world);
			if (this.options.anchorEditMode?.() && marker) {
				this.markerDrag = { marker, pointerId: event.pointerId };
				this.hoverMarker = marker;
				this.canvas.setPointerCapture(event.pointerId);
				event.preventDefault();
				this.render();
				return;
			}
			if (
				this.previewTile &&
				Math.hypot(this.previewTile.centerX - world.x, this.previewTile.centerY - world.y) <
					this.options.side
			) {
				this.options.onPreviewDragStart?.(event);
				return;
			}
			if (this.options.allowCameraControls === false) return;
			this.drag = { x: event.clientX, y: event.clientY, moved: false };
			this.canvas.setPointerCapture(event.pointerId);
		});
		this.canvas.addEventListener('pointermove', (event) => {
			if (event.pointerType === 'touch' && this.touchPoints.has(event.pointerId)) {
				this.touchPoints.set(event.pointerId, this.screenPoint(event));
				if (this.pinch) {
					this.updatePinch();
					return;
				}
			}
			if (this.markerDrag) {
				const world = this.worldPoint(this.screenPoint(event));
				this.hoverMarker = this.markerDrag.marker;
				this.options.onFeatureDrag?.(this.markerDrag.marker, world);
				this.render();
				return;
			}
			if (!this.drag) {
				const world = this.worldPoint(this.screenPoint(event));
				const marker = this.markerAt(world);
				if (marker !== this.hoverMarker) {
					this.hoverMarker = marker;
					this.render();
				}
				return;
			}
			const dx = event.clientX - this.drag.x,
				dy = event.clientY - this.drag.y;
			if (Math.hypot(dx, dy) > 3) this.drag.moved = true;
			this.camera.x += dx;
			this.camera.y += dy;
			this.drag.x = event.clientX;
			this.drag.y = event.clientY;
			this.render();
		});
		this.canvas.addEventListener('pointerleave', () => {
			if (this.markerDrag) return;
			if (this.hoverMarker) {
				this.hoverMarker = null;
				this.render();
			}
		});
		this.canvas.addEventListener('pointerup', (event) => {
			if (this.finishPinchPointer(event)) return;
			if (this.markerDrag) {
				this.options.onFeatureDragEnd?.(this.markerDrag.marker, this.worldPoint(this.screenPoint(event)));
				this.markerDrag = null;
				return;
			}
			if (!this.drag?.moved) this.pick(event);
			this.drag = null;
		});
		this.canvas.addEventListener('pointercancel', (event) => {
			if (this.finishPinchPointer(event)) return;
			this.touchPoints.delete(event.pointerId);
			if (this.markerDrag?.pointerId === event.pointerId) this.markerDrag = null;
			this.drag = null;
		});
		this.canvas.addEventListener(
			'wheel',
			(event) => {
				if (this.options.allowCameraControls === false) return;
				event.preventDefault();
				const scale = event.deltaY < 0 ? 1.1 : 0.9;
				this.camera.zoom = Math.max(0.2, Math.min(2.8, this.camera.zoom * scale));
				this.render();
			},
			{ passive: false },
		);
	}
	beginPinch() {
		const points = [...this.touchPoints.values()];
		if (points.length < 2) return;
		const center = midpoint(points[0], points[1]);
		this.pinch = {
			distance: pointDistance(points[0], points[1]),
			zoom: this.camera.zoom,
			world: this.worldPoint(center),
		};
	}
	updatePinch() {
		const points = [...this.touchPoints.values()];
		if (!this.pinch || points.length < 2) return;
		const distance = pointDistance(points[0], points[1]);
		if (distance < 1 || this.pinch.distance < 1) return;
		const center = midpoint(points[0], points[1]);
		const zoom = clamp(this.pinch.zoom * (distance / this.pinch.distance), .2, 2.8);
		// 指の中点の下にあった盤面座標を保つため、倍率と同時にカメラ座標も補正する。
		this.zoomAt(this.pinch.world, center, zoom);
		this.render();
	}
	finishPinchPointer(event) {
		if (event.pointerType !== 'touch') return false;
		const wasPinching = Boolean(this.pinch);
		this.touchPoints.delete(event.pointerId);
		if (!wasPinching) return false;
		if (this.touchPoints.size < 2) {
			this.pinch = null;
			const [remaining] = this.touchPoints.values();
			// 片方の指を離した後は、そのまま一指で盤面移動を続けられる。
			this.drag = remaining && this.options.allowCameraControls !== false
				? { x: remaining.x, y: remaining.y, moved: true }
				: null;
		}
		return true;
	}
	zoomAt(world, screen, zoom) {
		this.camera.zoom = zoom;
		this.camera.x = screen.x - this.width / 2 - world.x * zoom;
		this.camera.y = screen.y - this.height / 2 - world.y * zoom;
	}
	reset() {
		this.camera = { x: 0, y: 0, zoom: 1 };
		this.selected = null;
		this.render();
	}
	screenPoint(event) {
		const rect = this.canvas.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}
	worldPoint(point) {
		return {
			x: (point.x - this.width / 2 - this.camera.x) / this.camera.zoom,
			y: (point.y - this.height / 2 - this.camera.y) / this.camera.zoom,
		};
	}
	screenFromWorldPoint(point) {
		return {
			x: this.width / 2 + this.camera.x + point.x * this.camera.zoom,
			y: this.height / 2 + this.camera.y + point.y * this.camera.zoom,
		};
	}
	pick(event) {
		const world = this.worldPoint(this.screenPoint(event));
		const marker = this.markerAt(world);
		if (marker) {
			this.options.onFeatureSelect?.(marker);
			return;
		}
		if (!this.candidatesVisible) return;
		const hit = this.options.candidates.find(
			(tile) =>
				Math.hypot(tile.centerX - world.x, tile.centerY - world.y) < this.options.side * 0.8,
		);
		if (hit) {
			this.selected = hit._candidateKey || hit.id;
			this.options.onSelect?.(hit);
			this.render();
		}
	}
	markerAt(world) {
		return this.featureMarkers.find(
			(item) => Math.hypot(item.x - world.x, item.y - world.y) < this.options.side * 0.16,
		);
	}
	render() {
		const ctx = this.ctx;
		this.hoveredFeatures = this.hoveredFeatureMap();
		ctx.clearRect(0, 0, this.width, this.height);
		ctx.save();
		ctx.translate(this.width / 2 + this.camera.x, this.height / 2 + this.camera.y);
		ctx.scale(this.camera.zoom, this.camera.zoom);
		this.options.placed.forEach((tile) => this.drawTile(ctx, tile, false));
		if (this.candidatesVisible)
			(this.options.structuralCandidates || []).forEach((tile) => this.drawStructuralOutline(ctx, tile));
		if (this.candidatesVisible)
			this.options.candidates.forEach((tile) => this.drawTile(ctx, tile, true));
		if (this.previewTile) this.drawTile(ctx, this.previewTile, true, true);
		this.drawFeatureMarkers(ctx);
		this.drawMeeples(ctx);
		ctx.restore();
	}
	hoveredFeatureMap() {
		const result = new Map(), component = this.hoverMarker?.component;
		if (!component) return result;
		for (const { tile, index } of component.features) result.set(`${tile.id}:${component.type}:${index}`, component);
		return result;
	}
	highlightFor(tile, type, index) {
		return this.hoveredFeatures?.get(`${tile.id}:${type}:${index}`) || null;
	}
	drawTile(ctx, tile, candidate, preview = false) {
		const points = verticesFor(tile, this.options.side),
			ids = Object.keys(points),
			candidateColor = '#0c736d';
		ctx.save();
		ctx.beginPath();
		ids.forEach((id, index) => {
			const p = points[id];
			index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
		});
		ctx.closePath();
		ctx.fillStyle = candidate
			? (tile._candidateKey || tile.id) === this.selected ? 'rgba(12,115,109,.26)' : 'rgba(12,115,109,.11)'
			: palette.field;
		ctx.fill();
		ctx.lineWidth = candidate ? 2 : 3;
		ctx.strokeStyle = candidate ? candidateColor : '#425e50';
		ctx.setLineDash(candidate ? [7, 5] : []);
		ctx.stroke();
		ctx.setLineDash([]);
		if (!candidate || preview) {
			this.drawFeatures(ctx, tile, points);
			if (this.options.showVertices())
				this.drawVertices(ctx, points);
		} else {
			ctx.fillStyle = candidateColor;
			ctx.font = '11px DM Mono';
			ctx.textAlign = 'center';
			ctx.fillText(tile.shape.toUpperCase(), tile.centerX, tile.centerY + 4);
		}
		ctx.restore();
	}
	drawStructuralOutline(ctx, tile) {
		const points = verticesFor(tile, this.options.side), ids = Object.keys(points);
		ctx.save();
		ctx.beginPath();
		ids.forEach((id, index) => {
			const point = points[id];
			index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
		});
		ctx.closePath();
		ctx.strokeStyle = '#b8bcb7';
		ctx.lineWidth = 1.8;
		ctx.setLineDash([]);
		ctx.stroke();
		ctx.restore();
	}
	drawFeatures(ctx, tile, points) {
		const cx = tile.centerX,
			cy = tile.centerY;
		(tile.featureGroups?.field || []).forEach((group, index) => {
			const themed = this.drawThemedLayer(ctx, tile, 'field', index), highlight = this.highlightFor(tile, 'field', index);
			if (!highlight) return;
			if (themed) this.drawThemedLayer(ctx, tile, 'field', index, 'rgba(39, 125, 180, .42)');
			else {
				if (highlight.scoreFields) this.tintFieldScoreSubregions(ctx, tile, points, tile.fieldScoreGroups?.[index] || []);
				else this.drawFieldHighlight(ctx, tile, points, group);
			}
		});
		(tile.featureGroups?.road || []).forEach((_, index) => {
			const themed = this.drawThemedLayer(ctx, tile, 'road', index), highlight = this.highlightFor(tile, 'road', index);
			if (!themed) this.drawRoadGroup(ctx, tile, points, index);
			if (highlight) {
				if (themed) this.drawThemedLayer(ctx, tile, 'road', index, hoverPalette.road.theme);
				else this.drawRoadGroup(ctx, tile, points, index, { ...hoverPalette.road, width: 16 });
			}
		});
		(tile.featureGroups?.city || []).forEach((_, index) => {
			const themed = this.drawThemedLayer(ctx, tile, 'city', index), highlight = this.highlightFor(tile, 'city', index);
			if (!themed) this.drawCityGroup(ctx, tile, points, index);
			if (highlight) {
				if (themed) this.drawThemedLayer(ctx, tile, 'city', index, hoverPalette.city.theme);
				else this.drawCityGroup(ctx, tile, points, index, hoverPalette.city);
			}
		});
		if (
			Object.values(tile.roadTerminals || {}).some((terminals) =>
				terminals.some((terminal) => terminal.kind === 'intersection'),
			)
		) {
			if (!this.drawThemedLayer(ctx, tile, 'intersection', 0)) {
				ctx.beginPath();
				ctx.arc(tile.centerX, tile.centerY, 8, 0, Math.PI * 2);
				ctx.fillStyle = palette.field;
				ctx.fill();
				ctx.strokeStyle = '#745536';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
		}
		if (tile.hasMonastery) {
			const themed = this.drawThemedLayer(ctx, tile, 'monastery', 0), highlight = this.highlightFor(tile, 'monastery', 0);
			if (themed) {
				if (highlight) this.drawThemedLayer(ctx, tile, 'monastery', 0, hoverPalette.monastery.theme);
				return;
			}
			ctx.beginPath();
			ctx.arc(cx, cy, 16, 0, Math.PI * 2);
			ctx.fillStyle = highlight ? hoverPalette.monastery.fill : palette.monastery;
			ctx.fill();
			ctx.strokeStyle = highlight ? hoverPalette.monastery.stroke : '#8d6e38';
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.fillStyle = highlight ? hoverPalette.monastery.detail : '#7b5c2b';
			ctx.fillRect(cx - 3, cy - 15, 6, 10);
		}
	}
	drawThemedLayer(ctx, tile, layer, index, tint = null) {
		return this.tileTheme?.draw(ctx, tile, layer, index, this.options.side, { tint }) || false;
	}
	groupEdges(tile, type, index) {
		const group = tile.featureGroups?.[type]?.[index];
		return (Array.isArray(group) ? group : group?.boundaryEdges || [])
			.map(edgeIndex)
			.filter((edge) => edge >= 0);
	}
	edgeMidpoint(points, pair) {
		return {
			x: (points[pair[0]].x + points[pair[1]].x) / 2,
			y: (points[pair[0]].y + points[pair[1]].y) / 2,
		};
	}
	anchorPoint(tile, group) {
		const anchor = group?.anchor;
		if (!anchor) return { x: tile.centerX, y: tile.centerY };
		const x = anchor.x * this.options.side,
			y = anchor.y * this.options.side,
			cos = Math.cos(tile.rotation || 0),
			sin = Math.sin(tile.rotation || 0);
		return { x: tile.centerX + x * cos - y * sin, y: tile.centerY + x * sin + y * cos };
	}
	drawRoadGroup(ctx, tile, points, index, style = {}) {
		const pairs = edgeVertexPairs(tile.shape),
			edges = this.groupEdges(tile, 'road', index),
			terminals = tile.roadTerminals?.[index] || [];
		const outer = style.outer || palette.road,
			inner = style.inner || '#745536',
			width = style.width || 16,
			intersection = terminals.some((terminal) => terminal.kind === 'intersection');
		for (const edge of edges) {
			const midpoint = this.edgeMidpoint(points, pairs[edge]),
				end = intersection
					? lerp(midpoint, { x: tile.centerX, y: tile.centerY }, 0.78)
					: { x: tile.centerX, y: tile.centerY };
			ctx.beginPath();
			ctx.moveTo(midpoint.x, midpoint.y);
			ctx.lineTo(end.x, end.y);
			ctx.strokeStyle = outer;
			ctx.lineWidth = width;
			ctx.lineCap = 'round';
			ctx.stroke();
			ctx.strokeStyle = inner;
			ctx.lineWidth = Math.max(1.5, width / 8);
			ctx.stroke();
		}
	}
	drawCityGroup(ctx, tile, points, index, style = {}) {
		const pairs = edgeVertexPairs(tile.shape),
			edges = this.groupEdges(tile, 'city', index),
			fill = style.fill || palette.city,
			stroke = style.stroke || '#813f3a';
		if (edges.length === 4) {
			ctx.beginPath();
			Object.values(points).forEach((point, pointIndex) =>
				pointIndex ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
			);
			ctx.closePath();
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.strokeStyle = stroke;
			ctx.lineWidth = 1.8;
			ctx.stroke();
			return;
		}
		const roadConnects = Object.values(tile.roadTerminals || {}).some((terminals) =>
			terminals.some((terminal) => terminal.kind === 'city' && terminal.cityGroup === index),
		);
		const innerPoints = [];
		for (const edge of edges) {
			const [a, b] = pairs[edge],
				midpoint = this.edgeMidpoint(points, [a, b]),
				control = lerp(midpoint, { x: tile.centerX, y: tile.centerY }, roadConnects ? 1.52 : 0.62);
			innerPoints.push(
				lerp(midpoint, { x: tile.centerX, y: tile.centerY }, roadConnects ? 0.76 : 0.31),
			);
			ctx.beginPath();
			ctx.moveTo(points[a].x, points[a].y);
			ctx.lineTo(points[b].x, points[b].y);
			ctx.quadraticCurveTo(control.x, control.y, points[a].x, points[a].y);
			ctx.closePath();
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.strokeStyle = stroke;
			ctx.lineWidth = 1.8;
			ctx.stroke();
		}
		if (innerPoints.length > 1) {
			ctx.beginPath();
			ctx.moveTo(innerPoints[0].x, innerPoints[0].y);
			innerPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
			ctx.strokeStyle = fill;
			ctx.lineWidth = 12;
			ctx.lineCap = 'round';
			ctx.stroke();
		}
	}
	drawFieldHighlight(ctx, tile, points, group) {
		const pairs = edgeVertexPairs(tile.shape),
			anchor = this.anchorPoint(tile, group),
			edges = (group?.boundaryEdges || []).map(edgeIndex).filter((edge) => edge >= 0);
		for (const edge of edges) {
			const [a, b] = pairs[edge],
				midpoint = this.edgeMidpoint(points, [a, b]),
				inset = lerp(midpoint, { x: tile.centerX, y: tile.centerY }, 0.14);
			ctx.beginPath();
			ctx.moveTo(points[a].x, points[a].y);
			ctx.quadraticCurveTo(inset.x, inset.y, points[b].x, points[b].y);
			ctx.strokeStyle = 'rgba(39, 125, 180, .88)';
			ctx.lineWidth = 7;
			ctx.stroke();
		}
		ctx.beginPath();
		ctx.arc(anchor.x, anchor.y, 16, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(39, 125, 180, .28)';
		ctx.fill();
		ctx.strokeStyle = 'rgba(19, 89, 131, .95)';
		ctx.lineWidth = 2;
		ctx.stroke();
	}
	tintFieldScoreSubregions(ctx, tile, points, subregions) {
		const ids = Object.keys(points),
			center = { x: tile.centerX, y: tile.centerY };
		for (const subregion of subregions) {
			const index = subregion - 1,
				vertex = points[ids[index]],
				previous = points[ids[(index + 3) % 4]],
				next = points[ids[(index + 1) % 4]];
			const before = this.edgeMidpoint({ previous, vertex }, ['previous', 'vertex']),
				after = this.edgeMidpoint({ vertex, next }, ['vertex', 'next']);
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(center.x, center.y);
			ctx.lineTo(before.x, before.y);
			ctx.lineTo(vertex.x, vertex.y);
			ctx.lineTo(after.x, after.y);
			ctx.closePath();
			ctx.clip();
			ctx.fillStyle = 'rgba(236, 246, 187, .52)';
			ctx.fillRect(
				tile.centerX - this.options.side,
				tile.centerY - this.options.side,
				this.options.side * 2,
				this.options.side * 2,
			);
			ctx.restore();
		}
	}
	drawVertices(ctx, points) {
		Object.values(points).forEach((p) => {
			ctx.beginPath();
			ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
			ctx.fillStyle = '#fffdf7';
			ctx.fill();
			ctx.strokeStyle = '#34453e';
			ctx.lineWidth = 1.5;
			ctx.stroke();
		});
	}
	drawFeatureMarkers(ctx) {
		for (const marker of this.featureMarkers) {
			if (marker.hideIcon) continue;
			ctx.save();
			const permanent = marker.option.type === 'field';
			// 配置候補もミープルSVGだけを表示する。丸・四角の補助記号は使わない。
			const size = (permanent ? 21 : 23) * (this.options.meepleScale ?? 1);
			this.drawMeepleIcon(ctx, meepleKindForFeature(marker.option.type), marker.x, marker.y, size, size, '#0c736d');
			ctx.restore();
		}
	}
	drawMeepleIcon(ctx, kind, x, y, width, height, color) {
		const layers = this.meepleImages[kind];
		if (!layers?.front?.naturalWidth) return false;
		const colors = meepleLayerColors(color);
		if (this.options.preserveMeepleColor) {
			ctx.save();
			for (const layer of ['dark', 'light', 'front']) {
				const image = layers[layer];
				if (image?.naturalWidth) ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
			}
			ctx.restore();
			return true;
		}
		ctx.save();
		for (const layer of ['dark', 'light', 'front']) {
			const tinted = this.tintedMeeple(kind, layer, colors[layer]);
			if (tinted) ctx.drawImage(tinted, x - width / 2, y - height / 2, width, height);
		}
		ctx.restore();
		return true;
	}
	tintedMeeple(kind, layer, color) {
		const image = this.meepleImages[kind]?.[layer], key = `${kind}:${layer}:${color}`;
		if (!image?.naturalWidth) return null;
		if (this.tintedMeeples.has(key)) return this.tintedMeeples.get(key);
		const canvas = document.createElement('canvas');
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const tint = canvas.getContext('2d');
		// 通常CanvasはSVGの透明マスクを維持する。OffscreenCanvasはキャッシュ済みSVGで
		// 空のビットマップを返す環境があるため、ここでは使わない。
		tint.drawImage(image, 0, 0, canvas.width, canvas.height);
		tint.globalCompositeOperation = 'source-in';
		tint.fillStyle = color;
		tint.fillRect(0, 0, canvas.width, canvas.height);
		this.tintedMeeples.set(key, canvas);
		return canvas;
	}
	drawMeeples(ctx) {
		for (const meeple of [...this.meeples, ...this.staticMeeples]) {
			ctx.save();
			const highlighted = meeple.playerIndex === this.highlightPlayerIndex;
			const kind = meepleKindForFeature(meeple.option?.type);
			// 各アセットは56×56の正方形。寝そべり／直立の見た目の違いは画像内の
			// 余白とシルエットで表し、ここで縦横比を変えて歪ませない。
			const baseSize = (kind === 'lying' ? 28 : 26) * (this.options.meepleScale ?? 1);
			const scale = (highlighted ? 1.18 : 1) * (meeple.displayScale || 1), size = baseSize * scale;
			if (highlighted || meeple.galleryMarker) {
				ctx.shadowColor = '#0c736d';
				ctx.shadowBlur = meeple.galleryMarker ? 3 : 8;
			}
			this.drawMeepleIcon(ctx, kind, meeple.x, meeple.y, size, size, playerColor(meeple.playerIndex));
			ctx.restore();
		}
	}
}

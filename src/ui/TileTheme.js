import { edgeIndex, localVertices } from '../game/Tile.js';
import { THEME_IMAGE_FORMATS } from './ThemeCatalog.js';

const MIRROR_SUFFIX = '-mirror';
const roundedPaths = new Map();

// Canvas のパスは描画先の状態を持たないので、テーマの各レイヤーでも共用できる。
export function roundedTileShapePath(shape, side, scale = 0.985, cornerRatio = 0.075) {
	const key = `${shape}:${side}:${scale}:${cornerRatio}`;
	if (roundedPaths.has(key)) return roundedPaths.get(key);
	const path = new Path2D();
	roundedTilePath({
		beginPath() {},
		moveTo: (...args) => path.moveTo(...args),
		lineTo: (...args) => path.lineTo(...args),
		quadraticCurveTo: (...args) => path.quadraticCurveTo(...args),
		closePath: () => path.closePath(),
	}, shape, side, scale, cornerRatio);
	// 一覧・手札のリサイズで異なる寸法が増えても保持量を制限する。
	if (roundedPaths.size >= 32) roundedPaths.delete(roundedPaths.keys().next().value);
	roundedPaths.set(key, path);
	return path;
}

export function roundedTilePath(ctx, shape, side, scale = 0.985, cornerRatio = 0.075) {
	// 見た目だけ縮める。合法配置・接続・アンカーの座標は変更しない。
	const points = Object.values(localVertices(shape, side * scale));
	const radius = side * scale * cornerRatio;
	const corners = points.map((point, index) => {
		const previous = points[(index + points.length - 1) % points.length];
		const next = points[(index + 1) % points.length];
		const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y);
		const nextLength = Math.hypot(next.x - point.x, next.y - point.y);
		const cut = Math.min(radius, previousLength * 0.2, nextLength * 0.2);
		const previousRatio = cut / previousLength;
		const nextRatio = cut / nextLength;
		return {
			corner: point,
			start: {
				x: point.x + (previous.x - point.x) * previousRatio,
				y: point.y + (previous.y - point.y) * previousRatio,
			},
			end: {
				x: point.x + (next.x - point.x) * nextRatio,
				y: point.y + (next.y - point.y) * nextRatio,
			},
		};
	});
	ctx.beginPath();
	ctx.moveTo(corners[0].start.x, corners[0].start.y);
	for (let index = 0; index < corners.length; index++) {
		const current = corners[index], next = corners[(index + 1) % corners.length];
		ctx.quadraticCurveTo(current.corner.x, current.corner.y, current.end.x, current.end.y);
		ctx.lineTo(next.start.x, next.start.y);
	}
	ctx.closePath();
}

export function tileOutlinePath(ctx, tile, side) {
	ctx.save();
	ctx.translate(tile.centerX, tile.centerY);
	ctx.rotate(tile.rotation || 0);
	roundedTilePath(ctx, tile.shape, side);
	ctx.restore();
}

export function tileAssetFilename(tile, layer, index = null) {
	const kind = tile.idPrefix.replace(new RegExp(`${MIRROR_SUFFIX}$`), '');
	const suffix = layerSuffix(tile, layer, index);
	return `${kind}_${tile.shape}_${suffix}.png`;
}

function layerSuffix(tile, layer, index) {
	if (layer === 'field') {
		const sourceRegion = (region) => {
			const beforeTerrainHalfTurn = tile.terrainPattern === 'halfTurn'
				? ({ 1: 3, 2: 4, 3: 1, 4: 2 })[region]
				: region;
			return tile.mirrored ? ({ 1: 1, 2: 4, 3: 3, 4: 2 })[beforeTerrainHalfTurn] : beforeTerrainHalfTurn;
		};
		const regions = (tile.fieldScoreGroups?.[index] || []).map(sourceRegion).sort((a, b) => a - b).join('');
		return `field-${regions}`;
	}
	if (layer === 'road' || layer === 'city') {
		const group = tile.featureGroups?.[layer]?.[index];
		const edges = (Array.isArray(group) ? group : group?.boundaryEdges || [])
			.map(edgeIndex)
			.map((edge) => {
				const beforeTerrainHalfTurn = tile.terrainPattern === 'halfTurn' ? (edge + 2) % 4 : edge;
				return tile.mirrored ? 4 - beforeTerrainHalfTurn : beforeTerrainHalfTurn + 1;
			})
			.sort((a, b) => a - b)
			.join('');
		return `${layer}-${edges}`;
	}
	return layer;
}

// 透過PNGをタイル中心へ合わせて描くテーマアセット管理。未読込・欠損画像は false を返し、
// 呼び出し側が既存のCanvas描画へ安全にフォールバックする。
export class TileTheme {
	constructor({ id = 'meadow', basePath = 'assets/themes', onChange = () => {} } = {}) {
		this.id = id;
		this.basePath = basePath;
		this.onChange = onChange;
		this.images = new Map();
	}
	setTheme(id) {
		if (this.id === id) return;
		this.id = id;
		this.images.clear();
		this.onChange();
	}
	isEnabled() { return this.id !== 'none'; }
	draw(ctx, tile, layer, index, side, { tint = null } = {}) {
		if (!this.isEnabled()) return false;
		const filename = tileAssetFilename(tile, layer, index);
		const image = this.imageFor(filename);
		if (!image || image.state !== 'ready') return false;
		ctx.save();
		ctx.translate(tile.centerX, tile.centerY);
		ctx.rotate(tile.rotation || 0);
		if (tile.mirrored) ctx.scale(-1, 1);
		if (tile.terrainPattern === 'halfTurn') ctx.rotate(Math.PI);
		// テーマ画像のはみ出しを各タイルの輪郭で隠し、角はわずかに丸める。
		ctx.clip(roundedTileShapePath(tile.shape, side));
		ctx.drawImage(tint ? this.tintedImage(image, tint) : image.element, -side, -side, side * 2, side * 2);
		ctx.restore();
		return true;
	}
	tintedImage(image, tint) {
		image.tints ||= new Map();
		if (image.tints.has(tint)) return image.tints.get(tint);
		const width = image.element.naturalWidth || image.element.width,
			height = image.element.naturalHeight || image.element.height,
			useOffscreen = typeof OffscreenCanvas !== 'undefined',
			canvas = useOffscreen
				? new OffscreenCanvas(width, height)
				: document.createElement('canvas');
		if (!useOffscreen) { canvas.width = width; canvas.height = height; }
		const tintContext = canvas.getContext('2d');
		tintContext.drawImage(image.element, 0, 0, width, height);
		tintContext.globalCompositeOperation = 'source-atop';
		tintContext.fillStyle = tint;
		tintContext.fillRect(0, 0, width, height);
		image.tints.set(tint, canvas);
		return canvas;
	}
	imageFor(filename) {
		const cached = this.images.get(filename);
		if (cached) return cached;
		if (typeof Image === 'undefined') return null;
		const image = new Image();
		const record = { state: 'loading', element: image };
		image.onload = () => { record.state = 'ready'; this.onChange(); };
		const formats = THEME_IMAGE_FORMATS[this.id] || ['png', 'svg'];
		let formatIndex = 0;
		const assetUrl = () => `${this.basePath}/${encodeURIComponent(this.id)}/${encodeURIComponent(filename.replace(/\.png$/, `.${formats[formatIndex]}`))}`;
		image.onerror = () => {
			if (formatIndex + 1 < formats.length) {
				formatIndex++;
				image.src = assetUrl();
				return;
			}
			record.state = 'missing';
			this.onChange();
		};
		image.src = assetUrl();
		this.images.set(filename, record);
		return record;
	}
}

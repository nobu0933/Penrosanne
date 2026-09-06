import { edgeIndex } from '../game/Tile.js';
import { THEME_IMAGE_FORMATS } from './ThemeCatalog.js';

const MIRROR_SUFFIX = '-mirror';

export function tileAssetFilename(tile, layer, index = null) {
	const kind = tile.idPrefix.replace(new RegExp(`${MIRROR_SUFFIX}$`), '');
	const suffix = layerSuffix(tile, layer, index);
	return `${kind}_${tile.shape}_${suffix}.png`;
}

function layerSuffix(tile, layer, index) {
	if (layer === 'field') {
		const sourceRegion = (region) => tile.mirrored ? ({ 1: 1, 2: 4, 3: 3, 4: 2 })[region] : region;
		const regions = (tile.fieldScoreGroups?.[index] || []).map(sourceRegion).sort((a, b) => a - b).join('');
		return `field-${regions}`;
	}
	if (layer === 'road' || layer === 'city') {
		const group = tile.featureGroups?.[layer]?.[index];
		const edges = (Array.isArray(group) ? group : group?.boundaryEdges || [])
			.map(edgeIndex)
			.map((edge) => tile.mirrored ? 4 - edge : edge + 1)
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

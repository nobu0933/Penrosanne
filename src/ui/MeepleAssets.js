export const MEEPLE_ASSETS = Object.freeze({
	standing: Object.freeze({
		front: 'assets/meeples/meeple-standing-front.svg',
		light: 'assets/meeples/meeple-standing-light-shadow.svg',
		dark: 'assets/meeples/meeple-standing-dark-shadow.svg',
	}),
	lying: Object.freeze({
		front: 'assets/meeples/meeple-lying-front.svg',
		light: 'assets/meeples/meeple-lying-light-shadow.svg',
		dark: 'assets/meeples/meeple-lying-dark-shadow.svg',
	}),
	reserve: 'assets/meeples/meeple-reserve.svg',
});

export const MEEPLE_LAYERS = Object.freeze(['front', 'light', 'dark']);

// 差し替え可能な3種のミープル画像は、すべて 56×56px の正方形キャンバスを
// 基準にする。Canvas側では縦横を別々に拡縮せず、常に正方形のまま描画する。
export const MEEPLE_ASSET_SIZE = 56;

// 開発サーバーの公開パス設定が異なる場合でも、盤面／一覧のアンカー表示が
// 空にならないようにする同一形状のSVGフォールバック。通常は上の差し替え可能な
// ファイルを使用し、このデータはその読込に失敗した時だけ使う。
const EMPTY_LAYER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"/>`;
const FALLBACK_MEEPLE_SVGS = Object.freeze({
	standing: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><g fill="#8b8b8b"><circle cx="28" cy="12" r="8"/><path d="M19 23c-5 3-8 8-8 14v7h8v-7h3v15h12V37h3v7h8v-7c0-6-3-11-8-14l-3 5H22z"/></g></svg>`,
	lying: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><g fill="#8b8b8b"><circle cx="42" cy="19" r="8"/><path d="M35 25c-5-3-11-3-16 0L7 33l4 8 12-5 6 4-9 3 3 7 14-5c5-2 7-8 4-12z"/></g></svg>`,
});

function svgDataUri(svg) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }

// BoardView ごとに Image を作ると、タイル一覧では数百件の同一SVG読込が発生する。
// ページ内で画像を共有し、読込完了時だけ全ビューへ再描画を通知する。
let sharedMeepleImages = null;
const meepleImageListeners = new Set();

function notifyMeepleImageListeners() {
	for (const listener of meepleImageListeners) listener();
}

export const PLAYER_COLORS = Object.freeze(['#cf4a49', '#287db4', '#7456a5', '#d28b2e']);

export function meepleKindForFeature(type) {
	return type === 'field' ? 'lying' : 'standing';
}

export function playerColor(playerIndex) {
	return PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
}

// 前面はプレイヤー固有の基本色、明るい影／暗い影は少しだけ色相をずらして
// 明度を変える。グレースケールのレイヤーを `source-in` で個別に着色するため、
// 差し替えSVGに含まれる透明部分はそのまま透明に残る。
export function meepleLayerColors(color) {
	const { h, s, l } = rgbToHsl(hexToRgb(color));
	return {
		front: hslToHex(h, s, l),
		light: hslToHex((h + 8) % 360, Math.max(22, s - 10), Math.min(88, l + 18)),
		dark: hslToHex((h + 346) % 360, Math.min(100, s + 5), Math.max(12, l - 25)),
	};
}

function hexToRgb(color) {
	const hex = String(color || '#777').replace('#', '');
	const source = hex.length === 3 ? [...hex].map((value) => value + value).join('') : hex.padEnd(6, '7');
	return { r: Number.parseInt(source.slice(0, 2), 16), g: Number.parseInt(source.slice(2, 4), 16), b: Number.parseInt(source.slice(4, 6), 16) };
}
function rgbToHsl({ r, g, b }) {
	const red = r / 255, green = g / 255, blue = b / 255, max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
	let h = 0;
	if (delta) h = max === red ? 60 * (((green - blue) / delta) % 6) : max === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
	if (h < 0) h += 360;
	const l = (max + min) / 2, s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
	return { h, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
	const chroma = (1 - Math.abs(2 * l / 100 - 1)) * s / 100, part = h / 60, x = chroma * (1 - Math.abs(part % 2 - 1));
	const [red, green, blue] = part < 1 ? [chroma, x, 0] : part < 2 ? [x, chroma, 0] : part < 3 ? [0, chroma, x] : part < 4 ? [0, x, chroma] : part < 5 ? [x, 0, chroma] : [chroma, 0, x];
	const match = l / 100 - chroma / 2, channel = (value) => Math.round((value + match) * 255).toString(16).padStart(2, '0');
	return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export function loadMeepleImages(onLoad = () => {}) {
	if (typeof Image === 'undefined') return {};
	meepleImageListeners.add(onLoad);
	if (sharedMeepleImages) return sharedMeepleImages;
	sharedMeepleImages = Object.fromEntries(['standing', 'lying'].map((kind) => [
		kind,
		Object.fromEntries(MEEPLE_LAYERS.map((layer) => [layer, loadMeepleLayer(kind, layer, MEEPLE_ASSETS[kind][layer])])),
	]));
	return sharedMeepleImages;
}

function loadMeepleLayer(kind, layer, source) {
	const image = new Image();
	let fallbackUsed = false;
	image.onload = notifyMeepleImageListeners;
	image.onerror = () => {
		if (!fallbackUsed) {
			fallbackUsed = true;
			image.src = svgDataUri(layer === 'front' ? FALLBACK_MEEPLE_SVGS[kind] : EMPTY_LAYER_SVG);
			return;
		}
		notifyMeepleImageListeners();
	};
	image.src = source;
	return image;
}

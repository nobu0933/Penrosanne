const ASSET_ROOT = 'assets/meeples';

// 色番号はSVGファイル名の suffix と共通で、reserve／lying／standing に対応する。
export const MEEPLE_ASSET_COUNT = 12;
export const MEEPLE_ASSET_SIZE = 56;
export const MEEPLE_ASSETS = Object.freeze({
	standing: (color) => `${ASSET_ROOT}/meeple-standing_${color}.svg`,
	lying: (color) => `${ASSET_ROOT}/meeple-lying_${color}.svg`,
	reserve: (color) => `${ASSET_ROOT}/meeple-reserve_${color}.svg`,
});

// 各番号の立ちミープルSVGの前面色に対応するUI用色。
// 背景に近い色は影色も参考に、枠線・ログで見分けやすい色へ調整している。
// ミープル画像そのものには色を重ねず、SVGの完成色をそのまま表示する。
export const PLAYER_COLORS = Object.freeze([
	'#f7a8ab', '#f2c07e', '#8bcec9', '#9ca0fe', '#e6e056', '#49453b',
	'#ffffff', '#703f7b', '#a13a43', '#c1a680', '#b5bc1d', '#c0d2c1',
]);

const selectedMeepleColors = [1, 4, 2, 5];
export function setPlayerMeepleColors(colors) {
	for (let index = 0; index < selectedMeepleColors.length; index++) {
		const color = Number(colors?.[index]);
		if (Number.isInteger(color) && color >= 1 && color <= MEEPLE_ASSET_COUNT) selectedMeepleColors[index] = color;
	}
}
export function selectedMeepleColor(playerIndex) {
	return selectedMeepleColors[playerIndex] || ((playerIndex % MEEPLE_ASSET_COUNT) + 1);
}
export function playerColor(playerIndex) {
	return PLAYER_COLORS[selectedMeepleColor(playerIndex) - 1];
}
export function meepleKindForFeature(type) {
	return type === 'field' ? 'lying' : 'standing';
}
export function meepleAssetForPlayer(kind, playerIndex) {
	return MEEPLE_ASSETS[kind](selectedMeepleColor(playerIndex));
}

// 同じ種類・色のSVGは全BoardViewで共有して、タイル一覧でも重複ロードしない。
let sharedMeepleImages = null;
const meepleImageListeners = new Set();
function notifyMeepleImageListeners() {
	for (const listener of meepleImageListeners) listener();
}

export function loadMeepleImages(onLoad = () => {}) {
	if (typeof Image === 'undefined') return {};
	meepleImageListeners.add(onLoad);
	if (sharedMeepleImages) return sharedMeepleImages;
	sharedMeepleImages = Object.fromEntries(['standing', 'lying'].map((kind) => [
		kind,
		Object.fromEntries(Array.from({ length: MEEPLE_ASSET_COUNT }, (_, index) => {
			const color = index + 1, image = new Image();
			image.onload = notifyMeepleImageListeners;
			image.onerror = notifyMeepleImageListeners;
			image.src = MEEPLE_ASSETS[kind](color);
			return [color, image];
		})),
	]));
	return sharedMeepleImages;
}

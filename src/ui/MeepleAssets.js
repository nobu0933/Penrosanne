export const MEEPLE_ASSETS = Object.freeze({
	standing: 'assets/meeples/meeple-standing.svg',
	lying: 'assets/meeples/meeple-lying.svg',
	reserve: 'assets/meeples/meeple-reserve.svg',
});

// 開発サーバーの公開パス設定が異なる場合でも、盤面／一覧のアンカー表示が
// 空にならないようにする同一形状のSVGフォールバック。通常は上の差し替え可能な
// ファイルを使用し、このデータはその読込に失敗した時だけ使う。
const FALLBACK_MEEPLE_SVGS = Object.freeze({
	standing: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80"><g fill="#8b8b8b" stroke="#333" stroke-width="3.5" stroke-linejoin="round"><circle cx="32" cy="13" r="10"/><path d="M22 29c-7 3-12 11-12 20v12h10V50h4v25h16V50h4v11h10V49c0-9-5-17-12-20l-4 7H26z"/></g></svg>`,
	lying: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 52"><g fill="#8b8b8b" stroke="#333" stroke-width="3.5" stroke-linejoin="round"><circle cx="71" cy="15" r="10"/><path d="M61 26c-8-5-20-5-29 0L7 39l5 10 25-10 8 4-14 4 4 9 24-7c8-2 12-10 8-17z"/></g></svg>`,
	reserve: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><g fill="#8b8b8b" stroke="#333" stroke-width="3.2" stroke-linejoin="round"><circle cx="28" cy="13" r="8"/><path d="M19 25c-6 2-10 7-10 14v5h8v-7h3v14h16V37h3v7h8v-5c0-7-4-12-10-14l-3 5H22z"/></g></svg>`,
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

export function loadMeepleImages(onLoad = () => {}) {
	if (typeof Image === 'undefined') return {};
	meepleImageListeners.add(onLoad);
	if (sharedMeepleImages) return sharedMeepleImages;
	sharedMeepleImages = Object.fromEntries(Object.entries(MEEPLE_ASSETS).map(([kind, source]) => {
		const image = new Image();
		let fallbackUsed = false;
		image.onload = notifyMeepleImageListeners;
		image.onerror = () => {
			if (!fallbackUsed) {
				fallbackUsed = true;
				image.src = svgDataUri(FALLBACK_MEEPLE_SVGS[kind]);
				return;
			}
			notifyMeepleImageListeners();
		};
		image.src = source;
		return [kind, image];
	}));
	return sharedMeepleImages;
}

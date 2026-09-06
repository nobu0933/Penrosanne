export const MEEPLE_ASSETS = Object.freeze({
	standing: 'assets/meeples/meeple-standing.svg',
	lying: 'assets/meeples/meeple-lying.svg',
	reserve: 'assets/meeples/meeple-reserve.svg',
});

export const PLAYER_COLORS = Object.freeze(['#cf4a49', '#287db4', '#7456a5', '#d28b2e']);

export function meepleKindForFeature(type) {
	return type === 'field' ? 'lying' : 'standing';
}

export function playerColor(playerIndex) {
	return PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
}

export function loadMeepleImages(onLoad = () => {}) {
	if (typeof Image === 'undefined') return {};
	return Object.fromEntries(Object.entries(MEEPLE_ASSETS).map(([kind, source]) => {
		const image = new Image();
		image.onload = onLoad;
		image.onerror = onLoad;
		image.src = source;
		return [kind, image];
	}));
}

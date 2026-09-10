import { createPrototypeDeck, createTileCatalog, DECK_CONFIGS, manualAnchorOrder } from './game/TileSet.js';
import { BoardView } from './ui/BoardView.js';
import { TileTheme } from './ui/TileTheme.js';
import {
	featureEdgeNumbers,
	manualAnchorForFeature,
	markerForFeature,
} from './ui/FeatureAnchors.js';

const side = 96;
const gallery = document.querySelector('#tile-gallery');
const themeSelect = document.querySelector('#gallery-theme-select');
const deckSelect = document.querySelector('#gallery-deck-select');
const views = [];
let renderQueued = false;
const tileTheme = new TileTheme({
	id: themeSelect.value,
	onChange: queueRender,
});
const deckCounts = {
	catalog: countsByDefinition(createTileCatalog(() => true)),
	...Object.fromEntries(DECK_CONFIGS.map((deck) => [
		deck.id,
		countsByDefinition(createPrototypeDeck(() => true, deck.id)),
	])),
};

const catalog = uniqueTiles(createTileCatalog(() => true))
	.sort((left, right) => manualAnchorOrder(left) - manualAnchorOrder(right));
addDeckOptions();
renderCatalog();
themeSelect.addEventListener('change', (event) => tileTheme.setTheme(event.target.value));
deckSelect.addEventListener('change', renderCatalog);

function addDeckOptions() {
	for (const deck of [{ id: 'catalog', label: '全タイル（CATALOG）' }, ...DECK_CONFIGS]) {
		const option = document.createElement('option');
		option.value = deck.id;
		option.textContent = deck.label;
		deckSelect.append(option);
	}
}

function renderCatalog() {
	const deckId = deckSelect.value || 'catalog';
	gallery.replaceChildren();
	views.splice(0);
	for (const tile of catalog.filter((candidate) => deckId === 'catalog' || deckCount(candidate, deckId) > 0)) {
		addTileCard(tile);
	}
}

function queueRender() {
	if (renderQueued) return;
	renderQueued = true;
	requestAnimationFrame(() => {
		renderQueued = false;
		views.forEach((view) => view.render());
	});
}

function uniqueTiles(deck) {
	const byDefinition = new Map();
	for (const tile of deck) {
		const key = `${tile.idPrefix}:${tile.shape}`;
		if (!byDefinition.has(key)) byDefinition.set(key, tile);
	}
	return [...byDefinition.values()];
}

function countsByDefinition(deck) {
	return deck.reduce((counts, tile) => {
		const key = `${tile.shape}:${tile.idPrefix}`;
		counts.set(key, (counts.get(key) || 0) + 1);
		return counts;
	}, new Map());
}

function addTileCard(source) {
	const tile = structuredClone(source);
	tile.id = `debug-${tile.id}`;
	tile.centerX = 0;
	tile.centerY = 0;
	tile.rotation = 0;
	const card = document.createElement('article');
	card.className = 'tile-debug-card';
	const heading = document.createElement('header');
	const title = document.createElement('h2');
	title.textContent = tile.idPrefix;
	const details = document.createElement('p');
	details.className = 'tile-debug-meta';
	details.textContent = `${tile.shape.toUpperCase()} ／ ${deckMembership(tile)}`;
	heading.append(title, details);
	const canvasWrap = document.createElement('div');
	canvasWrap.className = 'tile-debug-canvas-wrap';
	const canvas = document.createElement('canvas');
	canvas.className = 'tile-debug-canvas';
	canvas.width = 330;
	canvas.height = 230;
	canvas.setAttribute('aria-label', `${tile.idPrefix} ${tile.shape} のタイル`);
	canvasWrap.append(canvas);
	const anchorList = document.createElement('ul');
	anchorList.className = 'tile-anchor-list';
	for (const item of anchorRows(tile)) {
		const row = document.createElement('li');
		const label = document.createElement('strong');
		label.textContent = item.label;
		const position = document.createElement('span');
		position.textContent = item.position;
		row.append(label, position);
		anchorList.append(row);
	}
	card.append(heading, canvasWrap, anchorList);
	gallery.append(card);

	const view = new BoardView(canvas, {
		side,
		placed: [tile],
		candidates: [],
		showVertices: () => true,
		onFeatureSelect: () => {},
		allowCameraControls: false,
		// 一覧はアンカー確認用なので、差し替え可能なSVGをそのまま表示する。
		preserveMeepleColor: true,
		tileTheme,
	});
	view.candidatesVisible = false;
	const markers = featureMarkers(tile);
	// ホバー判定にはマーカーを残しつつ、表示は配置済みと同じミープルSVGに統一する。
	view.featureMarkers = markers.map((marker) => ({ ...marker, hideIcon: true }));
	// 一覧のミープルはゲーム盤面の状態とは別に保持する。以後 BoardView の
	// 通常ミープル配列が更新されても、タイルごとのアンカー表示は失われない。
	view.setStaticMeeples(markers.map((marker) => ({
		x: marker.x,
		y: marker.y,
		option: marker.option,
		playerIndex: marker.option.type === 'field' ? 1 : 0,
		galleryMarker: true,
		// 盤面と同じ基準サイズで位置を確認する。
		displayScale: 1,
	})));
	view.render();
	views.push(view);
}

function deckMembership(tile) {
	const key = `${tile.shape}:${tile.idPrefix}`;
	return ['catalog', ...DECK_CONFIGS.map((deck) => deck.id)]
		.map((deck) => `${deck.toUpperCase()} ${deckCounts[deck].get(key) || 0}`)
		.join(' / ');
}

function deckCount(tile, deckId) {
	const key = `${tile.shape}:${tile.idPrefix}`;
	return deckCounts[deckId]?.get(key) || 0;
}

function featureMarkers(tile) {
	const markers = [];
	for (const type of ['city', 'road', 'field']) {
		for (let index = 0; index < (tile.featureGroups?.[type] || []).length; index++) {
			markers.push({
				...markerForFeature(tile, { type, index }, side),
				component: { type, scoreFields: type === 'field', features: [{ tile, index }] },
			});
		}
	}
	if (tile.hasMonastery) {
		markers.push({
			...markerForFeature(tile, { type: 'monastery', index: 0 }, side),
			component: { type: 'monastery', features: [{ tile, index: 0 }] },
		});
	}
	return markers;
}

function anchorRows(tile) {
	const rows = [];
	for (const type of ['city', 'road', 'field']) {
		for (let index = 0; index < (tile.featureGroups?.[type] || []).length; index++) {
			const manual = manualAnchorForFeature(tile, type, index);
			const marker = markerForFeature(tile, { type, index }, side);
			const suffix = type === 'field'
				? `小領域 ${tile.fieldScoreGroups?.[index]?.map((region) => `①②③④`[region - 1]).join('') || 'なし'}`
				: `辺 ${featureEdgeNumbers(tile, type, index).join('・') || 'なし'}`;
			rows.push({
				label: `${featureName(type)} ${index + 1}（${suffix}）`,
				position: anchorPosition(manual, marker),
			});
		}
	}
	if (tile.hasMonastery) rows.push({ label: '修道院', position: '固定：x 0.000 / y 0.000' });
	return rows;
}

function featureName(type) {
	return { city: '都市', road: '道', field: '草原' }[type];
}

function anchorPosition(manual, marker) {
	if (manual) return `手動：x ${format(manual.x)} / y ${format(manual.y)}`;
	return `自動：x ${format(marker.x / side)} / y ${format(marker.y / side)}`;
}

function format(value) {
	return Number(value).toFixed(3);
}

import { createPrototypeDeck, createTileCatalog, DECK_CONFIGS, manualAnchorOrder, manualFeatureAnchorsFor } from './game/TileSet.js';
import { BoardView } from './ui/BoardView.js';
import { TileTheme } from './ui/TileTheme.js';
import {
	featureEdgeNumbers,
	manualAnchorForFeature,
	markerForFeature,
} from './ui/FeatureAnchors.js';
import { applyTranslations, bindLanguageSelect, deckText, t } from './ui/i18n.js';

const side = 96;
const gallery = document.querySelector('#tile-gallery');
const themeSelect = document.querySelector('#gallery-theme-select');
const deckSelect = document.querySelector('#gallery-deck-select');
const anchorEditToggle = document.querySelector('#anchor-edit-toggle');
const copyAnchors = document.querySelector('#copy-anchor-definitions');
const deckAdjustToggle = document.querySelector('#deck-adjust-toggle');
const copyDeckDefinitions = document.querySelector('#copy-deck-definitions');
const deckAdjustStatus = document.querySelector('#deck-adjust-status');
const languageSelect = document.querySelector('#language-select');
const views = [];
const anchorDrafts = new Map();
let renderQueued = false;
let anchorEditMode = false;
let deckEditMode = false;
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
// 元の DECK_DEFINITIONS には手を加えず、一覧画面内だけで調整する下書き。
const deckDrafts = new Map(
	DECK_CONFIGS.map((deck) => [deck.id, new Map(deckCounts[deck.id])]),
);

const catalog = uniqueTiles(createTileCatalog(() => true))
	.sort((left, right) => manualAnchorOrder(left) - manualAnchorOrder(right));
addDeckOptions();
renderCatalog();
bindLanguageSelect(languageSelect);
applyTranslations();
window.addEventListener('penrosanne-language-change', () => {
	addDeckOptions();
	renderCatalog();
});
themeSelect.addEventListener('change', (event) => {
	tileTheme.setTheme(event.target.value);
	renderCatalog();
});
deckSelect.addEventListener('change', () => {
	if (deckSelect.value === 'catalog' && deckEditMode) {
		deckEditMode = false;
		deckAdjustToggle.checked = false;
	}
	renderCatalog();
});
anchorEditToggle.addEventListener('change', (event) => {
	anchorEditMode = event.target.checked;
	views.forEach(({ view }) => {
		view.canvas.classList.toggle('anchor-editing', anchorEditMode);
		view.render();
	});
});
copyAnchors.addEventListener('click', copyCurrentThemeAnchors);
deckAdjustToggle.addEventListener('change', (event) => {
	if (deckSelect.value === 'catalog') {
		event.target.checked = false;
		deckEditMode = false;
		updateDeckAdjustControls();
		return;
	}
	deckEditMode = event.target.checked;
	if (deckEditMode) {
		// クリック操作をタイル数の増減に専念させる。
		anchorEditMode = false;
		anchorEditToggle.checked = false;
	}
	updateDeckAdjustControls();
	renderCatalog();
});
copyDeckDefinitions.addEventListener('click', copyCurrentDeckDefinitions);

function addDeckOptions() {
	const selected = deckSelect.value || 'catalog';
	deckSelect.replaceChildren();
	for (const deck of [{ id: 'catalog' }, ...DECK_CONFIGS]) {
		const option = document.createElement('option');
		option.value = deck.id;
		option.textContent = deck.id === 'catalog' ? t('gallery.catalog') : deckText(deck).label;
		option.selected = deck.id === selected;
		deckSelect.append(option);
	}
}

function renderCatalog() {
	const deckId = deckSelect.value || 'catalog';
	gallery.replaceChildren();
	views.splice(0);
	const tiles = deckEditMode
		? catalog
		: catalog.filter((candidate) => deckId === 'catalog' || deckCount(candidate, deckId) > 0);
	for (const tile of tiles) {
		addTileCard(tile);
	}
	updateDeckAdjustControls();
}

function queueRender() {
	if (renderQueued) return;
	renderQueued = true;
	requestAnimationFrame(() => {
		renderQueued = false;
		views.forEach(({ view }) => view.render());
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
	tile.featureAnchors = anchorsForTile(tile);
	tile._themeFeatureAnchors = structuredClone(tile.featureAnchors);
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
	canvas.setAttribute('aria-label', t('gallery.tileAria', { tile: tile.idPrefix, shape: tile.shape.toUpperCase() }));
	canvasWrap.append(canvas);
	const anchorList = document.createElement('ul');
	anchorList.className = 'tile-anchor-list';
	for (const item of anchorRows(tile)) {
		const row = document.createElement('li');
		const label = document.createElement('strong');
		label.textContent = item.label;
		const position = document.createElement('span');
		position.dataset.anchorKey = item.key;
		position.textContent = item.position;
		row.append(label, position);
		anchorList.append(row);
	}
	card.append(heading, canvasWrap, anchorList);
	gallery.append(card);
	const updateDeckState = () => {
		const selectedCount = deckCount(tile, deckSelect.value);
		card.classList.toggle('deck-adjustable', deckEditMode);
		card.classList.toggle('deck-excluded', deckEditMode && selectedCount === 0);
		details.textContent = `${tile.shape.toUpperCase()} ／ ${deckMembership(tile)}`;
	};
	card.addEventListener('click', (event) => {
		if (!deckEditMode || event.button !== 0) return;
		adjustDeckCount(tile, 1);
		updateDeckState();
	});
	card.addEventListener('contextmenu', (event) => {
		if (!deckEditMode) return;
		event.preventDefault();
		adjustDeckCount(tile, -1);
		updateDeckState();
	});
	updateDeckState();

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
		anchorEditMode: () => anchorEditMode,
		onFeatureDrag: (marker, world) => moveAnchor(tile, marker.option, world, view, anchorList),
	});
	view.candidatesVisible = false;
	view.canvas.classList.toggle('anchor-editing', anchorEditMode);
	refreshTileMarkers(view, tile);
	view.render();
	views.push({ view, tile, anchorList, card, updateDeckState });
}

function deckMembership(tile) {
	const key = `${tile.shape}:${tile.idPrefix}`;
	return ['catalog', ...DECK_CONFIGS.map((deck) => deck.id)]
		.map((deck) => `${deck.toUpperCase()} ${deckCount(tile, deck)}`)
		.join(' / ');
}

function deckCount(tile, deckId) {
	const key = `${tile.shape}:${tile.idPrefix}`;
	const counts = deckDrafts.get(deckId) || deckCounts[deckId];
	return counts?.get(key) || 0;
}

function adjustDeckCount(tile, amount) {
	const deckId = deckSelect.value;
	const counts = deckDrafts.get(deckId);
	if (!counts) return;
	const key = `${tile.shape}:${tile.idPrefix}`;
	counts.set(key, Math.max(0, (counts.get(key) || 0) + amount));
	updateDeckAdjustControls();
}

function updateDeckAdjustControls() {
	const deckId = deckSelect.value || 'catalog';
	const editable = deckId !== 'catalog';
	deckAdjustToggle.disabled = !editable;
	if (!editable && deckEditMode) {
		deckEditMode = false;
		deckAdjustToggle.checked = false;
	}
	copyDeckDefinitions.disabled = !editable;
	if (!editable) {
		deckAdjustStatus.textContent = t('gallery.catalogNotice');
		return;
	}
	const total = [...deckDrafts.get(deckId).values()].reduce((sum, count) => sum + count, 0);
	deckAdjustStatus.textContent = deckEditMode
		? t('gallery.deckStatusEdit', { deck: deckId.toUpperCase(), count: total })
		: t('gallery.deckStatus', { deck: deckId.toUpperCase(), count: total });
}

function anchorThemeId() {
	return themeSelect.value || 'none';
}

function anchorsForTile(tile) {
	const theme = anchorThemeId(), key = `${tile.shape}:${tile.idPrefix}`;
	if (!anchorDrafts.has(theme)) anchorDrafts.set(theme, new Map());
	const drafts = anchorDrafts.get(theme);
	if (!drafts.has(key)) drafts.set(key, manualFeatureAnchorsFor(tile.shape, tile.idPrefix, theme));
	return structuredClone(drafts.get(key));
}

function moveAnchor(tile, option, world, view, anchorList) {
	const relative = { x: world.x - tile.centerX, y: world.y - tile.centerY };
	const cos = Math.cos(tile.rotation || 0), sin = Math.sin(tile.rotation || 0);
	const anchor = {
		x: (relative.x * cos + relative.y * sin) / side,
		y: (-relative.x * sin + relative.y * cos) / side,
	};
	const anchors = anchorsForTile(tile);
	anchors[option.type] ||= [];
	anchors[option.type][option.index] = anchor;
	anchorDrafts.get(anchorThemeId()).set(`${tile.shape}:${tile.idPrefix}`, structuredClone(anchors));
	tile.featureAnchors = structuredClone(anchors);
	tile._themeFeatureAnchors = structuredClone(anchors);
	refreshTileMarkers(view, tile);
	updateAnchorRows(tile, anchorList);
}

function refreshTileMarkers(view, tile) {
	const markers = featureMarkers(tile);
	// ホバー判定にはマーカーを残しつつ、表示は配置済みと同じミープルSVGに統一する。
	view.featureMarkers = markers.map((marker) => ({ ...marker, hideIcon: true }));
	// 一覧のミープルはゲーム盤面の状態とは別に保持する。以後 BoardView の
	// 通常ミープル配列が更新されても、タイルごとのアンカー表示は失われない。
	view.staticMeeples = markers.map((marker) => ({
		x: marker.x,
		y: marker.y,
		option: marker.option,
		playerIndex: marker.option.type === 'field' ? 1 : 0,
		galleryMarker: true,
		displayScale: 1,
	}));
}

function updateAnchorRows(tile, anchorList) {
	for (const item of anchorRows(tile)) {
		const value = anchorList.querySelector(`[data-anchor-key="${item.key}"]`);
		if (value) value.textContent = item.position;
	}
}

async function copyCurrentThemeAnchors() {
	const theme = anchorThemeId();
	const text = serializeThemeAnchors(theme);
	await copyText(text, t('gallery.copyAnchorsDone'), copyAnchors);
}

async function copyCurrentDeckDefinitions() {
	const deckId = deckSelect.value;
	if (deckId === 'catalog') return;
	const text = serializeDeckDefinitions(deckId);
	await copyText(text, t('gallery.copyDeckDone', { deck: deckId.toUpperCase() }), copyDeckDefinitions);
}

async function copyText(text, message, button) {
	try {
		if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
		await navigator.clipboard.writeText(text);
		showCopyResult(message, button);
	} catch {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.append(textarea);
		textarea.select();
		document.execCommand('copy');
		textarea.remove();
		showCopyResult(message, button);
	}
}

function serializeDeckDefinitions(deckId) {
	const definitionName = {
		lite: 'LITE_DEFINITIONS',
		standard: 'STANDARD_DEFINITIONS',
		'road-only': 'ROAD_ONLY_DEFINITIONS',
	}[deckId];
	const counts = deckDrafts.get(deckId);
	const lines = catalog.flatMap((tile) => {
		const count = counts.get(`${tile.shape}:${tile.idPrefix}`) || 0;
		return count ? [`\t['${tile.idPrefix}', ${count}, '${tile.shape}'],`] : [];
	});
	return `const ${definitionName} = [\n${lines.join('\n')}\n];`;
}

function serializeThemeAnchors(theme) {
	const lines = catalog.map((source) => {
		const tile = { ...source, featureAnchors: anchorsForTile(source) };
		const anchors = tile.featureAnchors;
		return `\t['${tile.shape}:${tile.idPrefix}', A(${formatAnchorList(anchors.city)}, ${formatAnchorList(anchors.road)}, ${formatAnchorList(anchors.field)}, ${formatAnchorList(anchors.monastery)})],`;
	});
	return `// MANUAL_FEATURE_ANCHORS の '${theme}' エントリーへ貼り付け\n['${theme}', new Map([\n${lines.join('\n')}\n])]`;
}

function formatAnchorList(anchors = []) {
	return `[${anchors.map((anchor) => `[${format(anchor.x)}, ${format(anchor.y)}]`).join(', ')}]`;
}

function showCopyResult(message, button = copyAnchors) {
	const initial = button.textContent;
	const initialKey = button.dataset.i18n;
	button.textContent = message;
	setTimeout(() => { button.textContent = initialKey ? t(initialKey) : initial; }, 1800);
}

function featureMarkers(tile) {
	const markers = [];
	for (const type of ['city', 'road', 'field']) {
		for (let index = 0; index < (tile.featureGroups?.[type] || []).length; index++) {
			markers.push({
				...markerForFeature(tile, { type, index }, side, anchorThemeId()),
				component: { type, scoreFields: type === 'field', features: [{ tile, index }] },
			});
		}
	}
	if (tile.hasMonastery) {
		markers.push({
			...markerForFeature(tile, { type: 'monastery', index: 0 }, side, anchorThemeId()),
			component: { type: 'monastery', features: [{ tile, index: 0 }] },
		});
	}
	return markers;
}

function anchorRows(tile) {
	const rows = [];
	for (const type of ['city', 'road', 'field']) {
		for (let index = 0; index < (tile.featureGroups?.[type] || []).length; index++) {
			const manual = manualAnchorForFeature(tile, type, index, anchorThemeId());
			const marker = markerForFeature(tile, { type, index }, side, anchorThemeId());
			const suffix = type === 'field'
				? t('gallery.fieldSubregions', { regions: tile.fieldScoreGroups?.[index]?.map((region) => `①②③④`[region - 1]).join('') || t('gallery.none') })
				: t('gallery.edge', { edges: featureEdgeNumbers(tile, type, index).join('・') || t('gallery.none') });
			rows.push({
				key: `${type}:${index}`,
				label: `${featureName(type)} ${index + 1}（${suffix}）`,
				position: anchorPosition(manual, marker),
			});
		}
	}
	if (tile.hasMonastery) rows.push({ key: 'monastery:0', label: t('feature.monastery'), position: anchorPosition(manualAnchorForFeature(tile, 'monastery', 0, anchorThemeId()), markerForFeature(tile, { type: 'monastery', index: 0 }, side, anchorThemeId())) });
	return rows;
}

function featureName(type) {
	return t(`feature.${type}`);
}

function anchorPosition(manual, marker) {
	if (manual) return t('gallery.manual', { x: format(manual.x), y: format(manual.y) });
	return t('gallery.auto', { x: format(marker.x / side), y: format(marker.y / side) });
}

function format(value) {
	return Number(value).toFixed(3);
}

import { Board } from './game/Board.js';
import { localVertices } from './game/Tile.js';
import { scoreFeature, scoreField } from './game/Scoring.js';
import { GameEngine } from './game/GameEngine.js';
import { createPrototypeDeck, createTileCatalog } from './game/TileSet.js';
import { createFillabilityCache, featureCanReceiveMeeple } from './game/Rules.js';
import { BoardView } from './ui/BoardView.js';
import { TileDrag } from './ui/TileDrag.js';
import { handDisplayTile } from './ui/HandTileLayout.js';
import { TileTheme, tileAssetFilename } from './ui/TileTheme.js';
import { markerForFeature } from './ui/FeatureAnchors.js';
import { playerColor, meepleAssetForPlayer } from './ui/MeepleAssets.js';
import { deriveSeed, seededRandom } from './ai/SeededRandom.js';
import {
	RECORD_FORMAT, RECORD_VERSION, REASON_TAGS, FEATURE_FOCUS_TAGS,
	captureDecisionContext, describeTileCandidate, placementDescriptor, setAssessmentRating,
} from './recording/DecisionData.js';
import { RECORDING_RULES, scenarioCandidates, validateScenarioBoard } from './recording/ScenarioEditor.js';

const side = 120;
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries([
	'mode', 'cpu-turns', 'seed', 'active-seed', 'start', 'back-turn', 'status', 'download', 'download-finish', 'board',
	'player-0', 'player-1', 'inventory-toggle', 'inventory-panel', 'deck-count', 'deck-tiles', 'discard-count', 'discard-tiles',
	'placement-actions', 'cancel-preview', 'cycle-preview', 'confirm-preview', 'skip-preview-meeple', 'rating-popover', 'helper-panel',
	'editor-panel', 'editor-kind', 'editor-candidates', 'editor-player', 'editor-turn',
	'editor-score-0', 'editor-score-1', 'editor-meeples-0', 'editor-meeples-1',
	'judgment-kind', 'editor-selected', 'editor-validation', 'remove-editor-tile', 'begin-judgment',
	'decision-panel', 'decision-title', 'decision-summary', 'candidate-progress', 'candidate-filter',
	'candidate-list', 'annotation', 'pattern-cycle', 'meeple-skip', 'meeple-choice', 'meeple-options',
	'feature-focus-tags', 'candidate-tags', 'candidate-note', 'commit', 'redraw',
	'finish-panel', 'finish-summary',
].map((id) => [id, $(id)]));
const catalog = [...new Map(createTileCatalog(() => 0).map((tile) => [`${tile.shape}:${tile.idPrefix}`, tile])).entries()];
const catalogByKind = new Map(catalog);
for (const [key, tile] of catalog) for (const control of [ui['editor-kind'], ui['judgment-kind']]) {
	const option = document.createElement('option');
	option.value = key;
	option.textContent = `${tile.shape.toUpperCase()} · ${tile.idPrefix}`;
	control.append(option);
}
let engine = null;
let editor = null;
let mode = null;
let documentRecord = null;
let decision = null;
let rawCandidates = [];
let inspectedIndex = null;
let editorChoices = [];
let editorSerial = 0;
let worker = null;
let operation = 0;
let busy = false;
let selectedEditorTileId = null;
let chosenMeeple = { type: 'skip', index: null };
let previewPhase = 'idle';
let undoStack = [];
let dropFrame = null;
let thumbnailSerial = 0;
let inventorySignature = '';
const scoreDisplay = new Map();
const scoreAnimations = new Map();
let scoreFrame = null;
let tileMotion = null;
const selectionRatings = new Set(['confident', 'uncertain', 'guess']);
const theme = new TileTheme({ onChange: () => view.render() });
const view = new BoardView(ui.board, {
	side, placed: [], candidates: [], structuralCandidates: [], tileTheme: theme, meepleScale: 1.5,
	onSelect: (tile) => {
		if (editor && !decision) addEditorTile(editorChoices[tile._recordIndex]);
		else if (decision?.kind === 'turn' && previewPhase !== 'meeple') inspectCandidate(tile._recordIndex);
	},
	onPlacedTileSelect: (tile) => {
		if (!editor || decision) return;
		selectedEditorTileId = tile.id;
		renderEditorSelection();
		renderBoard();
	},
	onFeatureSelect: (marker) => {
		if (editor && !decision) cycleEditorMeeple(marker.option);
		else if (decision?.kind === 'turn' && previewPhase === 'meeple') selectMeeple(marker.option);
	},
	canDragPreview: () => previewPhase !== 'meeple',
	onPreviewPatternCycle: () => cyclePattern(),
	onPreviewDragStart: (event) => { if (decision?.kind === 'turn' && previewPhase !== 'meeple') tileMotion?.begin(event, rawCandidates[inspectedIndex]); },
	isTileHeld: () => tileMotion?.busy,
	onCancelTileDrag: () => tileMotion?.cancel(),
	onRender: () => positionPreviewOverlays(),
});
tileMotion = new TileDrag({
	view, overlay: $('held-tile'), hand: null,
	getTile: () => engine?.state.currentTile,
	getCandidates: () => rawCandidates,
	canStart: () => decision?.kind === 'turn' && previewPhase !== 'meeple' && !busy,
	onPreview: (tile) => {
		const index = rawCandidates.indexOf(tile);
		if (index >= 0) inspectCandidate(index, { animate: false });
		else { inspectedIndex = null; previewPhase = 'idle'; resetAnnotation(); renderBoard(); updateNextButton(); }
	},
	onChange: () => renderBoard(),
});

function setStatus(message) { ui.status.textContent = message; }
function show(name) {
	for (const id of ['editor-panel', 'decision-panel', 'finish-panel']) ui[id].classList.toggle('hidden', id !== name);
}
function tileThumbnail(tile, label) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 240 240');
	svg.setAttribute('class', 'tile-thumbnail');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', label);
	const vertices = Object.values(localVertices(tile.shape, 112));
	const points = vertices.map(({ x, y }) => `${120 + x},${120 + y}`).join(' ');
	const clipId = `tile-clip-${++thumbnailSerial}`;
	const defs = document.createElementNS(svg.namespaceURI, 'defs');
	const clip = document.createElementNS(svg.namespaceURI, 'clipPath'); clip.setAttribute('id', clipId);
	const mask = document.createElementNS(svg.namespaceURI, 'polygon'); mask.setAttribute('points', points);
	clip.append(mask); defs.append(clip); svg.append(defs);
	const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
	polygon.setAttribute('points', points); polygon.setAttribute('fill', '#568500');
	svg.append(polygon);
	const artwork = document.createElementNS(svg.namespaceURI, 'g');
	artwork.setAttribute('clip-path', `url(#${clipId})`);
	const layers = [
		...Array.from({ length: tile.featureGroups?.field?.length || 0 }, (_, index) => ['field', index]),
		...Array.from({ length: tile.featureGroups?.road?.length || 0 }, (_, index) => ['road', index]),
		...Array.from({ length: tile.featureGroups?.city?.length || 0 }, (_, index) => ['city', index]),
		...(Object.values(tile.roadTerminals || {}).some((items) => items.some((item) => item.kind === 'intersection')) ? [['intersection', 0]] : []),
		...(tile.hasMonastery ? [['monastery', 0]] : []),
	];
	for (const [layer, index] of layers) {
		const image = document.createElementNS(svg.namespaceURI, 'image');
		image.setAttribute('href', `assets/themes/meadow/${tileAssetFilename(tile, layer, index).replace(/\.png$/, '.svg')}`);
		image.setAttribute('width', '240'); image.setAttribute('height', '240');
		artwork.append(image);
	}
	svg.append(artwork);
	return svg;
}
function renderInventory() {
	const state = engine?.state;
	ui['inventory-toggle'].classList.toggle('hidden', !state);
	if (!state) return;
	ui['deck-count'].textContent = `${state.deck.length}枚`;
	ui['discard-count'].textContent = `${state.discarded.length}枚`;
	if (ui['inventory-panel'].classList.contains('hidden')) return;
	const signature = `${state.deck.length}:${state.deck.at(-1)?.id}:${state.discarded.length}:${state.discarded.at(-1)?.id}`;
	if (signature === inventorySignature) return;
	inventorySignature = signature;
	// 山札の順番は判断者へ知らせない。見せるのは種類別の残存集合だけ。
	const sortedDeck = [...state.deck].sort((left, right) => `${left.shape}:${left.idPrefix}`.localeCompare(`${right.shape}:${right.idPrefix}`));
	for (const [container, tiles] of [[ui['deck-tiles'], sortedDeck], [ui['discard-tiles'], state.discarded]]) {
		container.replaceChildren();
		for (const tile of tiles) {
			const item = document.createElement('span');
			item.className = 'inventory-tile'; item.title = `${tile.shape.toUpperCase()} · ${tile.idPrefix}`;
			item.append(tileThumbnail(tile, item.title)); container.append(item);
		}
	}
}
function renderPlayers() {
	const now = performance.now();
	for (let index = 0; index < 2; index++) {
		const holder = ui[`player-${index}`], player = engine?.state.players[index];
		holder.classList.toggle('hidden', !player);
		if (!player) continue;
		holder.replaceChildren();
		holder.style.setProperty('--player-color', playerColor(index));
		const name = document.createElement('strong');
		name.textContent = `${engine.state.turn === index && !engine.state.finished ? '▶ ' : ''}${player.name}`;
		const previous = scoreDisplay.get(player.id);
		if (previous === undefined || player.score < previous) {
			scoreDisplay.set(player.id, player.score); scoreAnimations.delete(player.id);
		} else if (player.score > previous && scoreAnimations.get(player.id)?.to !== player.score) {
			scoreAnimations.set(player.id, { from: previous, to: player.score, startedAt: now,
				duration: Math.min(650, Math.max(230, (player.score - previous) * 22)) });
		}
		const points = document.createElement('b'); points.textContent = String(Math.round(scoreDisplay.get(player.id)));
		const reserve = document.createElement('div'); reserve.className = 'reserve-icons';
		for (let count = 0; count < player.meeples; count++) {
			const icon = document.createElement('img'); icon.src = meepleAssetForPlayer('reserve', index); icon.alt = '';
			reserve.append(icon);
		}
		const details = document.createElement('small');
		details.textContent = `頂点完成 ${player.vertexCompletions}`;
		holder.append(name, points, reserve, details);
		if (engine.state.turn === index && engine.state.currentTile && !engine.state.finished) {
			const hand = document.createElement('div'); hand.className = 'hand-tile';
			if (!tileMotion?.busy && decision?.kind === 'turn') {
				const canvas = document.createElement('canvas');
				canvas.width = 76; canvas.height = 76;
				canvas.setAttribute('aria-label', `手元の${engine.state.currentTile.shape.toUpperCase()}タイル`);
				canvas.addEventListener('pointerdown', (event) => tileMotion?.begin(event, null, true, canvas));
				hand.append(canvas);
				view.drawTileAtScreen(canvas.getContext('2d'), handDisplayTile(engine.state.currentTile), 38, 38, 42);
			}
			hand.append(ui.redraw);
			holder.append(hand);
		}
	}
	if (scoreAnimations.size && scoreFrame === null) scoreFrame = requestAnimationFrame(animateScores);
}
function animateScores(now) {
	scoreFrame = null;
	for (const [playerId, animation] of scoreAnimations) {
		const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
		const value = Math.round(animation.from + (animation.to - animation.from) * progress);
		scoreDisplay.set(playerId, value);
		const index = engine?.state.players.findIndex((player) => player.id === playerId);
		if (index >= 0) {
			const element = ui[`player-${index}`].querySelector('b');
			if (element) element.textContent = String(value);
		}
		if (progress >= 1) scoreAnimations.delete(playerId);
	}
	if (scoreAnimations.size) scoreFrame = requestAnimationFrame(animateScores);
}
function seededEngine(seed = 1) {
	return new GameEngine({
		playerCount: 2, playerNames: ['プレイヤー1', 'プレイヤー2'],
		deckType: 'standard', handMode: 'single', fieldScoring: true,
		titles: { vertexKing: true }, rules: RECORDING_RULES,
		deferCandidateSearch: true, random: seededRandom(deriveSeed(seed, 'deck')),
	});
}
function startRecord(origin, seed) {
	documentRecord = {
		format: RECORD_FORMAT, version: RECORD_VERSION, createdAt: new Date().toISOString(),
		origin, seed, setup: { playerCount: 2, deckType: 'standard', handMode: 'single', fieldScoring: true, rules: RECORDING_RULES, titles: { vertexKing: true } },
		decisions: [], events: [],
	};
	ui.download.disabled = true;
	undoStack = [];
	ui['back-turn'].disabled = true;
}
function serialTile(key) {
	const raw = catalogByKind.get(key);
	return raw ? { ...structuredClone(raw), id: `record-editor-${++editorSerial}-${raw.shape}` } : null;
}
function openEditor() {
	engine = null;
	editor = { board: new Board(side), meeples: {}, selectedKind: ui['editor-kind'].value };
	selectedEditorTileId = null;
	show('editor-panel');
	refreshEditorChoices();
	setStatus('盤面を編集し、判断するタイルを選んでください。');
}
function refreshEditorChoices() {
	if (!editor) return;
	const tile = serialTile(ui['editor-kind'].value);
	editorChoices = scenarioCandidates(editor.board, tile);
	ui['editor-candidates'].replaceChildren();
	editorChoices.forEach((choice, index) => {
		const button = document.createElement('button');
		button.className = 'candidate-row';
		button.textContent = `#${index + 1}  (${Math.round(choice.centerX)}, ${Math.round(choice.centerY)})  ${choice.terrainPattern || 'normal'}${choice.mirrored ? ' · 反転' : ''}`;
		button.onclick = () => addEditorTile(choice);
		ui['editor-candidates'].append(button);
	});
	const validity = validateScenarioBoard(editor.board);
	ui['editor-validation'].textContent = validity.valid ? `整合しています · ${editor.board.tiles.length}枚` : validity.reason;
	renderBoard();
}
function addEditorTile(choice) {
	if (!editor || !choice || busy) return;
	editor.board.add(choice);
	selectedEditorTileId = choice.id;
	renderEditorSelection();
	refreshEditorChoices();
}
function removeEditorTile() {
	if (!editor || !selectedEditorTileId) return;
	editor.board.tiles = editor.board.tiles.filter((tile) => tile.id !== selectedEditorTileId);
	for (const ref of Object.keys(editor.meeples)) if (ref.startsWith(`${selectedEditorTileId}:`)) delete editor.meeples[ref];
	selectedEditorTileId = null;
	renderEditorSelection();
	refreshEditorChoices();
}
function editorFeatureOptions(tile) {
	const options = [];
	for (const type of ['city', 'road', 'field']) for (let index = 0; index < (tile.featureGroups[type] || []).length; index++) options.push({ type, index });
	if (tile.hasMonastery) options.push({ type: 'monastery', index: 0 });
	return options;
}
function cycleEditorMeeple(option) {
	if (!editor || !selectedEditorTileId) return;
	const ref = `${selectedEditorTileId}:${option.type}:${option.index}`;
	const current = editor.meeples[ref];
	if (!current) editor.meeples[ref] = 'p1';
	else if (current === 'p1') editor.meeples[ref] = 'p2';
	else delete editor.meeples[ref];
	renderEditorSelection();
	renderBoard();
}
function renderEditorSelection() {
	const tile = editor?.board.getTile(selectedEditorTileId);
	ui['editor-selected'].textContent = tile
		? `${tile.shape.toUpperCase()} · ${tile.idPrefix}。地形上のミープルを押すと、なし → P1 → P2 に切り替わります。`
		: '配置済みタイルを選ぶと編集できます。';
	ui['remove-editor-tile'].disabled = !tile;
}
function cloneEditorAsEngine() {
	const validation = validateScenarioBoard(editor.board);
	if (!validation.valid) throw new Error(validation.reason);
	const scenario = seededEngine(documentRecord.seed);
	scenario.state.board = editor.board;
	scenario.state.meeples = structuredClone(editor.meeples);
	scenario.state.turn = Number(ui['editor-player'].value);
	scenario.state.recordTurnNumber = Math.max(1, Number(ui['editor-turn'].value) || 1);
	for (let index = 0; index < 2; index++) {
		scenario.state.players[index].score = Math.max(0, Number(ui[`editor-score-${index}`].value) || 0);
		scenario.state.players[index].meeples = Math.max(0, Number(ui[`editor-meeples-${index}`].value) || 0);
	}
	const taken = new Map();
	for (const tile of editor.board.tiles) {
		const key = `${tile.shape}:${tile.idPrefix}`;
		taken.set(key, (taken.get(key) || 0) + 1);
	}
	const pool = createPrototypeDeck(() => 0, 'standard');
	const remaining = pool.filter((tile) => {
		const key = `${tile.shape}:${tile.idPrefix}`;
		const count = taken.get(key) || 0;
		if (!count) return true;
		taken.set(key, count - 1);
		return false;
	});
	const selectedKey = ui['judgment-kind'].value;
	const selectedFromDeck = remaining.findIndex((tile) => `${tile.shape}:${tile.idPrefix}` === selectedKey);
	const tile = selectedFromDeck >= 0 ? remaining.splice(selectedFromDeck, 1)[0] : serialTile(selectedKey);
	if (!tile) throw new Error('判断するタイルを選んでください。');
	scenario.state.deck = remaining;
	scenario.state.currentTile = tile;
	scenario.state.phase = 'placeTile';
	scenario.state.discarded = [];
	scenario.fillabilityCache = createFillabilityCache(scenario.state.board, scenario.tileOptions);
	scenario._candidateGroups = null;
	scenario._structuralFrontier = null;
	return scenario;
}
function restoreCpuState(data) {
	const result = seededEngine(data.seed);
	result.state = data.state;
	const board = new Board(side);
	board.tiles = data.boardTiles;
	result.state.board = board;
	result.fillabilityCache = createFillabilityCache(board, result.tileOptions);
	result._candidateGroups = null;
	result._structuralFrontier = null;
	return result;
}
function uniquePositions(candidates) {
	const found = new Set();
	return candidates.flatMap((tile, index) => {
		const key = `${tile.shape}:${Math.round(tile.centerX * 1e4)}:${Math.round(tile.centerY * 1e4)}:${Math.round((((tile.rotation || 0) % Math.PI) + Math.PI) % Math.PI * 1e4)}`;
		if (found.has(key)) return [];
		found.add(key);
		return [{ ...tile, _recordIndex: index, _candidateKey: key }];
	});
}
function placedMeeples() {
	const board = editor?.board || engine?.state.board;
	const entries = editor?.meeples || engine?.state.meeples || {};
	if (!board) return [];
	return Object.entries(entries).flatMap(([ref, playerId]) => {
		const [id, type, rawIndex] = ref.split(':');
		const tile = board.getTile(id);
		if (!tile) return [];
		return [{ ...markerForFeature(tile, { type, index: Number(rawIndex) }, side, theme.id), playerIndex: playerId === 'p2' ? 1 : 0 }];
	});
}
function renderBoard() {
	view.options.placed = editor?.board.tiles || engine?.state.board.tiles || [];
	view.options.candidates = editor && !decision ? uniquePositions(editorChoices)
		: decision?.kind === 'turn' ? uniquePositions(rawCandidates) : [];
	view.options.structuralCandidates = decision?.forced || [];
	view.previewTile = decision?.kind === 'turn' && inspectedIndex !== null ? rawCandidates[inspectedIndex] : null;
	view.previewOutlineColor = view.previewTile ? playerColor(engine.state.turn) : null;
	view.meeples = placedMeeples();
	if (decision?.kind === 'turn' && previewPhase === 'assessment' && inspectedIndex !== null && chosenMeeple.type !== 'skip') {
		view.meeples.push({ ...markerForFeature(rawCandidates[inspectedIndex], chosenMeeple, side, theme.id),
			option: chosenMeeple, playerIndex: engine.state.turn, displayScale: 1.08 });
	}
	const markerTile = editor && !decision ? editor.board.getTile(selectedEditorTileId)
		: decision?.kind === 'turn' && previewPhase === 'meeple' && inspectedIndex !== null ? rawCandidates[inspectedIndex] : null;
	const options = editor && !decision && markerTile ? editorFeatureOptions(markerTile)
		: decision?.kind === 'turn' && markerTile ? meepleOptionsFor(markerTile) : [];
	view.featureMarkers = markerTile ? options.map((option) => {
		const marker = markerForFeature(markerTile, option, side, theme.id);
		if (decision?.kind === 'turn') {
			const previewBoard = new Board(side); previewBoard.tiles = [...engine.state.board.tiles, markerTile];
			marker.component = option.type === 'monastery'
				? { type: 'monastery', features: [{ tile: markerTile, index: 0 }] }
				: option.type === 'field'
					? { type: 'field', scoreFields: true, features: previewBoard.fieldScoreComponent(markerTile, option.index).features }
					: { type: option.type, features: previewBoard.component(markerTile, option.type, option.index).features };
		}
		return marker;
	}) : [];
	view.featureMarkerPlayerIndex = editor && !decision ? Number(ui['editor-player'].value) : engine?.state.turn || 0;
	view.featureMarkerColor = playerColor(view.featureMarkerPlayerIndex);
	view.render();
	renderPlayers();
	renderInventory();
	renderPreviewControls();
}
function positionPreviewOverlays() {
	if (inspectedIndex === null || !rawCandidates[inspectedIndex]) return;
	const tile = rawCandidates[inspectedIndex];
	const point = view.screenFromWorldPoint({ x: tile.centerX, y: tile.centerY });
	for (const overlay of [ui['placement-actions'], ui['rating-popover']]) {
		if (overlay.classList.contains('hidden')) continue;
		overlay.style.left = `${point.x}px`;
		overlay.style.top = `${point.y + side * view.camera.zoom * .72 + 15}px`;
	}
}
function renderPreviewControls() {
	const active = decision?.kind === 'turn' && inspectedIndex !== null;
	ui['placement-actions'].classList.toggle('hidden', !active || previewPhase === 'assessment');
	ui['rating-popover'].classList.toggle('hidden', !active || previewPhase !== 'assessment');
	ui['cancel-preview'].classList.toggle('hidden', !active || previewPhase !== 'placement');
	const variants = active ? samePositionIndices(inspectedIndex) : [];
	const canCycle = previewPhase === 'placement' && variants.length > 1;
	ui['cycle-preview'].classList.toggle('hidden', !canCycle);
	if (canCycle) {
		const number = variants.indexOf(inspectedIndex) + 1;
		const label = `設置方向を切り替え（${number}/${variants.length}）`;
		ui['cycle-preview'].textContent = `${number}/${variants.length}`;
		ui['cycle-preview'].title = label;
		ui['cycle-preview'].setAttribute('aria-label', label);
	}
	ui['confirm-preview'].classList.toggle('hidden', !active || previewPhase !== 'placement');
	ui['skip-preview-meeple'].classList.toggle('hidden', !active || previewPhase !== 'meeple');
	ui['pattern-cycle'].classList.toggle('hidden', !canCycle);
	ui['meeple-skip'].classList.toggle('hidden', !active || previewPhase !== 'meeple');
	ui['meeple-options'].replaceChildren();
	if (active && previewPhase === 'meeple') for (const option of meepleOptionsFor(rawCandidates[inspectedIndex])) {
		const button = document.createElement('button'); button.type = 'button';
		button.textContent = `${option.type} ${option.index + 1}`;
		button.onclick = () => selectMeeple(option);
		ui['meeple-options'].append(button);
	}
	ui['meeple-choice'].textContent = active && previewPhase === 'assessment'
		? chosenMeeple.type === 'skip' ? 'ミープルなし' : `${chosenMeeple.type} ${chosenMeeple.index + 1}` : '';
	positionPreviewOverlays();
}
function candidateLabel(candidate, index) {
	const p = candidate.placement;
	return `#${index + 1} ${p.shape.toUpperCase()} ${p.kind} (${Math.round(p.x)}, ${Math.round(p.y)}) · ${p.terrainPattern}${p.mirrored ? ' · 反転' : ''}`;
}
function meepleOptionsFor(tile) {
	if (!engine?.activePlayer.meeples) return [];
	const board = new Board(side); board.tiles = [...engine.state.board.tiles, tile];
	return editorFeatureOptions(tile).filter(({ type, index }) =>
		type === 'monastery' || featureCanReceiveMeeple(board, engine.state, tile, type, index));
}
function assessmentKey(tileIndex, option) { return `${tileIndex}:${option.type}:${option.index ?? '-'}`; }
function activeAssessment() {
	if (!decision || inspectedIndex === null) return null;
	const key = assessmentKey(inspectedIndex, chosenMeeple);
	return decision.assessments[key];
}
function selectedAssessment() {
	if (!decision) return null;
	return Object.values(decision.assessments).find((assessment) => selectionRatings.has(assessment.rating)) || null;
}
function createAssessment(tileIndex, option) {
	const key = assessmentKey(tileIndex, option);
	return {
		id: key, tileCandidateId: decision.candidates[tileIndex].id,
		meeple: { ...option }, rating: 'unreviewed',
		features: { meeple: meepleFeatures(rawCandidates[tileIndex], option) },
		focusFeatures: [], reasons: [], note: '',
	};
}
function meepleFeatures(tile, option) {
	const after = engine.activePlayer.meeples - (option.type === 'skip' ? 0 : 1);
	if (option.type === 'skip') return { type: 'skip', remainingMeeplesAfter: after, currentPoints: 0 };
	const board = new Board(side); board.tiles = [...engine.state.board.tiles, tile];
	const component = option.type === 'monastery' ? null : option.type === 'field'
		? board.fieldScoreComponent(tile, option.index) : board.component(tile, option.type, option.index);
	return {
		type: option.type, index: option.index, remainingMeeplesAfter: after,
		wouldUseLastMeeple: after === 0,
		terrainTileCount: component ? new Set(component.features.map(({ tile: item }) => item.id)).size : 1,
		openEdgeCount: component?.openEdges?.length ?? null,
		currentPoints: option.type === 'field' ? scoreField(board, tile, option.index) : scoreFeature(board, tile, option.type, option.index),
	};
}
function renderCandidateList() {
	if (!decision) return;
	ui['candidate-list'].replaceChildren();
	const filter = ui['candidate-filter'].value.trim().toLowerCase();
	decision.candidates.forEach((candidate, index) => {
		const label = candidateLabel(candidate, index);
		if (filter && !label.toLowerCase().includes(filter)) return;
		const button = document.createElement('button');
		button.type = 'button'; button.className = 'candidate-row';
		button.dataset.index = index;
		button.textContent = label;
		const detail = document.createElement('small');
		const assessments = Object.values(decision.assessments).filter((item) => item.tileCandidateId === candidate.id && item.rating !== 'unreviewed');
		detail.textContent = assessments.some((item) => selectionRatings.has(item.rating)) ? '選択中' : assessments.length ? '評価済み' : '';
		button.append(detail);
		button.onclick = () => inspectCandidate(index);
		ui['candidate-list'].append(button);
	});
	updateCandidateSelection();
}
function updateCandidateSelection() {
	for (const button of ui['candidate-list'].children) {
		const index = Number(button.dataset.index);
		button.classList.toggle('selected', index === inspectedIndex);
		button.classList.toggle('chosen', Object.values(decision?.assessments || {}).some((item) => item.tileCandidateId === decision.candidates[index]?.id && selectionRatings.has(item.rating)));
	}
}
function fillTags(container, selected, onChange, tags = REASON_TAGS) {
	container.replaceChildren();
	for (const tag of tags) {
		const label = document.createElement('label');
		const input = document.createElement('input');
		input.type = 'checkbox'; input.checked = selected.includes(tag);
		input.onchange = () => onChange(tag, input.checked);
		label.append(input, document.createTextNode(tag));
		container.append(label);
	}
}
function resetAnnotation() {
	fillTags(ui['feature-focus-tags'], [], () => {}, FEATURE_FOCUS_TAGS);
	fillTags(ui['candidate-tags'], [], () => {});
	for (const input of ui.annotation.querySelectorAll('input')) input.disabled = true;
	ui['candidate-note'].value = '';
	ui['candidate-note'].disabled = true;
}
function toggleTag(target, tag, checked) {
	target.splice(0, target.length, ...target.filter((item) => item !== tag));
	if (checked) target.push(tag);
}
function inspectCandidate(index, { animate = true } = {}) {
	if (!decision || index < 0 || index >= decision.candidates.length) return;
	if (dropFrame !== null) cancelAnimationFrame(dropFrame);
	inspectedIndex = index;
	previewPhase = 'placement';
	chosenMeeple = { type: 'skip', index: null };
	resetAnnotation();
	if (animate) {
		view.previewDropOffsetY = side * .34;
		const started = performance.now();
		const frame = (now) => {
			const progress = Math.min(1, (now - started) / 165);
			view.previewDropOffsetY = side * .34 * (1 - (1 - progress) ** 3);
			view.render();
			if (progress < 1) dropFrame = requestAnimationFrame(frame);
			else { dropFrame = null; view.previewDropOffsetY = 0; }
		};
		dropFrame = requestAnimationFrame(frame);
	} else view.previewDropOffsetY = 0;
	renderBoard();
	updateNextButton();
}
function renderAssessment() {
	if (!decision || inspectedIndex === null) return;
	previewPhase = 'assessment';
	setStatus('評価は任意です。別の候補を試すか、次の番へ進めます。');
	const assessment = activeAssessment();
	for (const radio of document.querySelectorAll('input[name="rating"]')) radio.checked = radio.value === assessment.rating;
	ui['candidate-note'].value = assessment.note;
	fillTags(ui['feature-focus-tags'], assessment.focusFeatures, (tag, checked) => toggleTag(assessment.focusFeatures, tag, checked), FEATURE_FOCUS_TAGS);
	fillTags(ui['candidate-tags'], assessment.reasons, (tag, checked) => toggleTag(assessment.reasons, tag, checked));
	ui['candidate-note'].disabled = false;
	updateCandidateSelection();
	renderBoard();
	updateNextButton();
}
function selectMeeple(option) {
	if (!decision || inspectedIndex === null || previewPhase !== 'meeple') return;
	chosenMeeple = { type: option.type, index: option.index };
	renderAssessment();
}
function confirmPreview() {
	if (!decision || inspectedIndex === null || previewPhase !== 'placement') return;
	const options = meepleOptionsFor(rawCandidates[inspectedIndex]);
	if (!options.length) { chosenMeeple = { type: 'skip', index: null }; renderAssessment(); return; }
	previewPhase = 'meeple';
	setStatus('ミープルを置く地形を選ぶか、置かずに進んでください。');
	renderBoard();
}
function cancelPreview() {
	if (!decision) return;
	if (dropFrame !== null) cancelAnimationFrame(dropFrame);
	dropFrame = null; view.previewDropOffsetY = 0;
	inspectedIndex = null; previewPhase = 'idle';
	resetAnnotation();
	renderBoard(); updateNextButton();
}
function samePositionIndices(index) {
	const base = rawCandidates[index];
	if (!base) return [];
	return rawCandidates.flatMap((tile, position) => tile.shape === base.shape
		&& Math.hypot(tile.centerX - base.centerX, tile.centerY - base.centerY) < 1e-3 ? [position] : []);
}
function cyclePattern() {
	if (inspectedIndex === null || previewPhase !== 'placement') return;
	const indices = samePositionIndices(inspectedIndex);
	if (indices.length < 2) return;
	inspectCandidate(indices[(indices.indexOf(inspectedIndex) + 1) % indices.length], { animate: false });
}
function updateNextButton() {
	ui.commit.disabled = busy || !selectedAssessment();
}
async function prepareTileDecision() {
	const token = ++operation;
	busy = true;
	decision = null; inspectedIndex = null; previewPhase = 'idle';
	show('decision-panel');
	ui['candidate-list'].replaceChildren();
	resetAnnotation();
	setStatus('合法候補を探索中…');
	let steps = 0;
	const groups = await engine.candidateGroupsProgressively({
		yieldControl: () => (++steps % 64 === 0 ? new Promise((resolve) => setTimeout(resolve, 0)) : null),
	});
	if (token !== operation) return;
	if (engine.state.finished) { finishSession(); return; }
	rawCandidates = groups.regular;
	if (!rawCandidates.length) { setStatus('合法候補がありません。'); busy = false; renderBoard(); return; }
	const context = captureDecisionContext(engine);
	decision = {
		id: `decision-${Date.now()}-${documentRecord.decisions.length + 1}`,
		kind: 'turn', context, candidates: [], assessments: {}, chosenId: null,
		forced: groups.forced,
	};
	ui['decision-title'].textContent = `${engine.activePlayer.name} · 手番の判断`;
	ui['decision-summary'].textContent = `${context.turnNumber}手目 · ${context.currentTile.shape.toUpperCase()} ${context.currentTile.idPrefix} · ${rawCandidates.length}候補`;
	ui['candidate-filter'].value = '';
	ui.redraw.classList.toggle('hidden', mode === 'editor');
	ui.redraw.disabled = !engine.state.deck.length || engine.activePlayer.redrawUsed;
	ui['candidate-progress'].textContent = `特徴量 0/${rawCandidates.length}`;
	renderBoard();
	for (let index = 0; index < rawCandidates.length; index++) {
		decision.candidates.push(describeTileCandidate(engine, rawCandidates[index], index));
		for (const option of [{ type: 'skip', index: null }, ...meepleOptionsFor(rawCandidates[index])]) {
			const item = createAssessment(index, option);
			decision.assessments[item.id] = item;
		}
		if ((index + 1) % 8 === 0 || index + 1 === rawCandidates.length) {
			ui['candidate-progress'].textContent = `特徴量 ${index + 1}/${rawCandidates.length}`;
			await new Promise((resolve) => setTimeout(resolve, 0));
			if (token !== operation) return;
		}
	}
	busy = false;
	ui['candidate-progress'].textContent = `${rawCandidates.length}候補を保存`;
	setStatus('盤面へタイルを置き、配置を確定してください。');
	renderCandidateList();
	renderBoard();
	updateNextButton();
}
function afterTurn() {
	if (!engine.state.finished) prepareTileDecision().catch(reportError);
	else finishSession();
}
function finishSession() {
	busy = false; decision = null; rawCandidates = []; inspectedIndex = null; previewPhase = 'idle';
	show('finish-panel');
	ui['finish-summary'].textContent = `${documentRecord.decisions.length}件の判断を記録しました。`;
	ui.download.disabled = !documentRecord.decisions.length;
	ui['back-turn'].disabled = !undoStack.length;
	setStatus('記録をJSONに書き出せます。');
	renderBoard();
}
function snapshotEngine() {
	return {
		state: structuredClone({ ...engine.state, board: null }),
		boardTiles: structuredClone(engine.state.board.tiles),
		frontier: engine._structuralFrontier,
	};
}
function restoreEngine(snapshot) {
	const result = seededEngine(documentRecord.seed);
	result.state = snapshot.state;
	const board = new Board(side); board.tiles = snapshot.boardTiles;
	result.state.board = board;
	result.fillabilityCache = createFillabilityCache(board, result.tileOptions);
	result._structuralFrontier = snapshot.frontier;
	result._candidateGroups = null;
	return result;
}
function commitDecision() {
	if (!decision || busy) return;
	const assessment = selectedAssessment();
	if (!assessment) return;
	const index = decision.candidates.findIndex((candidate) => candidate.id === assessment.tileCandidateId);
	const choice = rawCandidates[index];
	if (!choice) return;
	const snapshot = snapshotEngine();
	const previousDecision = decision, previousCandidates = rawCandidates;
	engine.placeTile(choice);
	if (engine.state.phase === 'placeMeeple') {
		if (assessment.meeple.type === 'skip') engine.skipMeeple();
		else engine.placeMeeple(assessment.meeple);
	}
	previousDecision.chosenId = assessment.id;
	previousDecision.actual = { placement: placementDescriptor(choice), meeple: assessment.meeple };
	previousDecision.completedAt = new Date().toISOString();
	delete previousDecision.forced;
	documentRecord.decisions.push(previousDecision);
	undoStack.push({ snapshot, decision: previousDecision, candidates: previousCandidates });
	ui['back-turn'].disabled = false;
	ui.download.disabled = false;
	decision = null; rawCandidates = []; inspectedIndex = null; previewPhase = 'idle';
	view.previewDropOffsetY = 0;
	renderBoard();
	afterTurn();
}
function goBack() {
	if (!undoStack.length || busy || tileMotion?.busy) return;
	operation++;
	const previous = undoStack.pop();
	engine = restoreEngine(previous.snapshot);
	for (const player of engine.state.players) { scoreDisplay.set(player.id, player.score); scoreAnimations.delete(player.id); }
	documentRecord.decisions.pop();
	decision = previous.decision;
	decision.forced = previous.snapshot.frontier?.forced || [];
	const restoredId = decision.chosenId;
	delete decision.actual; delete decision.completedAt; decision.chosenId = null;
	rawCandidates = previous.candidates;
	const selected = restoredId ? decision.assessments[restoredId] : null;
	inspectedIndex = selected ? Number(selected.id.split(':')[0]) : null;
	chosenMeeple = selected ? { ...selected.meeple } : { type: 'skip', index: null };
	previewPhase = selected ? 'assessment' : 'idle';
	show('decision-panel');
	ui['back-turn'].disabled = !undoStack.length;
	ui.download.disabled = !documentRecord.decisions.length;
	ui['decision-title'].textContent = `${engine.activePlayer.name} · 手番の判断`;
	ui['decision-summary'].textContent = `${decision.context.turnNumber}手目 · ${decision.context.currentTile.shape.toUpperCase()} ${decision.context.currentTile.idPrefix} · ${rawCandidates.length}候補`;
	ui['candidate-progress'].textContent = `${rawCandidates.length}候補を保存`;
	renderCandidateList();
	if (inspectedIndex !== null) renderAssessment(); else { resetAnnotation(); renderBoard(); }
	updateNextButton();
	setStatus('前の番へ戻りました。評価を変更できます。');
}
function reportError(error) {
	busy = false;
	setStatus(`エラー: ${error?.message || error}`);
	console.error(error);
}
function downloadRecord() {
	if (!documentRecord?.decisions.length) return;
	const date = new Date().toISOString().replace(/[:.]/g, '-');
	const blob = new Blob([JSON.stringify(documentRecord, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url; anchor.download = `penrosanne-decision-record-${date}.json`;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function start() {
	try {
		tileMotion?.cancel(true);
		if (worker) { worker.terminate(); worker = null; }
		operation++;
		busy = false; decision = null; editor = null; engine = null; previewPhase = 'idle';
		mode = ui.mode.value;
		const seed = ui.seed.value.trim() === ''
			? crypto.getRandomValues(new Uint32Array(1))[0]
			: Math.max(0, Math.floor(Number(ui.seed.value) || 0));
		startRecord(mode, seed);
		ui['active-seed'].textContent = `シード ${seed}`;
		ui['inventory-panel'].classList.add('hidden');
		ui['helper-panel'].open = false;
		ui['inventory-toggle'].textContent = '山札・破棄を見る';
		inventorySignature = '';
		scoreDisplay.clear(); scoreAnimations.clear();
		if (mode === 'editor') { openEditor(); return; }
		if (mode === 'full') {
			engine = seededEngine(seed);
			show('decision-panel');
			renderBoard();
			await prepareTileDecision();
			return;
		}
		show('decision-panel');
		ui['candidate-list'].replaceChildren();
		resetAnnotation();
		busy = true;
		const turns = Math.max(0, Math.min(100, Number(ui['cpu-turns'].value) || 0));
		setStatus(`CPUで局面生成中… 0/${turns}手 · シード ${seed}`);
		worker = new Worker(new URL('./recording/ScenarioWorker.js', import.meta.url), { type: 'module' });
		worker.onmessage = async ({ data }) => {
			if (data.type === 'progress') { setStatus(`CPUで局面生成中… ${data.played}/${data.turns}手 · シード ${seed}`); return; }
			if (data.type === 'error') { reportError(new Error(data.message)); return; }
			if (data.type === 'complete') {
				worker.terminate(); worker = null;
				busy = false;
				engine = restoreCpuState(data);
				documentRecord.generatedTurns = data.played;
				view.fitTiles(engine.state.board.tiles);
				renderBoard();
				if (engine.state.finished) { finishSession(); return; }
				prepareTileDecision().catch(reportError);
			}
		};
		worker.onerror = (event) => reportError(new Error(event.message));
		worker.postMessage({ seed, turns });
	} catch (error) { reportError(error); }
}

ui.start.onclick = start;
ui['back-turn'].onclick = goBack;
ui.mode.onchange = () => {
	for (const item of document.querySelectorAll('.cpu-setting')) item.classList.toggle('hidden', ui.mode.value !== 'cpu');
};
ui.mode.onchange();
ui.download.onclick = downloadRecord;
ui['download-finish'].onclick = downloadRecord;
ui['inventory-toggle'].onclick = () => {
	const open = ui['inventory-panel'].classList.toggle('hidden');
	ui['inventory-toggle'].textContent = open ? '山札・破棄を見る' : '山札・破棄を閉じる';
	if (!open) renderInventory();
};
ui['editor-kind'].onchange = refreshEditorChoices;
ui['remove-editor-tile'].onclick = removeEditorTile;
ui['begin-judgment'].onclick = () => {
	try {
		engine = cloneEditorAsEngine();
		editor = null;
		show('decision-panel');
		prepareTileDecision().catch(reportError);
	} catch (error) { reportError(error); }
};
ui['candidate-filter'].oninput = renderCandidateList;
for (const radio of document.querySelectorAll('input[name="rating"]')) radio.onchange = () => {
	if (!radio.checked || !decision || inspectedIndex === null) return;
	const assessment = activeAssessment();
	setAssessmentRating(decision.assessments, assessment.id, radio.value);
	renderCandidateList(); updateNextButton();
};
ui['candidate-note'].oninput = () => {
	if (decision && inspectedIndex !== null) activeAssessment().note = ui['candidate-note'].value;
};
ui['pattern-cycle'].onclick = cyclePattern;
ui['cycle-preview'].onclick = cyclePattern;
ui['confirm-preview'].onclick = confirmPreview;
ui['cancel-preview'].onclick = cancelPreview;
ui['skip-preview-meeple'].onclick = () => selectMeeple({ type: 'skip', index: null });
ui['meeple-skip'].onclick = () => selectMeeple({ type: 'skip', index: null });
ui.commit.onclick = () => { try { commitDecision(); } catch (error) { reportError(error); } };
ui.redraw.onclick = () => {
	try {
		if (mode === 'editor' || !engine || decision?.kind !== 'turn') return;
		documentRecord.events.push({ kind: 'redraw', context: captureDecisionContext(engine), tileId: engine.state.currentTile.id });
		engine.redrawCurrentTile();
		prepareTileDecision().catch(reportError);
	} catch (error) { reportError(error); }
};

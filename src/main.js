import { GameEngine } from './game/GameEngine.js';
import { BoardView } from './ui/BoardView.js';
import { TileTheme } from './ui/TileTheme.js';
import { TileDrag } from './ui/TileDrag.js';
import { handDisplayTile, handTileLayout } from './ui/HandTileLayout.js';
import { PublicHands, drawHandTile } from './ui/PublicHands.js';
import { handTileId, candidatesForHandTile, uniqueCandidatePositions, handChoicesAtPosition } from './game/HandCandidates.js';
import { progressiveDisplayPacing } from './ui/ProgressiveDisplayTiming.js';
import { createSearchCheckpoint, yieldForSearchPaint } from './ui/SearchProgress.js';
import { markerForFeature } from './ui/FeatureAnchors.js';
import { MEEPLE_ASSET_COUNT, meepleAssetForPlayer, meepleKindForFeature, playerColor, selectedMeepleColor, setPlayerMeepleColors } from './ui/MeepleAssets.js';
import { DECK_CONFIGS, createPrototypeDeck } from './game/TileSet.js';
import { chooseCpuAction, DEFAULT_CPU_WEIGHTS } from './ai/CpuPlayer.js';
import { createCpuObservation } from './ai/CpuObservation.js';
import { normalizeCpuPolicy, phaseForProgress } from './ai/TrainingEvolution.js';
import { seededRandom } from './ai/SeededRandom.js';
import { captureDecisionState, MANUAL_LOG_FORMAT } from './ai/SupervisedLearning.js';
import { latestArchiveGeneration } from './ai/TrainingStore.js';
import { listLocalDataFiles, readLocalDataFile } from './ai/LocalDataFiles.js';
import { TITLE_DEFINITIONS, provisionalTitleLeaders } from './game/Scoring.js';
import { structuralPositionKey } from './game/Rules.js';
import { applyTranslations, deckText, language, setLanguage, t } from './ui/i18n.js';
import { finalCrownRanks, finalScoreAtTime, scoreProgressAtTime } from './ui/ScorePresentation.js';

// 対局開始画面の選択値を開始時に反映するためのルール設定。
const gameRules = {
	allowVerticalMatchingPattern: true,
	allowTerrainHalfTurn: true,
	allowTerrainMirror: true,
};
const side = Math.round(window.innerHeight / 5);
function randomGameSeed() {
	if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
	return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
let gameSeed = randomGameSeed();
let engine = new GameEngine({ playerCount: 2, side, fieldScoring: true, rules: gameRules, deferCandidateSearch: true, random: seededRandom(gameSeed) });

function recordManualPlacement(placement) {
	if (!gameStarted || isCpuTurn()) return;
	pendingManualDecision = {
		snapshot: captureDecisionState(engine, engine.candidates(), gameSeed),
		actual: { placement: structuredClone(placement), meeple: null },
	};
	manualLogDecisions.push(pendingManualDecision);
}

function completeManualPlacement(meeple) {
	if (!pendingManualDecision) return;
	pendingManualDecision.actual.meeple = meeple ? { type: meeple.type, index: meeple.index } : null;
	pendingManualDecision.completed = true;
	pendingManualDecision = null;
}

function exportManualGameLog() {
	if (!gameStarted || !engine.state.turnHistory.length) return;
	const createdAt = new Date().toISOString();
	const payload = {
		format: MANUAL_LOG_FORMAT, type: 'penrosanne-manual-game-log', createdAt, gameSeed,
		config: {
			deckType: engine.deckType, playerCount: engine.state.players.length,
			playerNames: engine.state.players.map(player => player.name), fieldScoring: engine.fieldScoring,
			rules: engine.rules, titles: engine.titleRules, handMode: engine.state.handMode,
		},
		startTile: engine.state.board.tiles[0]?.id, decisions: manualLogDecisions.filter(decision => decision.completed),
		turnHistory: engine.state.turnHistory, events: engine.state.events, scoreEvents: engine.state.scoreEvents,
		finalScores: engine.state.players.map(player => ({ id: player.id, name: player.name, score: player.score })),
	};
	const anchor = document.createElement('a');
	anchor.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
	anchor.download = `penrosanne-manual-game-${createdAt.replace(/[:.]/g, '-')}.json`;
	anchor.click(); URL.revokeObjectURL(anchor.href);
}
let candidates = [],
	provisional = null,
	hoveredPlayerIndex = null,
	structuralSearchPending = false,
	structuralSearchProgressCount = 0,
	progressiveAnimationEnabled = true,
	progressiveForcedCandidates = [],
	structuralSearchToken = 0,
	progressiveDisplayQueue = [],
	progressiveDisplayTimer = null,
	progressiveSearchResult = null,
	progressiveSearchCompleted = false,
	progressiveBaselineForcedKeys = new Set(),
	progressiveDisplayIntervalMs = 120,
	progressiveDisplayBatchSize = 1;
// 1 枚ずつ増えていくことを明確に見せるための最小間隔。探索自体の結果は変えない。
const PROGRESSIVE_FRONTIER_INTERVAL_MS = 120;
const el = {
	board: document.querySelector('#board'),
	currentHand: document.querySelector('#current-hand'),
	currentTile: document.querySelector('#current-tile'),
	activeLabel: document.querySelector('#active-player-label'),
	heading: document.querySelector('#turn-heading'),
	titleStatus: document.querySelector('#title-status'),
	thin: document.querySelector('#thin-count'),
	fat: document.querySelector('#fat-count'),
	scores: document.querySelector('#scoreboard'),
	finalScoreDetails: document.querySelector('#final-score-details'),
	logTitle: document.querySelector('#log-title'),
	logSection: document.querySelector('#play-log-section'),
	logSectionToggle: document.querySelector('#log-section-toggle'),
	scoreSectionToggle: document.querySelector('#score-section-toggle'),
	confirm: document.querySelector('#confirm-placement'),
	skip: document.querySelector('#skip-meeple'),
	options: document.querySelector('#meeple-options'),
	patternCycle: document.querySelector('#cycle-placement-pattern'),
	redo: document.querySelector('#redo-tile'),
	forceEnd: document.querySelector('#force-end'),
	exportManualLog: document.querySelector('#export-manual-log'),
	redraw: document.querySelector('#redraw-tile'),
	placementActions: document.querySelector('#placement-actions'),
	theme: document.querySelector('#theme-select'),
	deck: document.querySelector('#deck-select'),
	handMode: document.querySelector('#hand-mode-select'),
	handChoice: document.querySelector('#hand-choice'),
	handChoiceOptions: document.querySelector('#hand-choice-options'),
	handChoiceTrigger: document.querySelector('#open-hand-choice'),
	matchingPatternMode: document.querySelector('#matching-pattern-mode-select'),
	fieldRuleMode: document.querySelector('#field-rule-mode-select'),
	matchingRuleMode: document.querySelector('#matching-rule-mode-select'),
	terrainPatternMode: document.querySelector('#terrain-pattern-mode-select'),
	terrainMirrorMode: document.querySelector('#terrain-mirror-mode-select'),
	progressiveFrontier: document.querySelector('#progressive-frontier-toggle'),
	cpuGeneration: document.querySelector('#cpu-generation-select'),
	startDeck: document.querySelector('#start-deck'),
	playerCount: document.querySelector('#player-count-select'),
	player1Color: document.querySelector('#player1-color'),
	player2Color: document.querySelector('#player2-color'),
	player3Color: document.querySelector('#player3-color'),
	player4Color: document.querySelector('#player4-color'),
	player1ColorSwatch: document.querySelector('#player1-color-swatch'),
	player2ColorSwatch: document.querySelector('#player2-color-swatch'),
	player3ColorSwatch: document.querySelector('#player3-color-swatch'),
	player4ColorSwatch: document.querySelector('#player4-color-swatch'),
	player1Name: document.querySelector('#player1-name'),
	player2Name: document.querySelector('#player2-name'),
	player3Name: document.querySelector('#player3-name'),
	player4Name: document.querySelector('#player4-name'),
	languageChoices: document.querySelector('#language-choices'),
	replayButton: document.querySelector('#replay-game'),
};
const playerColorSettings = Array.from({ length: 4 }, (_, index) => ({
	button: el[`player${index + 1}Color`],
	menu: document.querySelector(`#player${index + 1}-color-menu`),
	swatch: el[`player${index + 1}ColorSwatch`],
	name: el[`player${index + 1}Name`],
	container: document.querySelector(`.player-color-setting[data-player-index="${index}"]`),
	color: selectedMeepleColor(index),
}));
const RULE_PRESETS = Object.freeze({
	basic: { deck: 'lite', hand: 'single', field: false, titles: [], matching: true, pattern: true, terrain: true, mirror: true },
	standard: { deck: 'standard', hand: 'single', field: true, titles: ['vertexKing'], matching: true, pattern: true, terrain: true, mirror: true },
	advanced: { deck: 'expansion', hand: 'private-city-planning', field: true, titles: TITLE_DEFINITIONS.map(({ id }) => id), matching: true, pattern: true, terrain: true, mirror: true },
});
const ruleControls = [
	['matching', el.matchingRuleMode], ['pattern', el.matchingPatternMode],
	['terrain', el.terrainPatternMode], ['mirror', el.terrainMirrorMode],
];
let selectedRulePreset = 'standard';
let cpuPlayers = [false, false, false, false], cpuCatalog = null;
let cpuWeights = normalizeCpuPolicy(DEFAULT_CPU_WEIGHTS);
let cpuFolderFiles = [], cpuSelectionToken = 0;
const cpuFileCache = new Map();
const cpuRecordLabel = document.createElement('label');
const cpuRecordTitle = document.createElement('span');
const cpuRecordSelect = document.createElement('select');
cpuRecordTitle.dataset.i18n = 'cpu.generationWithinFile';
cpuRecordTitle.textContent = t('cpu.generationWithinFile');
cpuRecordSelect.disabled = true;
cpuRecordLabel.append(cpuRecordTitle, cpuRecordSelect);
el.cpuGeneration.closest('label').after(cpuRecordLabel);
cpuRecordLabel.style.display = 'none';
const cpuGenerationStatus = document.createElement('small');
cpuGenerationStatus.className = 'cpu-generation-status';
cpuGenerationStatus.setAttribute('role', 'status');
cpuRecordLabel.after(cpuGenerationStatus);
let cpuFolderError = false;
let selectedCpuArchiveKey = '';
let manualLogDecisions = [], pendingManualDecision = null;
let cpuTurnGeneration = 0, cpuTurnRunning = false, cpuTurnTimer = null, resolveCpuPause = null;
let pendingCpuMeeple = null;
const setupRadio = (group, value) => {
	const radio = document.querySelector(`#${group} input[value="${value}"]`);
	if (radio) radio.checked = true;
};
function setSetupSwitchText() {
	document.querySelectorAll('.setup-switch').forEach(label => {
		const input = label.querySelector('input[type="checkbox"]');
		label.querySelector('.switch-face').textContent = input.checked ? 'ON' : 'OFF';
	});
}
const titleRuleSettings = new Map();
for (const { id } of TITLE_DEFINITIONS) {
	const label = document.createElement('label');
	const icon = document.createElement('span');
	const name = document.createElement('span');
	name.dataset.i18n = `title.${id}`;
	icon.className = `setup-rule-icon icon-${id}`;
	icon.setAttribute('aria-hidden', 'true');
	label.className = 'setup-switch';
	const toggle = document.createElement('input');
	toggle.type = 'checkbox';
	toggle.id = `title-${id}-mode-select`;
	const face = document.createElement('span');
	face.className = 'switch-face';
	label.append(icon, name, toggle, face);
	document.querySelector('#title-rule-settings').append(label);
	titleRuleSettings.set(id, toggle);
}
function renderDeckOptions() {
	const selected = el.deck.value || engine.deckType;
	el.deck.replaceChildren();
	const choices = document.querySelector('#deck-choices');
	choices.replaceChildren();
	for (const deck of DECK_CONFIGS) {
		const option = document.createElement('option'), text = deckText(deck);
		option.value = deck.id;
		option.textContent = text.label;
		option.selected = deck.id === selected;
		el.deck.append(option);
		const label = document.createElement('label');
		const radio = document.createElement('input');
		const caption = document.createElement('span');
		radio.type = 'radio'; radio.name = 'deck-choice'; radio.value = deck.id;
		radio.checked = deck.id === selected;
		caption.textContent = t(`setup.deck${{ 'road-only': 'Road', lite: 'Lite', standard: 'Standard', expansion: 'Expansion' }[deck.id]}`);
		label.append(radio, caption);
		choices.append(label);
	}
}
renderDeckOptions();
playerColorSettings.forEach(({ container }, index) => {
	const cpu = document.createElement('label');
	const input = document.createElement('input');
	const face = document.createElement('span');
	cpu.className = 'setup-switch setup-cpu';
	input.type = 'checkbox'; input.id = `player${index + 1}-cpu`; input.checked = index > 0;
	face.className = 'switch-face';
	cpu.append(document.createTextNode('CPU'), input, face);
	container.append(cpu);
});
function setupStateMatchesPreset(preset) {
	return el.deck.value === preset.deck && el.handMode.value === preset.hand
		&& el.fieldRuleMode.checked === preset.field
		&& ruleControls.every(([key, input]) => input.checked === preset[key])
		&& [...titleRuleSettings].every(([id, input]) => input.checked === preset.titles.includes(id));
}
function updateSetupStatus() {
	setSetupSwitchText();
	const changed = !setupStateMatchesPreset(RULE_PRESETS[selectedRulePreset]);
	document.querySelector('#custom-rules-changed').classList.toggle('hidden', !changed);
	const minutes = ({ 'road-only': 5, lite: 5, standard: 10, expansion: 20 })[el.deck.value] || 10;
	document.querySelector('#estimated-play-time').textContent = t('setup.estimatedTime', {
		minutes: minutes * (el.handMode.value === 'private-city-planning' ? 3 : 1),
	});
}
function applyRulePreset(id) {
	const preset = RULE_PRESETS[id];
	if (!preset) return;
	selectedRulePreset = id;
	el.deck.value = preset.deck;
	el.handMode.value = preset.hand;
	el.fieldRuleMode.checked = preset.field;
	for (const [key, input] of ruleControls) input.checked = preset[key];
	for (const [titleId, input] of titleRuleSettings) input.checked = preset.titles.includes(titleId);
	setupRadio('deck-choices', preset.deck);
	setupRadio('hand-mode-choices', preset.hand);
	updateSetupStatus();
}
applyRulePreset('standard');
let view, tileMotion, logCameraOffset = 0, logOpen = false, handChoicePosition = null, handChoiceChoices = [], handChoiceCollapsed = false;
const publicHands = new PublicHands({
	onDrag: (event, tile, canvas) => {
		if (event.button!==0 || !gameStarted || replay || structuralSearchPending || tileMotion?.busy || isCpuTurn() || engine.state.phase!=='placeTile') return;
		closeHandChoice();
		engine.selectHandTile(tile.id);
		tileMotion.begin(event,null,true,canvas);
	},
	onRedraw: tileId => redrawHandTile(tileId),
});
let gameStarted = false;
function isCpuTurn() {
	return gameStarted && Boolean(cpuPlayers[engine.state.turn]) && !engine.state.finished;
}
function syncCpuPlayers() {
	cpuPlayers = playerColorSettings.map((_, index) => Boolean(document.querySelector(`#player${index + 1}-cpu`)?.checked));
}
async function applyCpuGenerationSelection() {
	const token = ++cpuSelectionToken;
	const value = el.cpuGeneration.value;
	const file = value === 'latest' ? cpuFolderFiles[0] : value.startsWith('file:') ? cpuFolderFiles.find(item => item.name === value.slice(5)) : null;
	if (!file) {
		cpuWeights = normalizeCpuPolicy(DEFAULT_CPU_WEIGHTS);
		cpuRecordSelect.replaceChildren(); cpuRecordSelect.disabled = true; selectedCpuArchiveKey = '';
		cpuRecordLabel.style.display = 'none';
		el.cpuGeneration.title = '';
		cpuGenerationStatus.textContent = value === 'latest' && cpuFolderError ? t('cpu.folderUnavailable') : '';
		return;
	}
	try {
		const key = `${file.name}:${file.modifiedAt}:${file.size}`;
		if (!cpuFileCache.has(key)) {
			const payload = await readLocalDataFile('cpu', file.name);
			latestArchiveGeneration(payload);
			const records = (Array.isArray(payload) ? payload : payload.generations)
				.map((record, index) => ({ record, index }))
				.filter(({ record }) => Number.isInteger(record?.generation) && record.generation >= 0 && record.championWeights)
				.sort((a, b) => b.record.generation - a.record.generation || b.index - a.index);
			cpuFileCache.set(key, records.map(({ record }) => record));
		}
		if (token !== cpuSelectionToken) return;
		const records = cpuFileCache.get(key);
		const previousRecord = selectedCpuArchiveKey === key ? cpuRecordSelect.value : '';
		cpuRecordSelect.replaceChildren(...records.map((record, index) => new Option(record.lineageName ? `${record.lineageName}${record.generation}` : t('cpu.generationOption', { number: record.generation }), String(index))));
		cpuRecordSelect.value = previousRecord && Number(previousRecord) < records.length ? previousRecord : '0';
		cpuRecordSelect.disabled = false; selectedCpuArchiveKey = key;
		cpuRecordLabel.style.display = '';
		const selected = records[Number(cpuRecordSelect.value) || 0];
		cpuWeights = normalizeCpuPolicy(selected.championWeights);
		el.cpuGeneration.title = file.name;
		cpuGenerationStatus.textContent = t('cpu.usingFolderFile', { generation: `${selected.lineageName || ''}${selected.generation}` });
	} catch (error) {
		if (token !== cpuSelectionToken) return;
		cpuWeights = normalizeCpuPolicy(DEFAULT_CPU_WEIGHTS);
		cpuRecordSelect.replaceChildren(); cpuRecordSelect.disabled = true; selectedCpuArchiveKey = '';
		cpuRecordLabel.style.display = 'none';
		el.cpuGeneration.title = t('cpu.folderReadError', { message: error.message });
		cpuGenerationStatus.textContent = el.cpuGeneration.title;
		console.error('CPU generation file could not be loaded', error);
	}
}
async function refreshCpuGenerationOptions() {
	const selected = el.cpuGeneration.value || 'latest';
	try { cpuFolderFiles = await listLocalDataFiles('cpu'); cpuFolderError = false; }
	catch (error) { cpuFolderFiles = []; cpuFolderError = true; console.warn('CPU generation folder could not be listed', error); }
	el.cpuGeneration.replaceChildren();
	for (const [value, label] of [
		['latest', t('cpu.latestFolderGeneration')], ['baseline', t('cpu.defaultGeneration')],
		...cpuFolderFiles.map(file => [`file:${file.name}`, file.name]),
	]) {
		const option = document.createElement('option'); option.value = value; option.textContent = label;
		el.cpuGeneration.append(option);
	}
	el.cpuGeneration.value = [...el.cpuGeneration.options].some(option => option.value === selected) ? selected : 'latest';
	await applyCpuGenerationSelection();
}
function cancelCpuTurn() {
	cpuTurnGeneration++;
	if (cpuTurnTimer !== null) clearTimeout(cpuTurnTimer);
	cpuTurnTimer = null;
	resolveCpuPause?.(false);
	resolveCpuPause = null;
	cpuTurnRunning = false;
}
function cpuPause(milliseconds) {
	return new Promise(resolve => {
		resolveCpuPause = resolve;
		cpuTurnTimer = setTimeout(() => {
			cpuTurnTimer = null;
			resolveCpuPause = null;
			resolve(true);
		}, milliseconds);
	});
}
function cpuTurnIsCurrent(generation, playingEngine) {
	return generation === cpuTurnGeneration && engine === playingEngine && isCpuTurn()
		&& !replay && settings.classList.contains('hidden');
}
function maybeScheduleCpuTurn() {
	if (cpuTurnRunning || structuralSearchPending || !isCpuTurn() || replay || !settings.classList.contains('hidden')) return;
	const generation = cpuTurnGeneration, playingEngine = engine;
	cpuTurnRunning = true;
	cpuTurnTimer = setTimeout(() => {
		cpuTurnTimer = null;
		runCpuTurn(generation, playingEngine);
	}, 180);
}
async function runCpuTurn(generation, playingEngine) {
	try {
		if (!cpuTurnIsCurrent(generation, playingEngine) || structuralSearchPending) return;
		if (playingEngine.state.phase === 'placeMeeple') {
			const option = pendingCpuMeeple && playingEngine.meepleOptions().find(item => item.type === pendingCpuMeeple.type && item.index === pendingCpuMeeple.index);
			if (option) playingEngine.placeMeeple(option);
			else playingEngine.skipMeeple();
			pendingCpuMeeple = null;
			refreshCandidates(); render();
			return;
		}
		if (playingEngine.state.phase !== 'placeTile') return;
		const legal = playingEngine.candidates();
		if (!legal.length) {
			if (playingEngine.privatePlanning) {
				if (playingEngine.state.deck.length) playingEngine.redrawCurrentTile(playingEngine.handForPlayer()[0]?.id);
				else playingEngine.passTurn();
				refreshCandidates(); render();
			}
			return;
		}
		el.heading.textContent = t('game.cpuThinking', { player: displayPlayerName(playingEngine.activePlayer) });
		await yieldForSearchPaint();
		if (!cpuTurnIsCurrent(generation, playingEngine)) return;
		const handCount = Object.values(playingEngine.state.hands || {}).reduce((sum, hand) => sum + hand.length, 0);
		const totalTiles = playingEngine.state.board.tiles.length + playingEngine.state.deck.length + playingEngine.state.discarded.length + handCount + Number(Boolean(playingEngine.state.currentTile));
		const weights = cpuWeights.phaseWeights[phaseForProgress(playingEngine.state.board.tiles.length / Math.max(1, totalTiles))];
		const observation = createCpuObservation(playingEngine, legal, cpuCatalog);
		const decision = chooseCpuAction(observation, {
			weights,
			tacticalLimit: playingEngine.state.players.length === 2 && !playingEngine.privatePlanning ? 3 : 0,
		});
		if (!cpuTurnIsCurrent(generation, playingEngine)) return;
		animateCandidatePreview(decision.placement);
		if (!await cpuPause(190) || !cpuTurnIsCurrent(generation, playingEngine)) return;
		stopPreviewDrop();
		removeProgressiveForcedCandidate(decision.placement);
		playingEngine.placeTile(decision.placement);
		pendingCpuMeeple = decision.meeple;
		provisional = null;
		render();
		if (playingEngine.state.phase === 'placeMeeple') {
			if (!await cpuPause(220) || !cpuTurnIsCurrent(generation, playingEngine)) return;
			const option = decision.meeple && playingEngine.meepleOptions().find(item => item.type === decision.meeple.type && item.index === decision.meeple.index);
			if (option) playingEngine.placeMeeple(option);
			else playingEngine.skipMeeple();
			pendingCpuMeeple = null;
		}
		refreshCandidates(); render();
	} catch (error) {
		if (generation === cpuTurnGeneration) {
			el.heading.textContent = t('game.cpuFailed');
			console.error(error);
		}
	} finally {
		if (generation === cpuTurnGeneration) {
			cpuTurnRunning = false;
			maybeScheduleCpuTurn();
		}
	}
}
function renderMeepleColorOptions() {
	playerColorSettings.forEach((setting, playerIndex) => {
		const selected = setting.color || selectedMeepleColor(playerIndex);
		setting.color = selected;
		setting.menu.replaceChildren();
		for (let color = 1; color <= MEEPLE_ASSET_COUNT; color++) {
			const option = document.createElement('button');
			const image = document.createElement('img');
			option.type = 'button';
			option.className = 'meeple-color-option';
			option.dataset.color = String(color);
			option.setAttribute('role', 'option');
			option.setAttribute('aria-selected', String(color === selected));
			option.setAttribute('aria-label', t('setup.colorNumber', { number: String(color).padStart(2, '0') }));
			image.src = `assets/meeples/meeple-lying_${color}.svg`;
			image.alt = '';
			option.append(image);
			option.onclick = () => selectMeepleColor(playerIndex, color);
			setting.menu.append(option);
		}
	});
	updatePlayerCountSettings();
	updateMeepleColorSettings();
}
function updatePlayerCountSettings() {
	const count = Number(el.playerCount.value) || 2;
	playerColorSettings.forEach(({ container }, index) => container.classList.toggle('hidden', index >= count));
}
function updateMeepleColorSettings() {
	const colors = playerColorSettings.map((setting, index) => setting.color || selectedMeepleColor(index));
	setPlayerMeepleColors(colors);
	playerColorSettings.forEach((setting, playerIndex) => {
		setting.swatch.src = `assets/meeples/meeple-lying_${colors[playerIndex]}.svg`;
		setting.button.dataset.color = String(colors[playerIndex]);
		setting.menu.querySelectorAll('.meeple-color-option').forEach(option => option.setAttribute('aria-selected', String(Number(option.dataset.color) === colors[playerIndex])));
	});
	if (view) render();
}
function closeMeepleColorMenus() {
	playerColorSettings.forEach(({ button, menu }) => {
		menu.classList.add('hidden');
		button.setAttribute('aria-expanded', 'false');
	});
}
function selectMeepleColor(playerIndex, color) {
	playerColorSettings[playerIndex].color = color;
	closeMeepleColorMenus();
	updateMeepleColorSettings();
}
function toggleMeepleColorMenu(playerIndex) {
	const setting = playerColorSettings[playerIndex];
	const willOpen = setting.menu.classList.contains('hidden');
	closeMeepleColorMenus();
	setting.menu.classList.toggle('hidden', !willOpen);
	setting.button.setAttribute('aria-expanded', String(willOpen));
}
function configuredPlayerNames() {
	return playerColorSettings.map(({ name }, index) => {
		const requested = name.value.trim();
		return requested ? [...requested].slice(0, Number(name.maxLength)).join('') : t('setup.defaultPlayerName', { number: index + 1 });
	});
}
function syncDefaultPlayerNames() {
	const maxLength = language() === 'en' ? 10 : 6;
	playerColorSettings.forEach(({ name }, index) => {
		name.maxLength = maxLength;
		if (name.dataset.defaultName === 'true') name.value = t('setup.defaultPlayerName', { number: index + 1 });
	});
}
function applyConfiguredPlayerNames() {
	if (!engine?.state) return;
	engine.state.players.forEach((player, index) => { player.name = configuredPlayerNames()[index]; });
}
renderMeepleColorOptions();
syncDefaultPlayerNames();
let historyHover = null, replay = null, replayedEngine = null, replayTimer = null, replayComplete = false, logSignature = '', previewDropFrame = null, finalPanelMode = 'scores';
let displayedScores = new Map(), liveScoreAnimations = new Map(), scoreAnimationFrame = null, finalScoreReveal = null;
let scoreElements = new Map(), crownElements = new Map();

function resetScorePresentation() {
	if (scoreAnimationFrame !== null) cancelAnimationFrame(scoreAnimationFrame);
	scoreAnimationFrame = null;
	liveScoreAnimations.clear();
	finalScoreReveal = null;
	displayedScores = new Map(engine.state.players.map((player) => [player.id, player.score]));
}
function scheduleScoreFrame() {
	if (scoreAnimationFrame === null) scoreAnimationFrame = requestAnimationFrame(updateScoreFrame);
}
function updateScoreFrame(now) {
	scoreAnimationFrame = null;
	if (finalScoreReveal?.active) {
		const elapsed = Math.max(0, now - finalScoreReveal.startedAt);
		const value = scoreProgressAtTime(elapsed);
		for (const player of engine.state.players) {
			const shown = finalScoreAtTime(player.score, elapsed);
			displayedScores.set(player.id, shown);
			if (scoreElements.get(player.id)) scoreElements.get(player.id).textContent = shown;
			const crown = crownElements.get(player.id);
			if (crown && shown === player.score && (
				finalScoreReveal.ranks.get(player.id) === 'silver' ||
				(finalScoreReveal.ranks.get(player.id) === 'gold' && value >= finalScoreReveal.highest)
			)) {
				finalScoreReveal.unlocked.add(player.id);
				crown.classList.remove('hidden');
			}
		}
		if (value < finalScoreReveal.highest) { scheduleScoreFrame(); return; }
		finalScoreReveal.active = false;
		renderScores();
		renderFinalLogSections();
		return;
	}
	for (const [id, animation] of liveScoreAnimations) {
		const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
		const eased = 1 - (1 - progress) ** 3;
		const shown = progress === 1 ? animation.to : Math.round(animation.from + (animation.to - animation.from) * eased);
		displayedScores.set(id, shown);
		if (scoreElements.get(id)) scoreElements.get(id).textContent = shown;
		if (progress === 1) liveScoreAnimations.delete(id);
	}
	if (liveScoreAnimations.size) scheduleScoreFrame();
}
function startFinalScoreReveal() {
	if (scoreAnimationFrame !== null) cancelAnimationFrame(scoreAnimationFrame);
	scoreAnimationFrame = null;
	liveScoreAnimations.clear();
	const scores = [...new Set(engine.state.players.map((player) => player.score))].sort((a, b) => b - a);
	const ranks = finalCrownRanks(engine.state.players);
	finalScoreReveal = { startedAt: performance.now(), highest: scores[0] || 0, ranks, unlocked: new Set(), active: true };
	displayedScores = new Map(engine.state.players.map((player) => [player.id, 0]));
	scheduleScoreFrame();
}
function prepareLiveScoreAnimations() {
	if (engine.state.finished || replay) return;
	const now = performance.now();
	for (const player of engine.state.players) {
		if (!displayedScores.has(player.id)) displayedScores.set(player.id, player.score);
		const animation = liveScoreAnimations.get(player.id);
		if (animation?.to === player.score || (!animation && displayedScores.get(player.id) === player.score)) continue;
		const from = displayedScores.get(player.id);
		liveScoreAnimations.set(player.id, {
			from, to: player.score, startedAt: now,
			duration: Math.min(650, Math.max(230, Math.abs(player.score - from) * 22)),
		});
	}
	if (liveScoreAnimations.size) scheduleScoreFrame();
}
const tileTheme = new TileTheme({
	onChange: () => {
		// テーマごとのアンカー上書きもあるため、単なるCanvas再描画ではなく
		// ミープル座標・配置候補を組み立て直す。
		if (view) render();
	},
});
view = new BoardView(el.board, {
	side,
	placed: engine.state.board.tiles,
	candidates: [],
	structuralCandidates: [],
	// 実際のゲーム盤面では、タイル一覧より見分けやすい約2倍の大きさで描画する。
	meepleScale: 2,
	onFeatureSelect: (marker) => placeMeeple(marker.option),
	onPreviewDragStart: (event) => { if (!isCpuTurn()) tileMotion?.begin(event, provisional); },
	isTileHeld: () => tileMotion?.busy,
	onCancelTileDrag: () => tileMotion?.cancel(),
	onRender: () => { if (view) { renderPlacementActions(); positionHandChoice(); } },
	onPreviewPatternCycle: () => { if (!isCpuTurn()) cycleProvisionalPattern(); },
	onSelect: (tile) => {
		if (engine.state.phase !== 'placeTile' || structuralSearchPending || tileMotion?.busy || isCpuTurn()) return;
		selectCandidate(tile);
	},
	tileTheme,
});
function syncLogCameraOffset(resetBase = false) {
	if (!view) return;
	if (resetBase) logCameraOffset = 0;
	const target = logOpen ? -Math.min(180, view.width * .17) : 0;
	view.camera.x += target - logCameraOffset;
	logCameraOffset = target;
	view.render();
}

function displayCandidates() {
	return displayCandidateTiles(engine.candidates());
}
function stopPreviewDrop() {
	if (previewDropFrame !== null) cancelAnimationFrame(previewDropFrame);
	previewDropFrame = null;
	if (view) view.previewDropOffsetY = 0;
}
function animateCandidatePreview(tile, { keepHandChoice = false } = {}) {
	if (!keepHandChoice) closeHandChoice();
	if (engine.privatePlanning) engine.selectHandTile(handTileId(tile));
	stopPreviewDrop();
	provisional = tile;
	view.previewDropOffsetY = side * .34;
	render();
	const started = performance.now(), duration = 165, initialOffset = side * .34;
	const frame = now => {
		if (provisional !== tile || engine.state.phase !== 'placeTile') { stopPreviewDrop(); return; }
		const progress = Math.min(1, (now - started) / duration), eased = 1 - (1 - progress) ** 3;
		view.previewDropOffsetY = initialOffset * (1 - eased);
		view.render();
		if (progress < 1) previewDropFrame = requestAnimationFrame(frame);
		else { previewDropFrame = null; view.previewDropOffsetY = 0; view.render(); }
	};
	previewDropFrame = requestAnimationFrame(frame);
}
function displayCandidateTiles(tiles) { return tiles.map((tile, index) => ({ ...tile, _candidateKey: `regular:${tile.id}:${index}` })); }
function resetProgressiveDisplay({ preserveVisible = false } = {}) {
	if (progressiveDisplayTimer !== null) clearTimeout(progressiveDisplayTimer);
	progressiveDisplayTimer = null;
	progressiveDisplayQueue = [];
	progressiveSearchResult = null;
	progressiveSearchCompleted = false;
	progressiveBaselineForcedKeys = new Set();
	progressiveDisplayIntervalMs = PROGRESSIVE_FRONTIER_INTERVAL_MS;
	progressiveDisplayBatchSize = 1;
	if (!preserveVisible) progressiveForcedCandidates = [];
}
function progressiveForcedHas(tile) {
	const key = structuralPositionKey(tile);
	return progressiveForcedCandidates.some((entry) => structuralPositionKey(entry) === key)
		|| progressiveDisplayQueue.some((entry) => structuralPositionKey(entry) === key);
}
function removeProgressiveForcedCandidate(tile) {
	const key = structuralPositionKey(tile);
	progressiveForcedCandidates = progressiveForcedCandidates.filter((entry) => structuralPositionKey(entry) !== key);
	progressiveDisplayQueue = progressiveDisplayQueue.filter((entry) => structuralPositionKey(entry) !== key);
}
function queueProgressiveForced(tile, token) {
	if (token !== structuralSearchToken || !progressiveAnimationEnabled || progressiveForcedHas(tile)) return;
	progressiveDisplayQueue.push(tile);
	if (progressiveDisplayTimer === null && progressiveForcedCandidates.length === 0) revealNextProgressiveForced(token, true);
	else if (progressiveDisplayTimer === null) revealNextProgressiveForced(token);
}
function revealNextProgressiveForced(token, immediately = false) {
	const reveal = () => {
		progressiveDisplayTimer = null;
		if (token !== structuralSearchToken) return;
		let added = 0;
		while (added < progressiveDisplayBatchSize && progressiveDisplayQueue.length) {
			progressiveForcedCandidates.push(progressiveDisplayQueue.shift());
			added++;
		}
		if (added) render();
		if (progressiveDisplayQueue.length) revealNextProgressiveForced(token);
		else finishProgressiveDisplay(token);
	};
	if (immediately) reveal();
	else progressiveDisplayTimer = setTimeout(reveal, progressiveDisplayIntervalMs);
}
function finishProgressiveDisplay(token) {
	if (token !== structuralSearchToken || !progressiveSearchCompleted || !progressiveSearchResult || progressiveDisplayQueue.length || progressiveDisplayTimer !== null) return;
	// コールバックを通らないキャッシュ済みの探索結果も、最後には完全な集合へそろえる。
	progressiveForcedCandidates = progressiveSearchResult.forced;
	candidates = displayCandidateTiles(progressiveSearchResult.regular);
	structuralSearchPending = false;
	progressiveSearchResult = null;
	render();
	maybeScheduleCpuTurn();
}
function refreshCandidates() {
	closeHandChoice();
	const token = ++structuralSearchToken;
	if (engine.state.phase !== 'placeTile') {
		resetProgressiveDisplay({ preserveVisible: true });
		candidates = [];
		structuralSearchPending = false;
		return;
	}
	// 開発用トグルは順次表示だけを切り替える。探索中の描画機会は常に確保する。
	engine.deferCandidateSearch = true;
	progressiveAnimationEnabled = el.progressiveFrontier.checked;
	// 前盤面から残る確定配置は最初から表示し、新しく増えた分だけをキューに載せる。
	resetProgressiveDisplay({ preserveVisible: true });
	progressiveBaselineForcedKeys = new Set(progressiveForcedCandidates.map(structuralPositionKey));
	candidates = [];
	structuralSearchPending = true;
	structuralSearchProgressCount = 0;
	resolveCandidatesProgressively(token);
}
async function resolveCandidatesProgressively(token) {
	const searchingEngine = engine;
	try {
		// 重い探索を始める前に、案内文と待機カーソルを実際に描画する。
		render();
		await yieldForSearchPaint();
		if (token !== structuralSearchToken) return;
		const checkpoint = createSearchCheckpoint({
			onProgress: count => { structuralSearchProgressCount = count; updateSearchStatus(); },
			yieldToBrowser: yieldForSearchPaint,
		});
		const groups = await searchingEngine.candidateGroupsProgressively({
			onForced: tile => queueProgressiveForced(tile, token),
			yieldControl: progress => {
				if (token !== structuralSearchToken) throw new Error('Search superseded');
				return checkpoint(progress);
			},
		});
		if (token !== structuralSearchToken) return;
		progressiveSearchResult = groups;
		const addedCount = groups.forced.filter((tile) => !progressiveBaselineForcedKeys.has(structuralPositionKey(tile))).length;
		structuralSearchProgressCount = addedCount;
		updateSearchStatus();
		const pacing = progressiveDisplayPacing(addedCount);
		progressiveDisplayIntervalMs = pacing.intervalMs;
		progressiveDisplayBatchSize = pacing.batchSize;
		// キャッシュ命中時は onForced が呼ばれないので、未表示分をここでキューへ補う。
		groups.forced.forEach(tile => queueProgressiveForced(tile, token));
		progressiveSearchCompleted = true;
		finishProgressiveDisplay(token);
	} catch (error) {
		if (token !== structuralSearchToken) return;
		resetProgressiveDisplay({ preserveVisible: true });
		structuralSearchPending = false;
		render();
		el.heading.textContent = t('game.expansionFailed');
		console.error(error);
	}
}
function updateSearchStatus() {
	document.querySelector('.game-table').classList.toggle('search-pending', structuralSearchPending);
	el.board.setAttribute('aria-busy', String(structuralSearchPending));
	if (structuralSearchPending) el.heading.textContent = structuralSearchProgressCount
		? t('game.expandingProgress', { count: structuralSearchProgressCount })
		: t('game.expanding');
}
function allCandidates() { return candidates; }
function selectedTileCandidates() { return engine.privatePlanning && provisional ? candidatesForHandTile(candidates,provisional) : candidates; }
function selectCandidate(tile) {
	if (!engine.privatePlanning) { animateCandidatePreview(tile); return; }
	const choices=handChoicesAtPosition(candidates,tile);
	if (choices.length===1) { animateCandidatePreview(choices[0]); return; }
	if (!choices.length) return;
	showHandChoice(tile, choices);
	// 複数種類を置ける候補は、先頭の種類を即座に仮置きする。
	// 吹き出しは残るため、確定前ならいつでも別の種類に差し替えられる。
	animateCandidatePreview(choices[0], { keepHandChoice: true });
	el.handChoiceOptions.querySelector('button')?.focus({preventScroll:true});
}
function showHandChoice(position, choices) {
	handChoicePosition=position;
	handChoiceChoices=choices;
	handChoiceCollapsed=false;
	el.handChoiceTrigger.classList.add('hidden');
	el.handChoice.classList.remove('hidden');
	el.handChoiceOptions.replaceChildren();
	for (const candidate of choices) {
		const button=document.createElement('button'), canvas=document.createElement('canvas');
		const hand=engine.handForPlayer(), index=hand.findIndex(item=>item.id===handTileId(candidate));
		button.type='button'; button.dataset.tileId=handTileId(candidate);
		button.setAttribute('aria-label',t('hand.number',{number:index+1})); canvas.setAttribute('aria-hidden','true');
		canvas.choiceTile=hand[index];
		button.append(canvas); button.onclick=()=>animateCandidatePreview(candidate, { keepHandChoice: true });
		el.handChoiceOptions.append(button);
		drawHandTile(canvas,hand[index],view);
	}
	positionHandChoice();
}
function collapseHandChoice() {
	if (!handChoicePosition) return;
	handChoiceCollapsed=true;
	el.handChoice.classList.add('hidden');
	el.handChoiceTrigger.classList.remove('hidden');
	positionHandChoice();
}
function showCollapsedHandChoice(position, choices) {
	if (choices.length < 2) return;
	handChoicePosition=position;
	handChoiceChoices=choices;
	handChoiceCollapsed=true;
	el.handChoice.classList.add('hidden');
	el.handChoiceTrigger.classList.remove('hidden');
	positionHandChoice();
}
function restoreHandChoice() {
	if (!handChoicePosition || !handChoiceChoices.length) return;
	handChoiceCollapsed=false;
	el.handChoiceTrigger.classList.add('hidden');
	el.handChoice.classList.remove('hidden');
	positionHandChoice();
}
function closeHandChoice() {
	handChoicePosition=null;
	handChoiceChoices=[];
	handChoiceCollapsed=false;
	el.handChoice.classList.add('hidden');
	el.handChoiceTrigger.classList.add('hidden');
}
function positionHandChoice() {
	if (!handChoicePosition || !view) return;
	const target=provisional || handChoicePosition;
	const anchor=view.screenFromWorldPoint({x:target.centerX,y:target.centerY});
	const choiceElement=handChoiceCollapsed ? el.handChoiceTrigger : el.handChoice;
	const tileRadius=view.options.side*view.camera.zoom*.72;
	// 仮置きタイルと一体で扱う。画面端を避ける再配置はせず、吹き出しは常に上へ置く。
	el.handChoice.classList.remove('compact-choice');
	const width=choiceElement.offsetWidth, height=choiceElement.offsetHeight;
	const left=anchor.x-width/2;
	const top=anchor.y-tileRadius-height-28;
	choiceElement.style.left=`${left}px`;choiceElement.style.top=`${top}px`;
	choiceElement.style.setProperty('--choice-arrow-x',`${Math.max(16,Math.min(width-16,anchor.x-left))}px`);
	if (!handChoiceCollapsed) for(const canvas of el.handChoiceOptions.querySelectorAll('canvas')) drawHandTile(canvas,canvas.choiceTile,view);
}
function markerFor(tile, option) {
	return markerForFeature(tile, option, side, tileTheme.id);
}
function meepleMarkers() {
	if (engine.state.phase !== 'placeMeeple') return [];
	const tile = engine.state.board.getTile(engine.state.currentTile.id);
	return engine.meepleOptions().map((option) => {
		const marker = markerFor(tile, option);
		marker.component = option.type === 'monastery'
			? { type: 'monastery', features: [{ tile, index: 0 }] }
			: option.type === 'field'
				? { type: 'field', scoreFields: true, features: engine.state.board.fieldScoreComponent(tile, option.index).features }
				: { type: option.type, features: engine.state.board.component(tile, option.type, option.index).features };
		return marker;
	});
}
function placedMeeples(entries = engine.state.meeples, historical = null) {
	return Object.entries(entries).map(([reference, playerId]) => {
		const [tileId, type, index] = reference.split(':');
		const tile = engine.state.board.getTile(tileId),
			marker = markerFor(tile, { type, index: Number(index) });
		return {
			...marker,
			opacity: historical && historical[reference] !== playerId ? .18 : 1,
			playerIndex: engine.state.players.findIndex((player) => player.id === playerId),
		};
	});
}
function terrainStateSignature(tile) {
	// 地形の半回転が対称なカードでは、候補上は normal / halfTurn の2状態が
	// あっても実際の地形・特徴領域は変わらない。その場合は切替操作を出さない。
	return JSON.stringify({
		edgeTerrain: tile.edgeTerrain,
		featureGroups: tile.featureGroups,
		roadTerminals: tile.roadTerminals,
		fieldScoreGroups: tile.fieldScoreGroups,
		featureAnchors: tile.featureAnchors,
	});
}
function provisionalPatternVariants() {
	if (!provisional) return [];
	// 同じ盤面上の中心を共有する候補には、物理的な180度回転、地形の180度回転、
	// 左右反転とその組合せが含まれる。同じ見た目の辺記号パターン差や、
	// 対称な地形の normal / halfTurn は1状態へ畳み、右クリック1回で
	// 実際に見えるパターンが変わるようにする。
	const unique = new Map();
	for (const candidate of selectedTileCandidates()) {
		if (Math.hypot(candidate.centerX - provisional.centerX, candidate.centerY - provisional.centerY) >= 1e-3) continue;
		if (!unique.has(patternCycleKey(candidate))) unique.set(patternCycleKey(candidate), candidate);
	}
	return [...unique.values()];
}
function patternCycleKey(tile) {
	const full = Math.PI * 2;
	const rotation = ((tile.rotation || 0) % full + full) % full;
	return `${Math.round(rotation * 1e5)}:${tile.mirrored ? 'mirror' : 'normal'}:${terrainStateSignature(tile)}`;
}
function cycleProvisionalPattern() {
	if (isCpuTurn()) return;
	const variants = provisionalPatternVariants();
	if (variants.length < 2) return;
	stopPreviewDrop();
	const current = variants.findIndex((candidate) => patternCycleKey(candidate) === patternCycleKey(provisional));
	provisional = variants[(current + 1 + variants.length) % variants.length];
	render();
}
function renderMeepleOptions() {
	el.options.replaceChildren();
	if (engine.state.phase !== 'placeMeeple') return;
	for (const option of engine.meepleOptions()) {
		const button = document.createElement('button');
		button.textContent = t('feature.place', { feature: t(`feature.${option.type}`) });
		button.disabled = isCpuTurn();
		button.onclick = () => placeMeeple(option);
		el.options.append(button);
	}
}
function meepleCounter(count, playerIndex, { compact = false } = {}) {
	const counter = document.createElement('span');
	counter.className = `meeple-counter${compact ? ' compact' : ''}`;
	for (let index = 0; index < count; index++) {
		const icon = document.createElement('span');
		icon.className = 'meeple-reserve-icon';
		icon.style.setProperty('--meeple-icon', `url("${meepleAssetForPlayer('reserve', playerIndex)}")`);
		counter.append(icon);
	}
	return counter;
}
let openTitlePopover = null;
function positionTitlePopover() {
	const bubble = el.titleStatus.querySelector('.title-popover:not(.hidden)');
	if (!bubble) return;
	bubble.classList.toggle('title-popover-raised', logOpen);
	bubble.style.setProperty('--popover-shift', '0px');
	const bounds = bubble.getBoundingClientRect();
	let minLeft = 12, maxRight = window.innerWidth - 12;
	if (!logOpen) for (const box of el.scores.querySelectorAll('.player-box')) {
		const rect = box.getBoundingClientRect();
		if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
		if ((rect.left + rect.right) / 2 < window.innerWidth / 2) minLeft = Math.max(minLeft, rect.right + 12);
		else maxRight = Math.min(maxRight, rect.left - 12);
	}
	if (maxRight - minLeft < bounds.width) { minLeft = 12; maxRight = window.innerWidth - 12; }
	const shift = Math.max(minLeft, Math.min(bounds.left, maxRight - bounds.width)) - bounds.left;
	bubble.style.setProperty('--popover-shift', `${shift}px`);
}
function setTitlePopover(id) {
	openTitlePopover = id;
	for (const item of el.titleStatus.querySelectorAll('.title-item')) {
		const open = item.dataset.titleId === id;
		item.querySelector('.title-popover').classList.toggle('hidden', !open);
		item.querySelector('.title-icon-button').setAttribute('aria-expanded', String(open));
	}
	positionTitlePopover();
}
function renderTitleStatus() {
	const leaders = provisionalTitleLeaders(engine.state, engine.titleRules);
	el.titleStatus.classList.toggle('hidden', leaders.length === 0);
	if (!leaders.some(({ id }) => id === openTitlePopover)) openTitlePopover = null;
	el.titleStatus.replaceChildren();
	for (const { id, playerIds } of leaders) {
		const item = document.createElement('div');
		item.className = 'title-item';
		item.dataset.titleId = id;
		const button = document.createElement('button');
		button.className = 'title-icon-button';
		button.type = 'button';
		button.setAttribute('aria-label', t(`title.${id}`));
		button.setAttribute('aria-expanded', String(openTitlePopover === id));
		const icon = document.createElement('img');
		icon.src = `assets/icons/title-${id.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}.svg`;
		icon.alt = '';
		icon.setAttribute('aria-hidden', 'true');
		button.append(icon);
		button.onclick = () => setTitlePopover(openTitlePopover === id ? null : id);
		const scores = document.createElement('div');
		scores.className = 'title-leaders';
		for (const playerId of playerIds) {
			const index = engine.state.players.findIndex(player => player.id === playerId);
			if (index < 0) continue;
			const bonus = document.createElement('span');
			bonus.textContent = '+10';
			bonus.style.color = playerColor(index);
			bonus.setAttribute('aria-label', t('title.provisional', { player: displayPlayerName(engine.state.players[index]) }));
			scores.append(bonus);
		}
		const bubble = document.createElement('div');
		bubble.className = `title-popover${openTitlePopover === id ? '' : ' hidden'}`;
		bubble.setAttribute('role', 'note');
		const name = document.createElement('strong');
		name.textContent = t(`title.${id}`);
		const description = document.createElement('p');
		description.textContent = t(`title.${id}Description`);
		const bonus = document.createElement('p');
		bonus.className = 'title-popover-bonus';
		bonus.textContent = t('title.endBonus');
		bubble.append(name, description, bonus);
		item.append(button, scores, bubble);
		el.titleStatus.append(item);
	}
	positionTitlePopover();
}
function renderScores() {
	prepareLiveScoreAnimations();
	el.scores.replaceChildren();
	scoreElements = new Map();
	crownElements = new Map();
	engine.state.players.forEach((player, index) => {
		const row = document.createElement('div'),
			name = document.createElement('span'),
			identity = document.createElement('div'),
			score = document.createElement('strong'),
			meeples = document.createElement('small'),
			chips = document.createElement('small'),
			supports = document.createElement('small'),
			scoreSummary = document.createElement('small');
		row.className = `player-box${!engine.state.finished && index === engine.state.turn ? ' active-player-box' : ''}`;
		row.style.setProperty('--player-color', playerColor(index));
		identity.className = 'player-identity';
		name.textContent = displayPlayerName(player);
		identity.append(name);
		const rank = finalScoreReveal?.ranks.get(player.id);
		if (engine.state.finished && rank) {
			const crown = document.createElement('img');
			crown.className = `player-crown${finalScoreReveal.unlocked.has(player.id) ? '' : ' hidden'}`;
			crown.src = `assets/icons/crown-${rank}.svg`;
			crown.alt = '';
			crown.setAttribute('aria-hidden', 'true');
			identity.append(crown);
			crownElements.set(player.id, crown);
		}
		score.className = 'player-score-value';
		score.textContent = displayedScores.get(player.id) ?? player.score;
		scoreElements.set(player.id, score);
		meeples.className = 'player-meeple-count';
		meeples.setAttribute('aria-label', `${t('player.meeples')}: ${player.meeples}`);
		meeples.append(meepleCounter(player.meeples, index, { compact: true }));
		chips.textContent = t('player.vertexCompletions', { count: player.vertexCompletions });
		chips.className = `chip-counts${engine.titleRules.vertexKing ? '' : ' hidden'}`;
		supports.textContent = t('player.supportCount', { count: player.supportCount });
		supports.className = `support-counts${engine.titleRules.supportKing ? '' : ' hidden'}`;
		scoreSummary.className = `player-score-summary${engine.state.finished && finalScoreReveal && !finalScoreReveal.active && !replay ? '' : ' hidden'}`;
		const completedTotal = engine.state.scoreEvents.filter(event => event.playerId === player.id && event.reason === 'complete').reduce((sum, event) => sum + event.points, 0);
		const endTotal = engine.state.scoreEvents.filter(event => event.playerId === player.id && event.reason === 'end').reduce((sum, event) => sum + event.points, 0);
		const titleTotal = engine.state.scoreEvents.filter(event => event.playerId === player.id && event.reason === 'title').reduce((sum, event) => sum + event.points, 0);
		const summaryItems = [['score.completeShort', String(completedTotal)], ['score.endShort', `+${endTotal}`]];
		if (titleTotal) summaryItems.push(['score.titleShort', `+${titleTotal}`]);
		for (const [key, value] of summaryItems) {
			const item = document.createElement('span'), label = document.createElement('small'), number = document.createElement('strong');
			label.textContent = t(key); number.textContent = value; item.append(label, number); scoreSummary.append(item);
		}
		row.append(identity, score, meeples, chips, supports, scoreSummary);
		row.onpointerenter = () => {
			hoveredPlayerIndex = index;
			view.highlightPlayerIndex = index;
			view.render();
		};
		row.onpointerleave = () => {
			hoveredPlayerIndex = null;
			view.highlightPlayerIndex = engine.state.phase === 'placeTile' ? engine.state.turn : null;
			view.render();
		};
		el.scores.append(row);
	});
	el.finalScoreDetails.replaceChildren();
	el.finalScoreDetails.classList.toggle('hidden', !engine.state.finished || !logOpen || Boolean(replay) || finalScoreReveal?.active || finalPanelMode !== 'scores');
	if (!engine.state.finished) return;
	engine.state.players.forEach((player, index) => {
		const section = document.createElement('section'), list = document.createElement('ul'), events = engine.state.scoreEvents.filter((event) => event.playerId === player.id);
		section.className = 'final-player-result';
		section.dataset.playerIndex = String(index);
		section.style.setProperty('--player-color', playerColor(index));
		if (!events.length) {
			const item = document.createElement('li'); item.textContent = t('score.none'); list.append(item);
		}
		events.forEach((event) => {
			const item = document.createElement('li'), label = document.createElement('span'), points = document.createElement('strong');
			label.textContent = event.reason === 'title'
				? t('score.titleEvent', { title: t(`title.${event.titleId}`) })
				: t('score.event', { reason: t(event.reason === 'end' ? 'score.end' : 'score.complete'), feature: t(`feature.${event.type}`) });
			points.textContent = `+${event.points}`;
			item.append(label, points); list.append(item);
		});
		section.append(list);
		el.finalScoreDetails.append(section);
	});
}
function renderFinalLogSections() {
	const finished = engine.state.finished && !replay;
	el.logTitle.classList.toggle('hidden', finished);
	el.logSectionToggle.classList.toggle('hidden', !finished);
	el.scoreSectionToggle.classList.toggle('hidden', !finished || finalScoreReveal?.active);
	if (!finished) {
		el.logSection.classList.remove('hidden');
		el.finalScoreDetails.classList.add('hidden');
		return;
	}
	const showingLog = finalPanelMode === 'log';
	const showingScores = finalPanelMode === 'scores';
	el.logSectionToggle.textContent = `${showingLog ? '▼' : '▶'} ${t('log.title')}`;
	el.scoreSectionToggle.textContent = `${showingScores ? '▼' : '▶'} ${t('score.details')}`;
	el.logSectionToggle.setAttribute('aria-expanded', String(logOpen && showingLog));
	el.scoreSectionToggle.setAttribute('aria-expanded', String(logOpen && showingScores));
	el.logSection.classList.toggle('hidden', !logOpen || !showingLog);
	el.finalScoreDetails.classList.toggle('hidden', !logOpen || !showingScores || finalScoreReveal?.active);
}
function displayPlayerName(player) {
	const match = /^Player (\d+)$/.exec(player.name);
	return match ? t('game.player', { number: match[1] }) : player.name;
}
function renderPlacementActions() {
	const tile = provisional || (engine.state.phase === 'placeMeeple' ? engine.state.currentTile : null);
	if (!tile || engine.state.finished || tileMotion?.busy || isCpuTurn()) {
		el.placementActions.classList.add('hidden');
		return;
	}
	const point = view.screenFromWorldPoint({ x: tile.centerX, y: tile.centerY + side * .82 });
	const variants = engine.state.phase === 'placeTile' ? provisionalPatternVariants() : [];
	const currentVariant = variants.findIndex((candidate) => patternCycleKey(candidate) === patternCycleKey(provisional));
	el.placementActions.style.left = `${point.x}px`;
	el.placementActions.style.top = `${point.y}px`;
	el.placementActions.classList.remove('hidden');
	const canCycle = engine.state.phase === 'placeTile' && variants.length > 1;
	el.patternCycle.classList.toggle('hidden', !canCycle);
	if (canCycle) {
		const number = Math.max(0, currentVariant) + 1;
		const label = t('board.cyclePlacement', { number, total: variants.length });
		el.patternCycle.textContent = `${number}/${variants.length}`;
		el.patternCycle.setAttribute('aria-label', label);
		el.patternCycle.title = label;
	}
	el.confirm.classList.toggle('hidden', engine.state.phase !== 'placeTile');
	el.skip.classList.toggle('hidden', engine.state.phase !== 'placeMeeple');
	el.confirm.disabled = !provisional || isCpuTurn();
	el.skip.disabled = engine.state.phase !== 'placeMeeple' || isCpuTurn();
	el.patternCycle.disabled = !canCycle || isCpuTurn();
	// 仮置きタイルの下に固定する。画面端では盤外へ出ても別位置へ逃がさない。
	el.placementActions.style.left = `${point.x}px`;
	el.placementActions.style.top = `${point.y}px`;
}
function render() {
	if (engine.state.finished && replayedEngine !== engine) startReplay();
	const { state } = engine,
		player = engine.activePlayer,
		searchPending = structuralSearchPending && state.phase === 'placeTile';
	const logToggle=document.querySelector('#toggle-log'), logToggleLabel=t(logOpen?'log.close':'log.open');
	logToggle.setAttribute('aria-expanded',String(logOpen));
	logToggle.setAttribute('aria-label',logToggleLabel);
	logToggle.title=logToggleLabel;
	el.currentHand.dataset.playerIndex = String(state.turn);
	const table=document.querySelector('.game-table');
	table.classList.toggle('game-finished', state.finished);
	table.classList.toggle('private-planning',engine.privatePlanning);
	updatePublicHandLayout();
	const handTile = !engine.privatePlanning && !state.finished && state.phase === 'placeTile' && !provisional && !tileMotion?.busy ? state.currentTile : null;
	el.currentHand.classList.toggle('hidden', !handTile || Boolean(replay));
	if (handTile && view) {
		const ctx = el.currentTile.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, el.currentTile.width, el.currentTile.height);
		const rect = el.currentTile.getBoundingClientRect();
		ctx.setTransform(el.currentTile.width / Math.max(1, rect.width), 0, 0, el.currentTile.height / Math.max(1, rect.height), 0, 0);
		const displayTile = handDisplayTile(handTile);
		const layout = handTileLayout(displayTile, rect.width, rect.height);
		view.drawTileAtScreen(ctx, displayTile, layout.x, layout.y, layout.side);
	}
	el.activeLabel.textContent = state.finished ? t('game.over') : t('game.playerShort', { number: state.turn + 1 });
	el.replayButton.classList.toggle('hidden', !state.finished || Boolean(replay) || !replayComplete);
	el.replayButton.disabled = Boolean(replay);
	el.heading.textContent = state.finished
		? t('game.finished')
		: state.phase === 'placeMeeple'
			? t('game.placeMeeple')
			: t('game.turn', { player: displayPlayerName(player) });
	if(engine.privatePlanning && !state.finished && state.phase==='placeTile' && !searchPending && !candidates.length && state.deck.length) el.heading.textContent=t('hand.redrawNeeded');
	updateSearchStatus();
	el.thin.textContent = state.deck.filter((tile) => tile.shape === 'thin').length;
	el.fat.textContent = state.deck.filter((tile) => tile.shape === 'fat').length;
	el.redo.classList.toggle('hidden', !provisional || isCpuTurn());
	const noRegular = !searchPending && candidates.length === 0;
	el.redraw.disabled = searchPending || state.phase !== 'placeTile' || !state.deck.length || (!noRegular && player.redrawUsed) || Boolean(provisional) || isCpuTurn();
	el.redraw.textContent = t('ui.redraw');
	el.redraw.title = t(noRegular ? 'tile.redrawNoCandidate' : 'tile.redraw');
	el.redraw.classList.toggle('hidden', state.phase !== 'placeTile' || Boolean(provisional));
	el.forceEnd.disabled = state.finished || searchPending;
	el.exportManualLog.disabled = !manualLogDecisions.some(decision => decision.completed);
	if (tileMotion?.busy) el.redraw.disabled = true;
	view.options.placed = state.board.tiles;
	const visibleCandidates = engine.privatePlanning && tileMotion?.active?.sourceTile
		? candidatesForHandTile(candidates,tileMotion.active.sourceTile) : candidates;
	view.options.candidates = state.phase === 'placeTile' ? engine.privatePlanning ? uniqueCandidatePositions(visibleCandidates) : allCandidates() : [];
	// ミープル配置中も、直前のタイル配置から導かれた確定配置は盤面情報として
	// 継続表示する。手札の通常候補だけをタイル配置フェーズ限定にする。
	view.options.structuralCandidates = (state.phase === 'placeTile' || state.phase === 'placeMeeple')
		? engine.deferCandidateSearch ? progressiveForcedCandidates : engine.structuralCandidates()
		: [];
	view.candidatesVisible = true;
	view.previewTile = provisional;
	// 仮置きの外周と、確定直後のミープル候補を手番プレイヤーの色で示す。
	// ドラッグ中の自由プレビューは候補として未確定なので縁取りしない。
	view.previewOutlineColor = provisional ? playerColor(state.turn) : null;
	view.featureMarkers = meepleMarkers();
	view.featureMarkerPlayerIndex = state.turn;
	view.featureMarkerColor = state.phase === 'placeMeeple' ? playerColor(state.turn) : null;
	view.meeples = placedMeeples();
	view.highlightPlayerIndex = hoveredPlayerIndex ?? (state.phase === 'placeTile' ? state.turn : null);
	renderMeepleOptions();
	renderScores();
	publicHands.render({engine,view,scoreboard:el.scores,blocked:searchPending || Boolean(tileMotion?.busy) || !gameStarted || isCpuTurn(),provisional,heldTile:tileMotion?.active?.sourceTile,hidden:Boolean(replay) || state.finished});
	renderTitleStatus();
	renderLog();
	renderFinalLogSections();
	applyHistoryDisplay();
	el.scores.classList.toggle('hidden', Boolean(replay));
	if (replay) el.finalScoreDetails.classList.add('hidden');
	el.startDeck.disabled = Boolean(replay) || searchPending;
	view.render();
	renderPlacementActions();
	tileMotion?.draw();
}
function updatePublicHandLayout() {
	const handWidth=innerWidth<=800?228:240;
	const logWidth=logOpen?document.querySelector('#log-area').getBoundingClientRect().width+78:0;
	document.querySelector('.game-table').classList.toggle('public-hands-compact',engine.privatePlanning && (innerWidth-logWidth<handWidth*2+64 || innerHeight<630));
}
function logPlayerIndex(playerId) { return Math.max(0, engine.state.players.findIndex(player => player.id === playerId)); }
function logText(entry, displayNumber = entry.number) {
	const player = engine.state.players.find(p => p.id === entry.playerId), actions = [`${entry.tileShape === 'fat' ? 'FAT' : 'THIN'}${t('log.tile')}`];
	if (entry.placedMeeple) actions.push(t('log.meeple', { feature: t(`feature.${entry.placedMeeple.split(':')[1]}`) }));
	for (const score of entry.scores || []) if (score.reason !== 'end') actions.push(`${t('log.completed', { feature: t(`feature.${score.type}`)})} ${t('log.points', { points: score.points })}`);
	return `${displayNumber}. ${displayPlayerName(player)}: ${actions.join(' / ')}`;
}
function appendLogPlayerName(parent, playerId) {
	const player = engine.state.players.find(item => item.id === playerId), index = logPlayerIndex(playerId), name = document.createElement('span');
	name.className = 'log-player-name'; name.style.color = playerColor(index); name.textContent = displayPlayerName(player);
	parent.append(name);
}
function appendLogEntryContent(button, entry, displayNumber) {
	const playerIndex = logPlayerIndex(entry.playerId), player = engine.state.players[playerIndex];
	button.append(document.createTextNode(`${displayNumber}. `));
	appendLogPlayerName(button, entry.playerId);
	button.append(document.createTextNode(': '));
	const tileIcon = document.createElement('img');
	tileIcon.className = 'log-tile-icon'; tileIcon.src = `assets/icons/${entry.tileShape === 'fat' ? 'fat' : 'thin'}.svg`; tileIcon.alt = entry.tileShape === 'fat' ? 'FAT' : 'THIN';
	button.append(tileIcon, document.createTextNode(t('log.tile')));
	if (entry.placedMeeple) {
		const type = entry.placedMeeple.split(':')[1], icon = document.createElement('img');
		icon.className = 'log-meeple-icon'; icon.src = meepleAssetForPlayer(meepleKindForFeature(type), playerIndex); icon.alt = '';
		button.append(document.createTextNode(' / '), icon, document.createTextNode(t('log.meeple', { feature: t(`feature.${type}`) })));
	}
	const grouped = new Map();
	for (const score of entry.scores || []) {
		if (score.reason === 'end') continue;
		const key = `${score.tileId}:${score.type}:${score.reason}:${score.points}`;
		if (!grouped.has(key)) grouped.set(key, { ...score, playerIds: [] });
		grouped.get(key).playerIds.push(score.playerId);
	}
	for (const score of grouped.values()) {
		button.append(document.createTextNode(' / '), document.createTextNode(t('log.completed', { feature: t(`feature.${score.type}`) })));
		for (const playerId of score.playerIds) {
			const points = document.createElement('span');
			points.className = 'log-score-points'; points.style.color = playerColor(logPlayerIndex(playerId));
			points.textContent = t('log.points', { points: score.points }); button.append(points);
		}
	}
	button.setAttribute('aria-label', logText(entry, displayNumber));
}
function renderLog() {
	const entries = engine.state.turnHistory || [];
	const redrawLogEvents=engine.state.events.filter(event=>event.type==='redraw' || event.type==='pass').map(event=>({...event}));
	const signature = `${entries.length}:${redrawLogEvents.length}:${t('log.title')}:${Boolean(replay)}`;
	if (signature === logSignature) return;
	logSignature = signature;
	const list = document.querySelector('#play-log');
	const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 10;
	list.replaceChildren();
	let displayNumber = 1;
	const appendRedraws = beforeTurn => {
		for (const event of redrawLogEvents) {
			if (event.turnNumber !== beforeTurn || event.rendered) continue;
			const row = document.createElement('li'), message = document.createElement('span');
			row.className = 'log-redraw'; message.append(document.createTextNode(`${displayNumber++}. `));
			appendLogPlayerName(message, event.playerId); message.append(document.createTextNode(`: ${t(event.type==='pass'?'log.pass':'log.redraw')}`));
			row.append(message); list.append(row); event.rendered = true;
		}
	};
	redrawLogEvents.forEach(event => { event.rendered = false; });
	for (const entry of entries) {
		appendRedraws(entry.number);
		const row = document.createElement('li'), button = document.createElement('button');
		appendLogEntryContent(button, entry, displayNumber++);
		button.disabled = Boolean(replay);
		const show = () => { if (replay) return; historyHover = entry; applyHistoryDisplay(); view.render(); };
		const hide = () => { historyHover = null; applyHistoryDisplay(); view.render(); };
		button.onpointerenter = show; button.onpointerleave = hide;
		button.onfocus = show; button.onblur = hide;
		row.append(button); list.append(row);
	}
	for (const event of redrawLogEvents) {
		if (event.rendered) continue;
		const row = document.createElement('li'), message = document.createElement('span');
		row.className = 'log-redraw'; message.append(document.createTextNode(`${displayNumber++}. `));
		appendLogPlayerName(message, event.playerId); message.append(document.createTextNode(`: ${t(event.type==='pass'?'log.pass':'log.redraw')}`));
		row.append(message); list.append(row); event.rendered = true;
	}
	if (atBottom) list.scrollTop = list.scrollHeight;
}
function applyHistoryDisplay() {
	view.historyEntry = historyHover;
	view.historyColor = historyHover ? playerColor(engine.state.players.findIndex((p) => p.id === historyHover.playerId)) : null;
	if (replay) {
		view.options.placed = engine.state.board.tiles.slice(0, replay.tileCount);
		view.options.candidates = []; view.options.structuralCandidates = [];
		view.previewTile = null; view.featureMarkers = []; view.hoverMarker = null;
		view.meeples = placedMeeples(replay.meeples);
		view.highlightPlayerIndex = null;
	} else {
		const current = engine.state.finished ? engine.state.finalMeeples || engine.state.meeples : engine.state.meeples;
		view.options.placed = engine.state.board.tiles;
		view.meeples = historyHover
			? placedMeeples({ ...current, ...historyHover.meeples }, historyHover.meeples)
			: placedMeeples(current);
		view.highlightPlayerIndex = historyHover ? null : hoveredPlayerIndex ?? (engine.state.phase === 'placeTile' ? engine.state.turn : null);
	}
}
function startReplay() {
	if (!engine.state.finished || replay) return;
	clearTimeout(replayTimer);
	resetScorePresentation();
	replayedEngine = engine;
	replayComplete = false;
	historyHover = null;
	view.drag = null; view.pinch = null; view.touchPoints.clear();
	view.interactionLocked = true;
	view.replayTiles = engine.state.board.tiles;
	view.fitTiles(view.replayTiles);
	syncLogCameraOffset(true);
	replay = { tileCount: 1, meeples: {} };
	const frames = (engine.state.turnHistory || []).flatMap((entry) => [
		{ tileCount: entry.tileCount, meeples: entry.meeples },
		{ tileCount: entry.tileCount, meeples: entry.meeplesAfter },
	]);
	let index = 0;
	// 終局演出は操作待ちを作らず、長い対局でも約2.2秒以内に収める。
	const interval = Math.min(75, 2200 / Math.max(1, frames.length));
	const advance = () => {
		if (index < frames.length) replay = frames[index++];
		else {
			replay = null; replayTimer = null;
			replayComplete = true;
			view.interactionLocked = false; view.replayTiles = null;
			startFinalScoreReveal();
		}
		render();
		if (replay) replayTimer = setTimeout(advance, interval);
	};
	replayTimer = setTimeout(advance, 120);
}
function startSelectedDeck() {
	if (replay) return;
	cancelCpuTurn();
	pendingCpuMeeple = null;
	stopPreviewDrop();
	closeHandChoice();
	finalPanelMode = 'scores';
	tileMotion.cancel(true);
	gameStarted = true;
	showSettings(false);
	view.reset();
	logCameraOffset = 0;
	setPlayerMeepleColors(playerColorSettings.map((setting, index) => setting.color || selectedMeepleColor(index)));
	clearTimeout(replayTimer);
	historyHover = null; replayComplete = false; logSignature = '';
	gameRules.allowVerticalMatchingPattern = el.matchingPatternMode.checked;
	gameRules.allowTerrainHalfTurn = el.terrainPatternMode.checked;
	gameRules.allowTerrainMirror = el.terrainMirrorMode.checked;
	gameRules.ignoreMatchingRules = !el.matchingRuleMode.checked;
	const fieldScoring = el.fieldRuleMode.checked;
	const titles = Object.fromEntries([...titleRuleSettings].map(([id, toggle]) => [id, toggle.checked]));
	gameSeed = randomGameSeed();
	manualLogDecisions = []; pendingManualDecision = null;
	engine = new GameEngine({ playerCount: Number(el.playerCount.value) || 2, playerNames: configuredPlayerNames(), side, fieldScoring, deckType: el.deck.value, rules: gameRules, titles, deferCandidateSearch: true, handMode: el.handMode.value, random: seededRandom(gameSeed) });
	syncCpuPlayers();
	cpuCatalog = createPrototypeDeck(() => 0, el.deck.value);
	resetScorePresentation();
	provisional = null;
	resetProgressiveDisplay();
	refreshCandidates();
	view.fitTiles([...engine.state.board.tiles, ...candidates]);
	syncLogCameraOffset(true);
	render();
}
function placeMeeple(option) {
	if (engine.state.phase !== 'placeMeeple' || isCpuTurn()) return;
	engine.placeMeeple(option);
	completeManualPlacement(option);
	pendingCpuMeeple = null;
	provisional = null;
	refreshCandidates();
	render();
}
tileMotion = new TileDrag({
	view, overlay: document.querySelector('#held-tile'), hand: el.currentTile,
	getTile: () => engine.state.currentTile,
	getCandidates: tile => engine.privatePlanning ? candidatesForHandTile(candidates,tile) : candidates,
	canStart: () => gameStarted && !replay && !structuralSearchPending && !isCpuTurn() && engine.state.phase === 'placeTile',
	onPreview: tile => {
		stopPreviewDrop();
		provisional = tile;
		// ドラッグで複数種類が置ける候補へ着地した場合は、展開せず再表示ボタンだけ残す。
		if (!tile) closeHandChoice();
		else if (engine.privatePlanning && engine.state.phase === 'placeTile') {
			const choices=handChoicesAtPosition(candidates,tile);
			if (choices.length > 1) showCollapsedHandChoice(tile, choices);
		}
	},
	onChange: () => render(),
});
const settings = document.querySelector('#settings-screen');
function showSettings(show) {
	if (show) {
		refreshCpuGenerationOptions().catch(error => console.error('CPU generations could not be loaded', error));
		if (cpuTurnRunning) { stopPreviewDrop(); provisional = null; }
		cancelCpuTurn();
		tileMotion.cancel(true); closeHandChoice();
	}
	settings.classList.toggle('hidden', !show);
	for (const element of document.querySelector('.game-table').children) if (element !== settings && element !== confirmDialog) element.inert = show;
	view.interactionLocked = show || Boolean(replay);
	document.querySelector('#close-settings').classList.toggle('hidden', !gameStarted);
	if (show) el.player1Color.focus({ preventScroll: true });
	else document.querySelector('#open-settings').focus();
}
const confirmDialog = document.querySelector('#confirm-dialog');
let resolveConfirmDialog = null;
function showConfirmDialog({ title, message, confirmText = t('ui.continue'), cancelText = t('ui.cancel') }) {
	return new Promise(resolve => {
		resolveConfirmDialog = resolve;
		document.querySelector('#confirm-dialog-title').textContent = title;
		document.querySelector('#confirm-dialog-message').textContent = message;
		document.querySelector('#confirm-dialog-accept').textContent = confirmText;
		document.querySelector('#confirm-dialog-cancel').textContent = cancelText;
		confirmDialog.showModal();
	});
}
function closeConfirmDialog(accepted) {
	if (!confirmDialog.open) return;
	confirmDialog.close();
	const resolve = resolveConfirmDialog;
	resolveConfirmDialog = null;
	resolve?.(accepted);
}
document.querySelector('#confirm-dialog-accept').onclick = () => closeConfirmDialog(true);
document.querySelector('#confirm-dialog-cancel').onclick = () => closeConfirmDialog(false);
confirmDialog.addEventListener('cancel', event => { event.preventDefault(); closeConfirmDialog(false); });
function selectedColorsHaveDuplicates(count = Number(el.playerCount.value) || 2) {
	const colors = playerColorSettings.slice(0, count).map((setting, index) => setting.color || selectedMeepleColor(index));
	return new Set(colors).size !== colors.length;
}
async function confirmDuplicateColors(count) {
	if (!selectedColorsHaveDuplicates(count)) return true;
	return showConfirmDialog({ title: t('setup.duplicateColorsTitle'), message: t('setup.duplicateColorsMessage') });
}
async function resumeFromSettings() {
	if (gameStarted && !await confirmDuplicateColors(engine.state.players.length)) return;
	await refreshCpuGenerationOptions().catch(error => console.error('CPU generations could not be loaded', error));
	applyConfiguredPlayerNames();
	syncCpuPlayers();
	showSettings(false);
	render();
	maybeScheduleCpuTurn();
}
document.querySelector('#open-settings').onclick = () => showSettings(true);
document.querySelector('#close-settings').onclick = resumeFromSettings;
document.querySelector('#toggle-log').onclick = () => {
	const open = document.querySelector('#log-area').classList.toggle('hidden') === false;
	logOpen = open;
	document.querySelector('.game-table').classList.toggle('log-open', open);
	syncLogCameraOffset();
	render();
	window.setTimeout(positionTitlePopover, 180);
};
document.addEventListener('click', event => {
	if (!openTitlePopover || event.target.closest('.title-icon-button, .title-popover')) return;
	setTitlePopover(null);
});
document.addEventListener('click', event => {
	if (!event.target.closest('.meeple-color-picker')) closeMeepleColorMenus();
});
document.querySelector('#close-hand-choice').onclick=collapseHandChoice;
el.handChoiceTrigger.onclick=restoreHandChoice;
el.logSectionToggle.onclick = () => { finalPanelMode = finalPanelMode === 'log' ? 'none' : 'log'; renderScores(); renderFinalLogSections(); };
el.scoreSectionToggle.onclick = () => { finalPanelMode = finalPanelMode === 'scores' ? 'none' : 'scores'; renderScores(); renderFinalLogSections(); };
window.addEventListener('keydown', event => {
	if (event.key !== 'Escape') return;
	if (handChoicePosition) { collapseHandChoice(); return; }
	if (openTitlePopover) { setTitlePopover(null); return; }
	if (tileMotion.busy) tileMotion.cancel();
	else if (gameStarted && !settings.classList.contains('hidden')) resumeFromSettings();
	else if (provisional) { stopPreviewDrop(); provisional = null; render(); }
});
document.querySelector('#reset-view').onclick = () => { view.reset(); syncLogCameraOffset(true); };
window.addEventListener('resize', () => { syncLogCameraOffset(); render(); positionTitlePopover(); });
setupRadio('language-choices', language());
el.languageChoices.addEventListener('change', event => {
	if (event.target.name === 'setup-language') setLanguage(event.target.value);
});
document.querySelector('#player-count-choices').addEventListener('change', event => {
	el.playerCount.value = event.target.value;
	updatePlayerCountSettings();
});
document.querySelector('#basic-rule-choices').addEventListener('change', event => applyRulePreset(event.target.value));
document.querySelector('#deck-choices').addEventListener('change', event => {
	el.deck.value = event.target.value;
	updateSetupStatus();
});
document.querySelector('#hand-mode-choices').addEventListener('change', event => {
	el.handMode.value = event.target.value;
	updateSetupStatus();
});
document.querySelectorAll('.setup-switch input').forEach(input => input.addEventListener('change', updateSetupStatus));
const customRulesToggle = document.querySelector('#custom-rules-toggle');
const customRulesContent = document.querySelector('#custom-rules-content');
customRulesToggle.onclick = () => {
	const expanded = customRulesToggle.getAttribute('aria-expanded') !== 'true';
	customRulesToggle.setAttribute('aria-expanded', String(expanded));
	customRulesContent.setAttribute('aria-hidden', String(!expanded));
	customRulesContent.classList.toggle('is-open', expanded);
	customRulesContent.inert = !expanded;
};
applyTranslations();
syncDefaultPlayerNames();
updateSetupStatus();
window.addEventListener('penrosanne-language-change', () => {
	refreshCpuGenerationOptions().catch(error => console.error('CPU generations could not be loaded', error));
	setupRadio('language-choices', language());
	syncDefaultPlayerNames();
	renderDeckOptions();
	renderMeepleColorOptions();
	updateSetupStatus();
	render();
});
el.theme.onchange = (event) => tileTheme.setTheme(event.target.value);
el.cpuGeneration.onchange = () => { applyCpuGenerationSelection().catch(error => console.error('CPU selection failed', error)); };
cpuRecordSelect.onchange = () => { applyCpuGenerationSelection().catch(error => console.error('CPU generation selection failed', error)); };
el.progressiveFrontier.onchange = () => {
	// 実行中の探索は中断せず、切替後のモードは次の候補探索から適用する。
	if (structuralSearchPending) return;
	refreshCandidates();
	render();
};
el.startDeck.onclick = async () => {
	if (!await confirmDuplicateColors()) return;
	await refreshCpuGenerationOptions().catch(error => console.error('CPU generations could not be loaded', error));
	startSelectedDeck();
};
playerColorSettings.forEach(({ button, name }, index) => {
	button.onclick = () => toggleMeepleColorMenu(index);
	name.oninput = () => {
		name.dataset.defaultName = 'false';
		name.value = [...name.value].slice(0, Number(name.maxLength)).join('');
	};
});
el.playerCount.onchange = updatePlayerCountSettings;
el.replayButton.onclick = () => { tileMotion.cancel(true); startReplay(); render(); };
el.redo.onclick = () => {
	if (isCpuTurn()) return;
	closeHandChoice();
	stopPreviewDrop();
	provisional = null;
	render();
};
el.patternCycle.onclick = cycleProvisionalPattern;
el.confirm.onclick = () => {
	if (!provisional || isCpuTurn()) return;
	stopPreviewDrop();
	const { _candidateKey, ...placement } = provisional;
	// 確定枠の位置へ実タイルを置いた場合は、その枠だけを盤面表示から外す。
	// ほかの既知の確定配置はそのまま残るため、追加分のアニメーションは発生しない。
	removeProgressiveForcedCandidate(placement);
	recordManualPlacement(placement);
	engine.placeTile(placement);
	// ミープル候補がない場合、GameEngine.placeTile 内で手番まで完了するため、
	// ミープル選択イベントを待たずに手動ログも完了させる。
	if (engine.state.phase !== 'placeMeeple') completeManualPlacement(null);
	provisional = null;
	refreshCandidates();
	render();
};
el.skip.onclick = () => {
	if (isCpuTurn()) return;
	engine.skipMeeple();
	completeManualPlacement(null);
	pendingCpuMeeple = null;
	provisional = null;
	refreshCandidates();
	render();
};
function redrawHandTile(tileId) {
	if (structuralSearchPending || tileMotion?.busy || provisional || isCpuTurn()) return;
	engine.redrawCurrentTile(tileId);
	provisional = null;
	refreshCandidates();
	render();
}
el.redraw.onclick = () => redrawHandTile();
el.forceEnd.onclick = () => {
	cancelCpuTurn();
	pendingCpuMeeple = null;
	tileMotion.cancel(true);
	gameStarted = true;
	showSettings(false);
	engine.finishGame();
	completeManualPlacement(null);
	provisional = null;
	refreshCandidates();
	render();
};
el.exportManualLog.onclick = exportManualGameLog;
refreshCandidates();
render();
showSettings(true);

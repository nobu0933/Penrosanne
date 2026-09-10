import { edgeIndex, edgeVertexPairs, verticesFor } from './game/Tile.js';
import { GameEngine } from './game/GameEngine.js';
import { BoardView } from './ui/BoardView.js';
import { TileTheme } from './ui/TileTheme.js';
import { markerForFeature } from './ui/FeatureAnchors.js';
import { MEEPLE_ASSETS, playerColor } from './ui/MeepleAssets.js';
import { DECK_CONFIGS } from './game/TileSet.js';

const palette = {
	field: '#a9c579',
	road: '#c69b67',
	city: '#b55850',
	monastery: '#d9b462',
	white: '#fffdf7',
};
// 開始前設定画面ができるまでの、ルールをまとめた暫定設定値。
const gameRules = {
	allowVerticalMatchingPattern: true,
};
const side = Math.round(window.innerHeight / 5);
let engine = new GameEngine({ playerCount: 2, side, fieldScoring: true, rules: gameRules });
let showVertices = true,
	candidates = [],
	provisional = null,
	dragPreview = null,
	tileDragging = false,
	hoveredPlayerIndex = null;
const el = {
	board: document.querySelector('#board'),
	current: document.querySelector('#current-tile'),
	activeLabel: document.querySelector('#active-player-label'),
	heading: document.querySelector('#turn-heading'),
	score: document.querySelector('.score-row strong'),
	meeples: document.querySelector('#meeple-count'),
	tileLabel: document.querySelector('#tile-label'),
	thin: document.querySelector('#thin-count'),
	fat: document.querySelector('#fat-count'),
	scores: document.querySelector('#scoreboard'),
	finalScoreDetails: document.querySelector('#final-score-details'),
	confirm: document.querySelector('#confirm-placement'),
	skip: document.querySelector('#skip-meeple'),
	options: document.querySelector('#meeple-options'),
	rotate: document.querySelector('#rotate-tile'),
	redo: document.querySelector('#redo-tile'),
	forceEnd: document.querySelector('#force-end'),
	redraw: document.querySelector('#redraw-tile'),
	mirror: document.querySelector('#mirror-tile'),
	placementActions: document.querySelector('#placement-actions'),
	theme: document.querySelector('#theme-select'),
	deck: document.querySelector('#deck-select'),
	matchingPatternMode: document.querySelector('#matching-pattern-mode-select'),
	startDeck: document.querySelector('#start-deck'),
};
for (const deck of DECK_CONFIGS) {
	const option = document.createElement('option');
	option.value = deck.id;
	option.textContent = deck.label + ' — ' + deck.description;
	if (deck.id === engine.deckType) option.selected = true;
	el.deck.append(option);
}
let view;
const tileTheme = new TileTheme({
	onChange: () => {
		view?.render();
		drawTilePreview(engine.state.phase === 'placeTile' ? engine.state.currentTile : null);
	},
});
view = new BoardView(el.board, {
	side,
	placed: engine.state.board.tiles,
	candidates: [],
	structuralCandidates: [],
	showVertices: () => showVertices,
	onFeatureSelect: (marker) => placeMeeple(marker.option),
	onPreviewDragStart: (event) => {
		if (!provisional) return;
		provisional = null;
		tileDragging = true;
		updateTileDrag(event);
	},
	onSelect: (tile) => {
		if (engine.state.phase !== 'placeTile') return;
		provisional = tile;
		dragPreview = null;
		render();
	},
	tileTheme,
});

function displayCandidates() {
	return engine.candidates().map((tile, index) => ({ ...tile, _candidateKey: `regular:${tile.id}:${index}` }));
}
function refreshCandidates() {
	candidates = engine.state.phase === 'placeTile' ? displayCandidates() : [];
}
function allCandidates() { return candidates; }
function drawTilePreview(tile) {
	const ctx = el.current.getContext('2d');
	ctx.clearRect(0, 0, 220, 180);
	if (!tile) return;
	const preview = { ...tile, centerX: 110, centerY: 90 },
		points = verticesFor(preview, 65),
		ids = Object.keys(points),
		pairs = edgeVertexPairs(preview.shape);
	ctx.beginPath();
	ids.forEach((id, index) => {
		const point = points[id];
		index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
	});
	ctx.closePath();
	ctx.fillStyle = palette.field;
	ctx.fill();
	ctx.strokeStyle = '#425e50';
	ctx.lineWidth = 3;
	ctx.stroke();
	(preview.featureGroups?.field || []).forEach((_, index) => tileTheme.draw(ctx, preview, 'field', index, 65));
	(preview.featureGroups?.road || []).forEach((group, roadIndex) => {
		if (tileTheme.draw(ctx, preview, 'road', roadIndex, 65)) return;
		(group || []).map(edgeIndex).filter((edge) => edge >= 0).forEach((edge) => {
			const [a, b] = pairs[edge], middle = { x: (points[a].x + points[b].x) / 2, y: (points[a].y + points[b].y) / 2 };
			ctx.beginPath(); ctx.moveTo(110, 90); ctx.lineTo(middle.x, middle.y);
			ctx.strokeStyle = palette.road; ctx.lineWidth = 14; ctx.stroke();
			ctx.strokeStyle = '#745536'; ctx.lineWidth = 2; ctx.stroke();
		});
	});
	(preview.featureGroups?.city || []).forEach((group, cityIndex) => {
		if (tileTheme.draw(ctx, preview, 'city', cityIndex, 65)) return;
		const edges = group.map(edgeIndex).filter((edge) => edge >= 0), connectedRoad = Object.values(preview.roadTerminals || {}).some((terminals) => terminals.some((terminal) => terminal.kind === 'city' && terminal.cityGroup === cityIndex)), innerPoints = [];
		if (edges.length === 4) {
			ctx.beginPath(); Object.values(points).forEach((point, pointIndex) => pointIndex ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); ctx.fillStyle = palette.city; ctx.fill(); return;
		}
		edges.forEach((edge) => {
			const [a, b] = pairs[edge], midpoint = { x: (points[a].x + points[b].x) / 2, y: (points[a].y + points[b].y) / 2 }, amount = connectedRoad ? 1.52 : .62, control = { x: midpoint.x + (110 - midpoint.x) * amount, y: midpoint.y + (90 - midpoint.y) * amount };
			innerPoints.push({ x: midpoint.x + (110 - midpoint.x) * (connectedRoad ? .76 : .31), y: midpoint.y + (90 - midpoint.y) * (connectedRoad ? .76 : .31) });
			ctx.beginPath(); ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y); ctx.quadraticCurveTo(control.x, control.y, points[a].x, points[a].y); ctx.closePath(); ctx.fillStyle = palette.city; ctx.fill(); ctx.strokeStyle = '#813f3a'; ctx.lineWidth = 1.5; ctx.stroke();
		});
		if (innerPoints.length > 1) { ctx.beginPath(); ctx.moveTo(innerPoints[0].x, innerPoints[0].y); innerPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.strokeStyle = palette.city; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.stroke(); }
	});
	if (Object.values(preview.roadTerminals || {}).some((terminals) => terminals.some((terminal) => terminal.kind === 'intersection')) && !tileTheme.draw(ctx, preview, 'intersection', 0, 65)) {
		ctx.beginPath(); ctx.arc(110, 90, 7, 0, Math.PI * 2); ctx.fillStyle = palette.field; ctx.fill(); ctx.strokeStyle = '#745536'; ctx.lineWidth = 2; ctx.stroke();
	}
	if (preview.hasMonastery) {
		if (!tileTheme.draw(ctx, preview, 'monastery', 0, 65)) {
			ctx.beginPath();
			ctx.arc(110, 90, 15, 0, Math.PI * 2);
			ctx.fillStyle = palette.monastery;
			ctx.fill();
			ctx.strokeStyle = '#8d6e38';
			ctx.lineWidth = 2;
			ctx.stroke();
		}
	}
	Object.values(points).forEach((point) => {
		ctx.beginPath();
		ctx.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
		ctx.fillStyle = palette.white;
		ctx.fill();
		ctx.strokeStyle = '#34453e';
		ctx.lineWidth = 1;
		ctx.stroke();
	});
}
function markerFor(tile, option) {
	return markerForFeature(tile, option, side);
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
function placedMeeples() {
	return Object.entries(engine.state.meeples).map(([reference, playerId]) => {
		const [tileId, type, index] = reference.split(':');
		const tile = engine.state.board.getTile(tileId),
			marker = markerFor(tile, { type, index: Number(index) });
		return {
			...marker,
			playerIndex: engine.state.players.findIndex((player) => player.id === playerId),
		};
	});
}
function alternatePlacement() {
	if (!provisional) return null;
	return allCandidates().find(
		(candidate) =>
			Math.hypot(candidate.centerX - provisional.centerX, candidate.centerY - provisional.centerY) <
				1e-4 && Math.abs(Math.abs(candidate.rotation - provisional.rotation) - Math.PI) < 1e-4,
	);
}
function renderMeepleOptions() {
	el.options.replaceChildren();
	if (engine.state.phase !== 'placeMeeple') return;
	for (const option of engine.meepleOptions()) {
		const button = document.createElement('button');
		button.textContent = `${{ city: '都市', road: '道', field: '草原', monastery: '修道院' }[option.type]} に置く`;
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
		icon.style.setProperty('--meeple-color', playerColor(playerIndex));
		icon.style.setProperty('--meeple-icon', `url("${MEEPLE_ASSETS.reserve}")`);
		counter.append(icon);
	}
	return counter;
}
function renderScores() {
	el.scores.replaceChildren();
	engine.state.players.forEach((player, index) => {
		const row = document.createElement('div'),
			name = document.createElement('span'),
			score = document.createElement('strong'),
			meeples = document.createElement('small'),
			chips = document.createElement('small');
		row.className = `player-box${!engine.state.finished && index === engine.state.turn ? ' active-player-box' : ''}`;
		name.textContent = player.name;
		score.textContent = player.score;
		meeples.className = 'player-meeple-count';
		meeples.append('ミープル ', meepleCounter(player.meeples, index, { compact: true }));
		chips.textContent = `頂点チップ ${player.vertexChips}`;
		chips.className = 'chip-counts';
		row.append(name, score, meeples, chips);
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
	el.finalScoreDetails.classList.toggle('hidden', !engine.state.finished);
	if (!engine.state.finished) return;
	const labels = { city: '都市', road: '道', monastery: '修道院', field: '草原' };
	engine.state.players.forEach((player) => {
		const title = document.createElement('h3'), list = document.createElement('ul'), events = engine.state.scoreEvents.filter((event) => event.playerId === player.id);
		title.textContent = `${player.name}　合計 ${player.score}点`;
		if (!events.length) {
			const item = document.createElement('li'); item.textContent = '得点なし'; list.append(item);
		}
		events.forEach((event) => {
			const item = document.createElement('li'), label = document.createElement('span'), points = document.createElement('strong');
			label.textContent = `${event.reason === 'end' ? '終局' : '完成'}：${labels[event.type]}`;
			points.textContent = `+${event.points}`;
			item.append(label, points); list.append(item);
		});
		el.finalScoreDetails.append(title, list);
	});
}
function renderPlacementActions() {
	const tile = provisional || (engine.state.phase === 'placeMeeple' ? engine.state.currentTile : null);
	if (!tile || engine.state.finished) {
		el.placementActions.classList.add('hidden');
		return;
	}
	const point = view.screenFromWorldPoint({ x: tile.centerX, y: tile.centerY + side * .82 });
	el.placementActions.style.left = `${point.x}px`;
	el.placementActions.style.top = `${point.y}px`;
	el.placementActions.classList.remove('hidden');
	el.rotate.classList.toggle('hidden', engine.state.phase !== 'placeTile' || !alternatePlacement());
	el.confirm.classList.toggle('hidden', engine.state.phase !== 'placeTile');
	el.skip.classList.toggle('hidden', engine.state.phase !== 'placeMeeple');
	el.confirm.disabled = !provisional;
	el.skip.disabled = engine.state.phase !== 'placeMeeple';
}
function render() {
	const { state } = engine,
		player = engine.activePlayer,
		handTile = state.phase === 'placeTile' ? state.currentTile : null;
	el.activeLabel.textContent = state.finished ? 'GAME OVER' : `PLAYER ${state.turn + 1}`;
	el.heading.textContent = state.finished
		? '対局終了'
		: state.phase === 'placeMeeple'
			? 'ミープルを置きますか？'
			: `${player.name} の手番`;
	el.score.textContent = player.score;
	el.meeples.replaceChildren(meepleCounter(player.meeples, state.turn));
	el.thin.textContent = state.deck.filter((tile) => tile.shape === 'thin').length;
	el.fat.textContent = state.deck.filter((tile) => tile.shape === 'fat').length;
	el.tileLabel.textContent = handTile
		? `${handTile.shape.toUpperCase()} · ${handTile.idPrefix.replaceAll('-', ' ')}`
		: state.finished
			? 'すべてのタイルを処理しました'
			: 'ミープルを配置してください';
	drawTilePreview(handTile);
	el.current.classList.toggle('hidden', Boolean(provisional) || state.phase !== 'placeTile');
	el.redo.classList.toggle('hidden', !provisional);
	const noRegular = engine.candidates().length === 0;
	el.redraw.disabled = state.phase !== 'placeTile' || (!noRegular && player.redrawUsed) || Boolean(provisional);
	el.redraw.textContent = noRegular ? '↺ 通常候補なし：引き直し' : '↺ 引き直し（1回）';
	el.redraw.classList.toggle('hidden', state.phase !== 'placeTile' || Boolean(provisional));
	el.mirror.disabled = state.phase !== 'placeTile' || player.mirrorUsed || Boolean(provisional);
	el.mirror.classList.toggle('hidden', state.phase !== 'placeTile' || Boolean(provisional));
	el.forceEnd.disabled = state.finished;
	view.options.placed = state.board.tiles;
	view.options.candidates = state.phase === 'placeTile' ? allCandidates() : [];
	view.options.structuralCandidates = state.phase === 'placeTile' ? engine.structuralCandidates() : [];
	view.candidatesVisible = true;
	view.previewTile = provisional || dragPreview;
	view.featureMarkers = meepleMarkers();
	view.meeples = placedMeeples();
	view.highlightPlayerIndex = hoveredPlayerIndex ?? (state.phase === 'placeTile' ? state.turn : null);
	renderMeepleOptions();
	renderScores();
	view.render();
	renderPlacementActions();
}
function startSelectedDeck() {
	gameRules.allowVerticalMatchingPattern = el.matchingPatternMode.value === 'both';
	engine = new GameEngine({ playerCount: 2, side, fieldScoring: true, deckType: el.deck.value, rules: gameRules });
	provisional = null;
	dragPreview = null;
	refreshCandidates();
	render();
}
function placeMeeple(option) {
	if (engine.state.phase !== 'placeMeeple') return;
	engine.placeMeeple(option);
	provisional = null;
	dragPreview = null;
	refreshCandidates();
	render();
}
function boardWorldPoint(event) {
	const rect = el.board.getBoundingClientRect();
	if (
		event.clientX < rect.left ||
		event.clientX > rect.right ||
		event.clientY < rect.top ||
		event.clientY > rect.bottom
	)
		return null;
	return view.worldPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top });
}
function updateTileDrag(event) {
	const world = boardWorldPoint(event);
	if (!world) {
		dragPreview = null;
		render();
		return null;
	}
	const near = allCandidates()
		.filter(
			(candidate) =>
				Math.hypot(candidate.centerX - world.x, candidate.centerY - world.y) < side * 0.65,
		)
		.sort(
			(a, b) =>
				Math.hypot(a.centerX - world.x, a.centerY - world.y) -
				Math.hypot(b.centerX - world.x, b.centerY - world.y),
		)[0];
	dragPreview = near || {
		...engine.state.currentTile,
		centerX: world.x,
		centerY: world.y,
	};
	view.previewTile = dragPreview;
	view.render();
	return near;
}
function finishTileDrag(event) {
	const snapped = updateTileDrag(event);
	tileDragging = false;
	dragPreview = null;
	if (snapped) {
		provisional = snapped;
	}
	render();
}
el.current.addEventListener('pointerdown', (event) => {
	if (engine.state.phase !== 'placeTile' || provisional) return;
	tileDragging = true;
	el.current.setPointerCapture(event.pointerId);
	event.preventDefault();
});
window.addEventListener('pointermove', (event) => {
	if (tileDragging) updateTileDrag(event);
});
window.addEventListener('pointerup', (event) => {
	if (tileDragging) finishTileDrag(event);
});
document.querySelector('#reset-view').onclick = () => view.reset();
document.querySelector('#vertex-toggle').onchange = (event) => {
	showVertices = event.target.checked;
	view.render();
};
el.theme.onchange = (event) => tileTheme.setTheme(event.target.value);
el.startDeck.onclick = startSelectedDeck;
el.redo.onclick = () => {
	provisional = null;
	render();
};
el.rotate.onclick = () => {
	const alternate = alternatePlacement();
	if (alternate) {
		provisional = alternate;
		render();
	}
};
el.confirm.onclick = () => {
	if (!provisional) return;
	const { _candidateKey, ...placement } = provisional;
	engine.placeTile(placement);
	provisional = null;
	dragPreview = null;
	refreshCandidates();
	render();
};
el.skip.onclick = () => {
	engine.skipMeeple();
	provisional = null;
	refreshCandidates();
	render();
};
el.redraw.onclick = () => {
	engine.redrawCurrentTile();
	provisional = null;
	dragPreview = null;
	refreshCandidates();
	render();
};
el.mirror.onclick = () => {
	engine.mirrorCurrentTile();
	provisional = null;
	dragPreview = null;
	refreshCandidates();
	render();
};
el.forceEnd.onclick = () => {
	engine.finishGame();
	provisional = null;
	dragPreview = null;
	refreshCandidates();
	render();
};
refreshCandidates();
render();

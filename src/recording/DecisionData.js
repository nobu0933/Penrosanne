import { Board } from '../game/Board.js';
import { edgesFor } from '../game/Tile.js';
import { isComplete, scoreFeature, scoreField } from '../game/Scoring.js';

export const RECORD_FORMAT = 'penrosanne-decision-record';
export const RECORD_VERSION = 2;
export const REASON_TAGS = Object.freeze([
	'妨害', '便乗', '略奪', '安定狙い', '逆転狙い', '完成狙い', '草原拡張',
	'草原閉鎖', 'ミープル温存', '頂点王', '山札の柔軟性', 'その他',
]);
export const FEATURE_FOCUS_TAGS = Object.freeze([
	'地形の接続', '完成見込み', 'THIN/FAT', '残り山札', '敵味方ミープル',
	'完成時の得点', '隣接辺の地形', '確定配置の境界', '草原の広がり', 'ミープル残数',
]);
export const CANDIDATE_RATINGS = Object.freeze([
	'unreviewed', 'runner-up', 'risky', 'bad', 'confident', 'uncertain', 'guess',
]);
const SELECTED_RATINGS = new Set(['confident', 'uncertain', 'guess']);

export function setAssessmentRating(assessments, key, rating) {
	if (!CANDIDATE_RATINGS.includes(rating) || !assessments[key]) throw new Error('評価対象または評価値が不正です。');
	if (SELECTED_RATINGS.has(rating)) for (const item of Object.values(assessments)) {
		if (item.id !== key && SELECTED_RATINGS.has(item.rating)) item.rating = 'unreviewed';
	}
	assessments[key].rating = rating;
	return assessments[key];
}

const round = (value) => Number(Number(value || 0).toFixed(5));
const tileKind = (tile) => `${tile.shape}:${tile.idPrefix}`;
const inventory = (tiles) => {
	const counts = {};
	for (const tile of tiles) counts[tileKind(tile)] = (counts[tileKind(tile)] || 0) + 1;
	return counts;
};

export function placementDescriptor(tile) {
	return {
		tileId: tile.id, kind: tile.idPrefix, shape: tile.shape,
		x: round(tile.centerX), y: round(tile.centerY), rotation: round(tile.rotation),
		matchingPattern: tile.matchingPattern ?? null,
		matchingPatternOptions: [...(tile.matchingPatternOptions || [])],
		terrainPattern: tile.terrainPattern || 'normal', mirrored: Boolean(tile.mirrored),
		edgeTerrain: { ...tile.edgeTerrain },
	};
}

export function captureDecisionContext(engine) {
	const { state } = engine;
	const shapeCounts = { thin: 0, fat: 0 };
	for (const tile of state.deck) shapeCounts[tile.shape]++;
	return structuredClone({
		turnNumber: state.recordTurnNumber ?? state.turnHistory.length + 1,
		activePlayerId: engine.activePlayer.id,
		phase: state.phase,
		boardTiles: state.board.tiles,
		players: state.players,
		meeples: state.meeples,
		currentTile: state.currentTile,
		hands: state.hands,
		remainingDeck: inventory(state.deck),
		remainingDeckCount: state.deck.length,
		remainingShapes: shapeCounts,
		discarded: inventory(state.discarded),
		scored: state.scored,
		rules: engine.rules,
		fieldScoring: engine.fieldScoring,
	});
}

function ownerCounts(engine, board, features, type) {
	const owners = Object.fromEntries(engine.state.players.map((player) => [player.id, 0]));
	for (const { tile, index } of features) {
		const owner = engine.state.meeples[board.featureRef(tile, type, index)];
		if (owner) owners[owner] = (owners[owner] || 0) + 1;
	}
	return owners;
}

function availableEdgeCopies(deck, terrain) {
	const counts = { thin: 0, fat: 0 };
	for (const tile of deck) if (Object.values(tile.edgeTerrain).includes(terrain)) counts[tile.shape]++;
	return counts;
}

function relatedTerrain(engine, preview, tile) {
	const result = [];
	const seen = new Set();
	for (const type of ['city', 'road', 'field']) {
		const groups = type === 'field' ? preview.fieldScoreGroups(tile) : (tile.featureGroups[type] || []);
		for (let index = 0; index < groups.length; index++) {
			const component = type === 'field' ? preview.fieldScoreComponent(tile, index) : preview.component(tile, type, index);
			if (seen.has(`${type}:${component.key}`)) continue;
			seen.add(`${type}:${component.key}`);
			const points = type === 'field' ? scoreField(preview, tile, index) : scoreFeature(preview, tile, type, index);
			const openEdges = type === 'field' ? [] : component.openEdges.map(({ tile: source, edge }) => ({
				sourceTileId: source.id, edge: edge.name, terrain: edge.terrain,
				// 地形だけの必要枚数上限。辺記号・頂点・重なりまで通る確率ではない。
				terrainCompatibleCopiesUpperBound: availableEdgeCopies(engine.state.deck, edge.terrain),
			}));
			const monasteryCount = type === 'field'
				? component.features.filter(({ tile: item }) => item.hasMonastery).length : 0;
			result.push({
				type, key: component.key, tileCount: new Set(component.features.map(({ tile: item }) => item.id)).size,
				owners: ownerCounts(engine, preview, component.features, type),
				currentPoints: points, openEdgeCount: openEdges.length,
				openEdges, monasteryCount, complete: type === 'field' ? null : isComplete(preview, tile, type, index),
			});
		}
	}
	if (tile.hasMonastery) result.push({
		type: 'monastery', key: `${tile.id}:monastery`, tileCount: 1,
		owners: { [engine.activePlayer.id]: 0 }, currentPoints: scoreFeature(preview, tile, 'monastery', 0),
		openEdgeCount: null, openEdges: [], complete: isComplete(preview, tile, 'monastery', 0),
	});
	return result;
}

export function describeTileCandidate(engine, candidate, index) {
	const board = engine.state.board;
	const preview = new Board(board.side);
	preview.tiles = [...board.tiles, candidate];
	const first = board.tiles[0];
	const players = engine.state.players;
	const opponents = players.filter((player) => player.id !== engine.activePlayer.id);
	const strongestOpponent = opponents.reduce((best, player) => !best || player.score > best.score ? player : best, null);
	const neighbors = edgesFor(candidate, board.side).flatMap((edge) => board.matchingEdges(edge).map(({ tile, edge: other }) => ({
		candidateEdge: edge.name, terrain: edge.terrain, neighborTileId: tile.id,
		neighborKind: tile.idPrefix, neighborEdge: other.name,
	})));
	return {
		id: `tile-${index}`, placement: placementDescriptor(candidate),
		features: {
			adjacentEdges: neighbors,
			adjacentEdgeCount: neighbors.length,
			terrain: relatedTerrain(engine, preview, candidate),
			activePlayerMeeples: engine.activePlayer.meeples,
			wouldUseLastMeeple: engine.activePlayer.meeples === 1,
			distanceFromFirstTile: first ? round(Math.hypot(candidate.centerX - first.centerX, candidate.centerY - first.centerY) / board.side) : 0,
			scoreLead: strongestOpponent ? engine.activePlayer.score - strongestOpponent.score : 0,
			vertexCompletionLead: strongestOpponent ? engine.activePlayer.vertexCompletions - strongestOpponent.vertexCompletions : 0,
			turnNumber: engine.state.recordTurnNumber ?? engine.state.turnHistory.length + 1,
			remainingDeckCount: engine.state.deck.length,
		},
		rating: 'unreviewed', reasons: [], note: '',
	};
}

export function createTileDecision(engine, candidates) {
	return {
		id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		kind: 'tile', context: captureDecisionContext(engine),
		candidates: candidates.map((candidate, index) => describeTileCandidate(engine, candidate, index)),
		chosenId: null, confidence: null, chosenReasons: [], note: '',
	};
}

export function createMeepleDecision(engine) {
	const tile = engine.state.board.getTile(engine.state.currentTile.id);
	const options = [{ type: 'skip', index: null }, ...engine.meepleOptions()];
	return {
		id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		kind: 'meeple', context: captureDecisionContext(engine),
		candidates: options.map((option, index) => {
			const component = option.type === 'skip' || option.type === 'monastery' ? null
				: option.type === 'field' ? engine.state.board.fieldScoreComponent(tile, option.index)
					: engine.state.board.component(tile, option.type, option.index);
			return {
				id: `meeple-${index}`, option,
				features: {
					remainingMeeplesAfter: engine.activePlayer.meeples - (option.type === 'skip' ? 0 : 1),
					wouldUseLastMeeple: option.type !== 'skip' && engine.activePlayer.meeples === 1,
					type: option.type,
					terrainTileCount: component?.features.length ?? (option.type === 'monastery' ? 1 : 0),
					openEdgeCount: component?.openEdges?.length ?? null,
					currentPoints: option.type === 'skip' ? 0 : option.type === 'field'
						? scoreField(engine.state.board, tile, option.index)
						: scoreFeature(engine.state.board, tile, option.type, option.index),
				},
				rating: 'unreviewed', reasons: [], note: '',
			};
		}),
		chosenId: null, confidence: null, chosenReasons: [], note: '',
	};
}

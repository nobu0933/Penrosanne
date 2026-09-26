import { Board } from '../game/Board.js';
import { featureCanReceiveMeeple } from '../game/Rules.js';
import { isComplete, scoreFeature, scoreField, vertexIsFullyTiled } from '../game/Scoring.js';
import { edgesFor, verticesFor } from '../game/Tile.js';
import { oneTileBridgeCopies, reachableTileCopies } from './TacticalSearch.js';

// すべて暫定値。山札や採点の定義ではなく、後のローカル対戦で調整する重み。
export const DEFAULT_CPU_WEIGHTS = Object.freeze({
	immediate: 0.636,
	future: 1.217,
	meepleCost: 1.1,
	fieldMeepleCost: 1.483,
	fieldFuture: 0.22,
	vertex: 0.571,
	obstruction: 0.28,
	poach: 0.826,
	poachProximity: 0.047,
	obstructionMobility: 0.55,
	poachBridge: 1.027,
});

const featureTypes = ['city', 'road'];
const terrainFeature = { C: 'city', R: 'road' };
const midpoint = edge => ({ x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 });
const principalOpponentId = (state, selfId) => state.players
	.filter(player => player.id !== selfId)
	.sort((a, b) => b.score - a.score)[0]?.id;

function componentOwners(board, state, component, type, addedMeeple = null) {
	const owners = new Map(state.players.map(player => [player.id, 0]));
	for (const { tile, index } of component.features) {
		const ref = board.featureRef(tile, type, index);
		const owner = ref === addedMeeple?.ref ? addedMeeple.playerId : state.meeples[ref];
		if (owner) owners.set(owner, (owners.get(owner) || 0) + 1);
	}
	return owners;
}

function ownershipDifference(owners, selfId, opponentId) {
	const self = owners.get(selfId) || 0, opponent = owners.get(opponentId) || 0;
	if (!self && !opponent) return 0;
	return Math.sign(self - opponent);
}

function featurePotential(board, tile, type, index, component, weights) {
	if (isComplete(board, tile, type, index)) return 0;
	const points = scoreFeature(board, tile, type, index) * (type === 'city' ? 1.6 : 1);
	return weights.future * points / (1 + component.openEdges.length * 0.6);
}

function collectOwnedComponents(board, state, opponentId) {
	const seen = new Set(), components = [];
	for (const [ref, owner] of Object.entries(state.meeples)) {
		if (owner !== opponentId) continue;
		const [tileId, type, indexText] = ref.split(':');
		if (!featureTypes.includes(type)) continue;
		const tile = board.getTile(tileId), index = Number(indexText);
		if (!tile || !Number.isInteger(index)) continue;
		const component = board.component(tile, type, index), key = `${type}:${component.key}`;
		if (seen.has(key) || !component.openEdges.length) continue;
		seen.add(key);
		components.push({ type, component, tile, index, points: scoreFeature(board, tile, type, index) });
	}
	return components;
}

function previewBoard(board, candidate) {
	const preview = new Board(board.side);
	preview.tiles = [...board.tiles, candidate];
	return preview;
}

function candidateMeepleOptions(preview, state, candidate, fieldScoring) {
	const options = [null];
	if (!state.players[state.turn].meeples) return options;
	for (const type of fieldScoring ? [...featureTypes, 'field'] : featureTypes)
		for (let index = 0; index < (candidate.featureGroups[type]?.length || 0); index++)
			if (featureCanReceiveMeeple(preview, state, candidate, type, index)) options.push({ type, index });
	if (candidate.hasMonastery) options.push({ type: 'monastery', index: 0 });
	return options;
}

function oldTouchingComponents(board, state, candidate, weights, selfId, opponentId) {
	const seen = new Set(), old = [];
	for (const edge of edgesFor(candidate, board.side)) {
		const type = terrainFeature[edge.terrain];
		if (!type) continue;
		for (const { tile, edge: neighborEdge } of board.matchingEdges(edge)) {
			const index = board.featureAtEdge(tile, type, neighborEdge.name);
			if (index < 0) continue;
			const component = board.component(tile, type, index), key = `${type}:${component.key}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const owners = componentOwners(board, state, component, type);
			old.push({ type, component, owners, potential: featurePotential(board, tile, type, index, component, weights) * ownershipDifference(owners, selfId, opponentId) });
		}
	}
	return old;
}

function quickValue(board, candidate, opponentComponents) {
	let value = candidate.hasMonastery ? 0.4 : 0;
	for (const edge of edgesFor(candidate, board.side)) {
		const contacts = board.matchingEdges(edge);
		value += contacts.length * (edge.terrain === 'C' ? 1.2 : edge.terrain === 'R' ? 0.8 : 0.15);
	}
	// 距離は詳細評価へ残すための一次選抜にだけ使う。合法な連結は保証しない。
	for (const { component } of opponentComponents) for (const { edge } of component.openEdges) {
		const point = midpoint(edge);
		if (Math.hypot(point.x - candidate.centerX, point.y - candidate.centerY) < board.side * 2.5) return value + 0.3;
	}
	return value;
}

function evaluateOption(engine, preview, candidate, option, oldComponents, opponentComponents, weights) {
	const state = engine.state, selfId = engine.activePlayer.id;
	const opponentId = principalOpponentId(state, selfId);
	const addedMeeple = option ? { ref: preview.featureRef(candidate, option.type, option.index), playerId: selfId } : null;
	let immediate = 0, future = 0, obstruction = 0, poach = 0, poachProximity = 0;
	let chosenFeatureComplete = false;
	const oldPotential = oldComponents.reduce((sum, entry) => sum + entry.potential, 0);
	const seen = new Set();
	for (const type of featureTypes) for (let index = 0; index < (candidate.featureGroups[type]?.length || 0); index++) {
		const component = preview.component(candidate, type, index), key = `${type}:${component.key}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const owners = componentOwners(preview, state, component, type, addedMeeple);
		const difference = ownershipDifference(owners, selfId, opponentId);
		const completed = isComplete(preview, candidate, type, index);
		if (completed && !state.scored.includes(component.key)) immediate += difference * scoreFeature(preview, candidate, type, index);
		else future += difference * featurePotential(preview, candidate, type, index, component, weights);
		if (option?.type === type && component.features.some(item => item.tile.id === candidate.id && item.index === option.index)) chosenFeatureComplete = completed;
		const touched = oldComponents.filter(entry => entry.type === type && entry.component.features.some(item => component.features.some(next => next.tile.id === item.tile.id && next.index === item.index)));
		if (difference < 0) for (const entry of touched) obstruction += Math.max(0, component.openEdges.length - entry.component.openEdges.length);
		if (difference >= 0 && touched.some(entry => (entry.owners.get(selfId) || 0) > 0) && touched.some(entry => (entry.owners.get(opponentId) || 0) > 0))
			poach += Math.min(4, scoreFeature(preview, candidate, type, index)) / (1 + component.openEdges.length);
		if (difference > 0 && component.openEdges.length) for (const target of opponentComponents) {
			if (target.type !== type || touched.some(entry => entry.component.key === target.component.key)) continue;
			let distance = Infinity;
			for (const source of component.openEdges) for (const destination of target.component.openEdges) {
				const a = midpoint(source.edge), b = midpoint(destination.edge);
				distance = Math.min(distance, Math.hypot(a.x - b.x, a.y - b.y));
			}
			poachProximity = Math.max(poachProximity, Math.max(0, 1 - distance / (3 * preview.side)));
		}
	}
	for (const tile of preview.tiles) {
		if (!tile.hasMonastery || state.scored.includes(`${tile.id}:monastery:0`)) continue;
		const completed = isComplete(preview, tile, 'monastery', 0);
		const owner = tile.id === candidate.id && option?.type === 'monastery' ? selfId : state.meeples[`${tile.id}:monastery:0`];
		if (completed) {
			if (owner === selfId) immediate += scoreFeature(preview, tile, 'monastery', 0);
			else if (owner === opponentId) immediate -= scoreFeature(preview, tile, 'monastery', 0);
			if (tile.id === candidate.id && option?.type === 'monastery') chosenFeatureComplete = true;
		} else if (tile.id === candidate.id && owner === selfId) future += weights.future * scoreFeature(preview, tile, 'monastery', 0) / 2;
	}
	let field = 0;
	if (option?.type === 'field') field = weights.fieldFuture * (1 + scoreField(preview, candidate, option.index));
	let newVertices = 0;
	const counted = new Set(state.countedVertices);
	for (const point of Object.values(verticesFor(candidate, preview.side))) {
		const key = `${Math.round(point.x * 10000)}:${Math.round(point.y * 10000)}`;
		if (!counted.has(key) && vertexIsFullyTiled(preview, point)) { newVertices++; counted.add(key); }
	}
	const resourceCost = option && !chosenFeatureComplete ? (option.type === 'field' ? weights.fieldMeepleCost : weights.meepleCost) : 0;
	return weights.immediate * immediate + future - oldPotential + field + weights.vertex * newVertices
		+ weights.obstruction * obstruction + weights.poach * poach + weights.poachProximity * poachProximity - resourceCost;
}

function tacticalValue(engine, choice, pool, weights) {
	if (!pool?.length) return 0;
	const board = engine.state.board, preview = previewBoard(board, choice.placement);
	const selfId = engine.activePlayer.id;
	const opponentId = principalOpponentId(engine.state, selfId);
	let obstruction = 0, poaching = 0;
	const touched = weights.obstructionMobility ? oldTouchingComponents(board, engine.state, choice.placement, weights, selfId, opponentId) : [];
	for (const old of touched) {
		if ((old.owners.get(opponentId) || 0) <= (old.owners.get(selfId) || 0)) continue;
		const feature = old.component.features[0];
		const newer = preview.component(feature.tile, old.type, feature.index);
		const chance = (testBoard, component) => component.openEdges.slice(0, 2).reduce((product, edge) => {
			const available = reachableTileCopies(testBoard, edge, pool, engine.rules);
			return product * available / (available + 4);
		}, 1) / (1 + component.openEdges.length * 0.2);
		obstruction += Math.max(-1, Math.min(1, chance(board, old.component) - chance(preview, newer)));
	}
	if (weights.poachBridge && choice.meeple && featureTypes.includes(choice.meeple.type)) {
		const type = choice.meeple.type;
		const own = preview.component(choice.placement, type, choice.meeple.index);
		const owners = componentOwners(preview, engine.state, own, type, { ref: preview.featureRef(choice.placement, type, choice.meeple.index), playerId: selfId });
		if ((owners.get(selfId) || 0) >= (owners.get(opponentId) || 0) && own.openEdges.length) {
			const source = { type, component: own };
			for (const target of collectOwnedComponents(preview, engine.state, opponentId)) {
				if (target.type !== type || target.component.key === own.key) continue;
				const copies = oneTileBridgeCopies(preview, source, target, pool, engine.rules);
				poaching = Math.max(poaching, Math.min(1, copies / 8));
			}
		}
	}
	return weights.obstructionMobility * obstruction + weights.poachBridge * poaching;
}

export function chooseCpuAction(engine, { weights = DEFAULT_CPU_WEIGHTS, random = Math.random, detailedLimit = 12, explorationCount = 4, tacticalLimit = 3, rankAll = false, returnRanking = false } = {}) {
	if (engine.state.phase !== 'placeTile' || engine.state.players.length < 2) throw new Error('CPUは2人以上のタイル配置フェーズ専用です。');
	const candidates = engine.candidates();
	if (!candidates.length) throw new Error('合法候補がありません。');
	const board = engine.state.board, opponentId = principalOpponentId(engine.state, engine.activePlayer.id);
	if (rankAll) { detailedLimit = candidates.length; explorationCount = 0; }
	const opponentComponents = collectOwnedComponents(board, engine.state, opponentId);
	const ranked = candidates.map((candidate, index) => ({ candidate, index, quick: quickValue(board, candidate, opponentComponents), tie: random() }));
	ranked.sort((a, b) => b.quick - a.quick || a.tie - b.tie || a.index - b.index);
	const selected = ranked.slice(0, detailedLimit), remainder = ranked.slice(detailedLimit);
	for (let index = 0; index < Math.min(explorationCount, remainder.length); index++) {
		const pick = Math.floor(random() * remainder.length);
		selected.push(remainder.splice(pick, 1)[0]);
	}
	let best = null;
	const choices = [];
	for (const { candidate } of selected) {
		const preview = previewBoard(board, candidate);
		const oldComponents = oldTouchingComponents(board, engine.state, candidate, weights, engine.activePlayer.id, opponentId);
		for (const meeple of candidateMeepleOptions(preview, engine.state, candidate, engine.fieldScoring)) {
			const value = evaluateOption(engine, preview, candidate, meeple, oldComponents, opponentComponents, weights);
			const choice = { placement: candidate, meeple, value };
			choices.push(choice);
			if (!best || value > best.value + 1e-9 || (Math.abs(value - best.value) <= 1e-9 && random() < 0.5)) best = choice;
		}
	}
	if (engine.tilePool?.length && tacticalLimit > 0 && (weights.obstructionMobility || weights.poachBridge)) {
		choices.sort((a, b) => b.value - a.value);
		best = null;
		for (const choice of choices.slice(0, tacticalLimit)) {
			const value = choice.value + tacticalValue(engine, choice, engine.tilePool, weights);
			if (!best || value > best.value + 1e-9 || (Math.abs(value - best.value) <= 1e-9 && random() < 0.5)) best = { ...choice, value };
		}
	}
	if (!returnRanking) return best;
	choices.sort((a, b) => b.value - a.value || (a.placement.id || '').localeCompare(b.placement.id || ''));
	return { ...best, ranking: choices };
}

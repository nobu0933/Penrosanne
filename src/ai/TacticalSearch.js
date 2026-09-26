import { placementCandidates } from '../game/Rules.js';

const midpoint = edge => ({ x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 });

// 山札の順番は使わず、公開された構成から盤面・破棄・現在の手札を差し引く。
export function publicRemainingTilePool(catalog, visibleTiles) {
	const remaining = new Map();
	for (const tile of catalog) {
		const key = `${tile.shape}:${tile.idPrefix}`;
		const entry = remaining.get(key) || { tile, copies: 0 };
		entry.copies++;
		remaining.set(key, entry);
	}
	for (const tile of visibleTiles) {
		const entry = remaining.get(`${tile.shape}:${tile.idPrefix}`);
		if (entry) entry.copies = Math.max(0, entry.copies - 1);
	}
	return [...remaining.values()].filter(entry => entry.copies > 0);
}

function searchOptions(rules) {
	return {
		allowVerticalMatchingPattern: rules.allowVerticalMatchingPattern,
		allowTerrainHalfTurn: rules.allowTerrainHalfTurn,
		allowTerrainMirror: rules.allowTerrainMirror,
		ignoreMatchingRules: rules.ignoreMatchingRules,
	};
}

function candidateTile(tile, serial) {
	return { ...tile, id: `__cpu-lookahead-${serial}`, centerX: 0, centerY: 0, rotation: 0,
		matchingPattern: 'normal', matchingPatternOptions: ['normal', 'verticalInverse'],
		terrainPattern: 'normal', terrainPatternOptions: ['normal', 'halfTurn'] };
}

// ルール2・3、地形、重なりを満たす「次の1枚」の候補数。ルール1の
// 絶対禁則はここでは近似し、実際の行動は必ず GameEngine 側で確定する。
export function reachableTileCopies(board, freeEdge, pool, rules) {
	let copies = 0, serial = 0;
	for (const entry of pool) {
		const candidates = placementCandidates(board, candidateTile(entry.tile, serial++), {
			targets: [freeEdge], ...searchOptions(rules),
		});
		if (candidates.length) copies += entry.copies;
	}
	return copies;
}

// 1枚の合法な局所配置で自分と相手の地形を実際につなげられるタイル枚数。
// 距離だけの推測では加点しない。探索は近い開放辺の組に限定する。
export function oneTileBridgeCopies(board, source, target, pool, rules, { maxPairs = 2 } = {}) {
	if (source.type !== target.type) return 0;
	const pairs = [];
	for (const sourceOpen of source.component.openEdges) for (const targetOpen of target.component.openEdges) {
		const a = midpoint(sourceOpen.edge), b = midpoint(targetOpen.edge);
		const distance = Math.hypot(a.x - b.x, a.y - b.y);
		if (distance <= board.side * 2.1) pairs.push({ sourceOpen, targetOpen, distance });
	}
	pairs.sort((a, b) => a.distance - b.distance);
	if (!pairs.length) return 0;
	let copies = 0, serial = 0;
	for (const entry of pool) {
		const tile = candidateTile(entry.tile, serial++);
		if (!(tile.featureGroups[source.type] || []).some(group => (Array.isArray(group) ? group : group.boundaryEdges || []).length >= 2)) continue;
		let bridges = false;
		for (const { sourceOpen, targetOpen } of pairs.slice(0, maxPairs)) {
			for (const candidate of placementCandidates(board, tile, { targets: [sourceOpen], ...searchOptions(rules) })) {
				const sourceEdge = board.edges(candidate).find(edge => board.matchingEdges(edge).some(entry => entry.tile.id === sourceOpen.tile.id && entry.edge.name === sourceOpen.edge.name));
				const targetEdge = board.edges(candidate).find(edge => board.matchingEdges(edge).some(entry => entry.tile.id === targetOpen.tile.id && entry.edge.name === targetOpen.edge.name));
				if (!sourceEdge || !targetEdge) continue;
				const sourceIndex = board.featureAtEdge(candidate, source.type, sourceEdge.name);
				if (sourceIndex >= 0 && sourceIndex === board.featureAtEdge(candidate, source.type, targetEdge.name)) { bridges = true; break; }
			}
			if (bridges) break;
		}
		if (bridges) copies += entry.copies;
	}
	return copies;
}

import { Board } from './Board.js';
import { edgeMatchFor, edgeMatchesFor, edgeNames, edgeSymbolsMatch, edgeVertexPairs, edgesFor, localVertices, matchingPatterns, verticesFor } from './Tile.js';

const EPSILON = 1e-5;
const samePoint = (a, b) => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
const angle = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

// 頂点の周りを画面上の時計回りに読んだときに許される、完全な頂点型。
// 部分的に埋まった頂点は、いずれかの型の循環連続部分列でなければならない。
export const VERTEX_PATTERNS = Object.freeze({
	sun: 'GGGGG',
	moon: 'EEEEE',
	king: 'GGGGBD',
	queen: 'GGBDGBD',
	jack: 'EEEA',
	// H(108) + F(108) + D(36) + G(72) + B(36) = 360。
	// `HF → ace → DGB` および `FD → ace` の頂点型とも一致する。
	ace: 'HFDGB',
	deuce: 'AAE',
	star: 'FHC',
});

// 少ない時計回りの頂点列だけで頂点型が一意に決まる組合せ。
const FORCED_VERTEX_TYPE_HINTS = new Map([
	['C', 'star'],
	['FH', 'star'],
	['HF', 'ace'],
	['BH', 'ace'],
	['FD', 'ace'],
	['AA', 'deuce'],
]);

// 地形、辺記号、頂点型、絶対禁則をすべて満たす通常候補だけを返す。
export function placementCandidates(board, rawTile, { targets = board.freeEdges(), tileOptions = [], fillabilityCache = null, allowVerticalMatchingPattern = true } = {}) {
	const options = { allowVerticalMatchingPattern };
	const candidates = matchingPlacementCandidates(board, rawTile, targets, options);
	if (!tileOptions.length && !fillabilityCache) return candidates;
	return candidates.filter((candidate) => preservesAbsoluteFillability(board, candidate, tileOptions, fillabilityCache));
}

// 候補区分は通常候補だけである。
export function placementCandidateGroups(board, rawTile, options = {}) {
	return { regular: placementCandidates(board, rawTile, options) };
}

// 手元タイルの地形を使う前に、形状規則だけから盤面の「確定／未確定」の
// 配置位置を増分探索する。返すタイルは仮想タイルであり、ゲーム盤面には追加しない。
export function structuralPlacementFrontier(
	board,
	{ tileOptions = [], fillabilityCache = null, allowVerticalMatchingPattern = true } = {},
) {
	const structuralOptions = structuralTileOptions(tileOptions);
	if (!structuralOptions.length) return emptyPlacementFrontier();

	const virtual = cloneBoard(board);
	let physicalCache = fillabilityCache ? new Map(fillabilityCache) : createFillabilityCache(virtual, structuralOptions);
	const domains = new Map();
	const domainBuckets = new Map();
	const queued = new Map();
	// 辺の候補更新とは別に、頂点型が確定した地点からも再探索を始める。
	// ある確定タイルが「辺を共有せず頂点だけを共有する」別の頂点型を
	// 一意にする場合があるため、辺の近傍キャッシュだけでは連鎖を取りこぼす。
	const queuedVertices = new Map();
	const forced = [];
	const forcedKeys = new Set();
	const vertexTypes = new Map();
	let serial = 0;

	const enqueue = (item) => {
		if (!item?.tile || !item?.edge || virtual.edgeNeighbors(item.tile, item.edge).length) return;
		queued.set(freeEdgeKey(item.edge), item);
	};
	const enqueueVertex = (point) => {
		const key = point && vertexKey(point);
		if (key && vertexTypes.has(key)) queuedVertices.set(key, point);
	};
	const enqueueVertexEdges = (point) => {
		// 頂点の空き扇形を埋めるタイルは、必ずこの頂点を端に持つ既存の
		// 空き辺のいずれかを共有する。中心距離ではなく、幾何学的に正確な
		// この2辺だけを再評価するため、探索範囲は頂点近傍に留まる。
		for (const tile of virtual.vertexTiles(point)) for (const edge of virtual.edges(tile)) {
			if (samePoint(edge.a, point) || samePoint(edge.b, point)) enqueue({ tile, edge });
		}
	};
	const dropDomain = (key) => {
		const previous = domains.get(key);
		if (!previous) return;
		domains.delete(key);
		const bucket = previous.bucket;
		const keys = domainBuckets.get(bucket);
		keys?.delete(key);
		if (!keys?.size) domainBuckets.delete(bucket);
	};
	const storeDomain = (target, candidates) => {
		const key = freeEdgeKey(target.edge);
		dropDomain(key);
		const bucket = edgeBucket(target.edge, board.side);
		domains.set(key, { target, candidates, bucket });
		if (!domainBuckets.has(bucket)) domainBuckets.set(bucket, new Set());
		domainBuckets.get(bucket).add(key);
	};
	const enqueueAffectedDomains = (tile) => {
		for (const key of nearbyDomainKeys(domainBuckets, tile, board.side)) {
			const domain = domains.get(key);
			if (domain) enqueue(domain.target);
		}
	};
	for (const point of rememberVertexTypes(virtual, vertexTypes)) enqueueVertex(point);

	for (const freeEdge of virtual.freeEdges()) {
		// 前ターンの domainCache は、前ターンだけ存在した仮想確定タイルを
		// 前提に作られている。実盤面にはそのタイルがないため、遠方であっても
		// 次ターンへ持ち越すと候補が欠落する。ここでは実盤面の全空き辺から
		// 正しく再構築し、同一探索中だけ domains を増分更新する。
		enqueue(freeEdge);
	}
	while (queued.size || queuedVertices.size) {
		if (queuedVertices.size) {
			const [, point] = queuedVertices.entries().next().value;
			queuedVertices.delete(vertexKey(point));
			enqueueVertexEdges(point);
			continue;
		}
		const [key, target] = queued.entries().next().value;
		queued.delete(key);
		if (virtual.edgeNeighbors(target.tile, target.edge).length) {
			dropDomain(key);
			continue;
		}
		const candidates = structuralCandidatesAtEdge(virtual, target, structuralOptions, {
			allowVerticalMatchingPattern,
			fillabilityCache: physicalCache,
			vertexTypes,
		});
		storeDomain(target, candidates);
		// 残り1スロットの頂点型は、まず不足している頂点名そのものを満たす
		// 候補で確定する。例えば FDGB → ace → H、GBHF → ace → D は、
		// 同じ空き辺のもう一方の頂点に関する候補があっても取りこぼさない。
		const finalSlotForced = uniqueStructuralPositions(
			candidates.filter((candidate) => completesFinalVertexSlot(virtual, candidate, vertexTypes)),
		);
		// 確定済み頂点型へ入る候補だけで一意性を判定する。空き辺の反対側へ
		// 広がる無関係な候補があっても、頂点型の残りスロットは確定のままである。
		const vertexForced = finalSlotForced.length ? finalSlotForced : uniqueStructuralPositions(
			candidates.filter((candidate) => completesForcedVertex(virtual, candidate, vertexTypes)),
		);
		if (vertexForced.length !== 1) continue;

		const forcedCandidate = { ...vertexForced[0], _inferenceStatus: 'forced' };
		const forcedKey = structuralPlacementKey(forcedCandidate);
		if (forcedKeys.has(forcedKey)) continue;
		forcedKeys.add(forcedKey);
		dropDomain(key);
		const placed = commitVirtualTile(virtual, forcedCandidate, serial++);
		const placedVertices = Object.values(verticesFor(placed, virtual.side));
		for (const point of rememberVertexTypes(virtual, vertexTypes, placedVertices)) enqueueVertex(point);
		// 既に型が決まっている頂点でも、隣接する確定タイルが増えれば
		// 残りスロットの候補数が変わるため、必ず頂点起点で再評価する。
		for (const point of placedVertices) enqueueVertex(point);
		forced.push({ ...placed, _inferenceStatus: 'forced' });
		physicalCache = updateFillabilityCache(virtual, placed, structuralOptions, physicalCache);
		enqueueAffectedDomains(placed);
		for (const edge of virtual.edges(placed)) enqueue({ tile: placed, edge });
	}

	const unresolved = uniqueStructuralCandidates(
		[...domains.values()].flatMap(({ candidates }) => candidates).filter((candidate) => !forcedKeys.has(structuralPlacementKey(candidate))),
	).map((candidate) => ({ ...candidate, _inferenceStatus: 'unresolved' }));
	return {
		forced,
		unresolved,
		all: [...forced, ...unresolved],
		// 同一回の頂点・辺連鎖を増分更新するための内部候補。
		// 仮想確定配置を前提にするので、次ターンへは再利用しない。
		domainCache: new Map([...domains].map(([key, domain]) => [key, domain.candidates])),
		truncated: false,
	};
}

export function structuralPositionKey(tile) {
	const rotation = ((tile.rotation || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
	return `${tile.shape}:${Math.round(tile.centerX / EPSILON)}:${Math.round(tile.centerY / EPSILON)}:${Math.round(rotation / EPSILON)}`;
}

function emptyPlacementFrontier() { return { forced: [], unresolved: [], all: [], domainCache: new Map(), truncated: false }; }
function cloneBoard(board) {
	const result = new Board(board.side);
	result.tiles = structuredClone(board.tiles);
	return result;
}
function structuralTileOptions(tileOptions) {
	const shapes = tileOptions.length ? [...new Set(tileOptions.map((tile) => tile.shape))] : ['thin', 'fat'];
	return shapes.map((shape) => ({
		id: `__structure-${shape}`,
		shape,
		edgeTerrain: Object.fromEntries(edgeNames(shape).map((edge) => [edge, 'F'])),
		featureGroups: { city: [], road: [], field: [] },
		centerX: 0,
		centerY: 0,
		rotation: 0,
		matchingPattern: null,
		isStructural: true,
	}));
}
function structuralCandidatesAtEdge(board, target, options, { allowVerticalMatchingPattern, fillabilityCache, vertexTypes }) {
	const candidates = [];
	for (const option of options) {
		for (const base of geometricPlacementCandidates(board, option, [target], { requireTerrain: false })) {
			for (const resolved of resolveMatchingPatternOptions(board, base, { allowVerticalMatchingPattern, vertexTypes })) {
				const candidate = { ...resolved, id: `__structure-${structuralPositionKey(resolved)}:${resolved.matchingPattern}` };
				if (preservesAbsoluteFillability(board, candidate, options, fillabilityCache)) candidates.push(candidate);
			}
		}
	}
	return uniqueStructuralCandidates(candidates);
}
function uniqueStructuralCandidates(candidates) {
	const result = new Map();
	for (const candidate of candidates) result.set(structuralPlacementKey(candidate), candidate);
	return [...result.values()];
}
function uniqueStructuralPositions(candidates) {
	const result = new Map();
	for (const candidate of candidates) {
		const key = structuralPositionKey(candidate);
		const variants = result.get(key) || [];
		variants.push(candidate);
		result.set(key, variants);
	}
	return [...result.values()].map((variants) => mergeMatchingPatternVariants(variants));
}
function structuralPlacementKey(tile) { return `${structuralPositionKey(tile)}:${tile.matchingPattern || 'normal'}`; }
function completesForcedVertex(board, candidate, vertexTypes) {
	return Object.values(verticesFor(candidate, board.side)).some((point) => vertexTypeAt(board, point, vertexTypes));
}
function completesFinalVertexSlot(board, candidate, vertexTypes) {
	for (const [vertexId, point] of Object.entries(verticesFor(candidate, board.side))) {
		const type = vertexTypeAt(board, point, vertexTypes);
		if (!type) continue;
		const expected = nextVertexInCompletedPattern(vertexSequenceAt(board, null, point), VERTEX_PATTERNS[type]);
		if (expected === vertexId) return true;
	}
	return false;
}
function nextVertexInCompletedPattern(sequence, pattern) {
	if (sequence.length !== pattern.length - 1) return null;
	const circular = pattern + pattern;
	for (let start = 0; start < pattern.length; start++) {
		if (circular.slice(start, start + sequence.length) === sequence) return circular[start + sequence.length];
	}
	return null;
}
function commitVirtualTile(board, candidate, serial) {
	applyResolvedMatchingPatternDomains(board, candidate);
	const tile = { ...candidate, id: `__inferred-${serial}-${candidate.shape}` };
	board.add(tile);
	return board.getTile(tile.id);
}
function edgeBucket(edge, side) {
	const x = (edge.a.x + edge.b.x) / 2, y = (edge.a.y + edge.b.y) / 2, size = side * 1.6;
	return `${Math.floor(x / size)}:${Math.floor(y / size)}`;
}
function nearbyDomainKeys(buckets, tile, side) {
	const size = side * 1.6, radius = 3, x = Math.floor(tile.centerX / size), y = Math.floor(tile.centerY / size), keys = new Set();
	for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
		for (const key of buckets.get(`${x + dx}:${y + dy}`) || []) keys.add(key);
	}
	return keys;
}

function matchingPlacementCandidates(board, rawTile, targets, options) {
	const results = new Map();
	for (const base of terrainPlacementCandidates(board, rawTile, targets)) {
		const candidate = resolveMatchingPatterns(board, base, options);
		if (candidate) results.set(placementKey(candidate), candidate);
	}
	return [...results.values()];
}

function terrainPlacementCandidates(board, rawTile, targets) {
	return geometricPlacementCandidates(board, rawTile, targets, { requireTerrain: true });
}

function geometricPlacementCandidates(board, rawTile, targets, { requireTerrain }) {
	const results = new Map();
	for (const { edge: targetEdge } of targets) for (const sourceEdge of edgesFor({ ...rawTile, centerX: 0, centerY: 0, rotation: 0 }, board.side)) {
		if (requireTerrain && sourceEdge.terrain !== targetEdge.terrain) continue;
		const rotation = angle(targetEdge.b, targetEdge.a) - angle(sourceEdge.a, sourceEdge.b);
		const local = localVertices(rawTile.shape, board.side), pairs = edgeVertexPairs(rawTile.shape), [sourceA, sourceB] = pairs[sourceEdge.index];
		const rotate = (point) => ({ x: point.x * Math.cos(rotation) - point.y * Math.sin(rotation), y: point.x * Math.sin(rotation) + point.y * Math.cos(rotation) });
		const midpoint = { x: (targetEdge.a.x + targetEdge.b.x) / 2, y: (targetEdge.a.y + targetEdge.b.y) / 2 };
		const localMid = rotate({ x: (local[sourceA].x + local[sourceB].x) / 2, y: (local[sourceA].y + local[sourceB].y) / 2 });
		const base = { ...rawTile, centerX: midpoint.x - localMid.x, centerY: midpoint.y - localMid.y, rotation };
		if (board.overlaps(base) || !hasAdjacentEdge(board, base) || (requireTerrain && !allSharedTerrainMatch(board, base))) continue;
		results.set(placementKey(base), base);
	}
	return [...results.values()];
}

function hasAdjacentEdge(board, tile) {
	return edgesFor(tile, board.side).some((edge) => board.allEdges().some(({ edge: other }) => samePoint(edge.a, other.b) && samePoint(edge.b, other.a)));
}

function allSharedTerrainMatch(board, tile) {
	for (const edge of edgesFor(tile, board.side)) {
		const neighbors = board.allEdges().filter(({ edge: other }) => samePoint(edge.a, other.b) && samePoint(edge.b, other.a));
		if (neighbors.some(({ edge: other }) => other.terrain !== edge.terrain)) return false;
	}
	return true;
}

// ルール1: 置いた後の各空き辺に、シンまたはファットを物理的に重ならず置けること。
function preservesAbsoluteFillability(board, placedTile, tileOptions, cache) {
	const hypothetical = boardWithTile(board, placedTile), options = distinctTileOptions(tileOptions);
	for (const freeEdge of hypothetical.freeEdges()) {
		const key = freeEdgeKey(freeEdge.edge), cached = cache?.get(key);
		const physical = cached !== undefined && !edgeIsNearPlacedTile(freeEdge, placedTile, board.side)
			? Boolean(cached)
			: Boolean(findPhysicalWitness(hypothetical, freeEdge, options));
		if (!physical) return false;
	}
	return true;
}

function boardWithTile(board, tile) { const hypothetical = new Board(board.side); hypothetical.tiles = [...board.tiles, tile]; return hypothetical; }
function edgeIsNearPlacedTile(freeEdge, placedTile, side) {
	if (freeEdge.tile.id === placedTile.id) return true;
	const midpoint = { x: (freeEdge.edge.a.x + freeEdge.edge.b.x) / 2, y: (freeEdge.edge.a.y + freeEdge.edge.b.y) / 2 };
	return Math.hypot(midpoint.x - placedTile.centerX, midpoint.y - placedTile.centerY) <= side * 3.05;
}
function distinctTileOptions(tileOptions) {
	const unique = new Map();
	for (const tile of tileOptions) if (!unique.has(tile.shape)) unique.set(tile.shape, tile);
	return [...unique.values()];
}
function findPhysicalWitness(board, freeEdge, options) {
	for (const option of options)
		if (geometricPlacementCandidates(board, option, [freeEdge], { requireTerrain: false })[0]) return true;
	return false;
}
export function createFillabilityCache(board, tileOptions) {
	const options = distinctTileOptions(tileOptions), cache = new Map();
	for (const freeEdge of board.freeEdges()) cache.set(freeEdgeKey(freeEdge.edge), Boolean(findPhysicalWitness(board, freeEdge, options)));
	return cache;
}
export function updateFillabilityCache(board, placedTile, tileOptions, previous = new Map()) {
	const options = distinctTileOptions(tileOptions), next = new Map();
	for (const freeEdge of board.freeEdges()) {
		const key = freeEdgeKey(freeEdge.edge);
		next.set(key, !edgeIsNearPlacedTile(freeEdge, placedTile, board.side) && previous.has(key) ? previous.get(key) : Boolean(findPhysicalWitness(board, freeEdge, options)));
	}
	return next;
}
function freeEdgeKey(edge) {
	const pointKey = (point) => `${Math.round(point.x / EPSILON)}:${Math.round(point.y / EPSILON)}`;
	return [pointKey(edge.a), pointKey(edge.b)].sort().join('|');
}
function placementKey(tile) { return `${Math.round(tile.centerX / EPSILON)}:${Math.round(tile.centerY / EPSILON)}:${Math.round(tile.rotation / EPSILON)}`; }

// ルール2: 隣接辺は alpha/beta が一致し、convex/concave が反対のときだけ接続できる。
export function resolveMatchingPatterns(board, rawTile, { allowVerticalMatchingPattern = true, vertexTypes = null } = {}) {
	const variants = resolveMatchingPatternOptions(board, rawTile, { allowVerticalMatchingPattern, vertexTypes });
	return variants.length ? mergeMatchingPatternVariants(variants) : null;
}

// 形状の確定配置探索では、同一位置でも辺記号パターンが異なる可能性を
// 失わないよう、整合する全パターンを返す。
export function resolveMatchingPatternOptions(board, rawTile, { allowVerticalMatchingPattern = true, vertexTypes = null } = {}) {
	const patternsFor = (tile) => availableMatchingPatterns(tile, allowVerticalMatchingPattern);
	const results = [];
	for (const matchingPattern of patternsFor(rawTile)) {
		const tile = { ...rawTile, matchingPattern, matchingPatternOptions: [matchingPattern] };
		if (!vertexPatternsAllow(board, tile) || !forcedVertexTypesAllow(board, tile, vertexTypes)) continue;
		const domains = matchingPatternDomains(board, tile, allowVerticalMatchingPattern);
		if (!domains) continue;
		results.push({
			...tile,
			resolvedMatchingPatternDomains: domains,
		});
	}
	return results;
}

// 各タイルの上下反転パターンは、周囲の辺記号だけで一意になるまでは
// 可能性として保持する。最初に見つかった組合せを盤面へ固定してしまうと、
// 後から `AA → deuce → E` のような頂点型を閉じるパターンが消えてしまう。
// 辺制約は二値ドメインの整合性伝播で解き、候補と同じ接続成分だけを扱う。
function matchingPatternDomains(board, candidate, allowVerticalMatchingPattern) {
	const tiles = [...board.tiles, candidate];
	const byId = new Map(tiles.map((tile) => [tile.id, tile]));
	const constraints = matchingEdgeConstraints(tiles, board.side);
	const componentIds = matchingComponentIds(candidate.id, constraints);
	const domains = new Map();
	for (const id of componentIds) {
		const tile = byId.get(id);
		const patterns = availableMatchingPatterns(tile, allowVerticalMatchingPattern);
		if (!patterns.length) return null;
		domains.set(id, patterns);
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const constraint of constraints) {
			if (!domains.has(constraint.leftId) || !domains.has(constraint.rightId)) continue;
			const leftTile = byId.get(constraint.leftId), rightTile = byId.get(constraint.rightId);
			const left = domains.get(constraint.leftId), right = domains.get(constraint.rightId);
			const nextLeft = left.filter((leftPattern) => right.some((rightPattern) => matchingConstraintAllows(
				leftTile, constraint.leftEdge, leftPattern, rightTile, constraint.rightEdge, rightPattern,
			)));
			const nextRight = right.filter((rightPattern) => nextLeft.some((leftPattern) => matchingConstraintAllows(
				leftTile, constraint.leftEdge, leftPattern, rightTile, constraint.rightEdge, rightPattern,
			)));
			if (!nextLeft.length || !nextRight.length) return null;
			if (nextLeft.length !== left.length || nextRight.length !== right.length) changed = true;
			domains.set(constraint.leftId, nextLeft);
			domains.set(constraint.rightId, nextRight);
		}
	}
	return Object.fromEntries([...domains].map(([id, patterns]) => [id, patterns]));
}
function matchingEdgeConstraints(tiles, side) {
	const allEdges = tiles.flatMap((tile) => edgesFor(tile, side).map((edge) => ({ tile, edge }))), constraints = [];
	for (let left = 0; left < allEdges.length; left++) for (let right = left + 1; right < allEdges.length; right++) {
		const one = allEdges[left], two = allEdges[right];
		if (one.tile.id === two.tile.id || !samePoint(one.edge.a, two.edge.b) || !samePoint(one.edge.b, two.edge.a)) continue;
		constraints.push({ leftId: one.tile.id, leftEdge: one.edge.name, rightId: two.tile.id, rightEdge: two.edge.name });
	}
	return constraints;
}
function matchingComponentIds(candidateId, constraints) {
	const adjacency = new Map();
	for (const { leftId, rightId } of constraints) {
		if (!adjacency.has(leftId)) adjacency.set(leftId, new Set());
		if (!adjacency.has(rightId)) adjacency.set(rightId, new Set());
		adjacency.get(leftId).add(rightId);
		adjacency.get(rightId).add(leftId);
	}
	const seen = new Set([candidateId]), queue = [candidateId];
	while (queue.length) for (const id of adjacency.get(queue.shift()) || []) if (!seen.has(id)) {
		seen.add(id);
		queue.push(id);
	}
	return seen;
}
function matchingConstraintAllows(leftTile, leftEdge, leftPattern, rightTile, rightEdge, rightPattern) {
	return edgeSymbolsMatch(
		edgeMatchFor({ ...leftTile, matchingPattern: leftPattern }, leftEdge),
		edgeMatchFor({ ...rightTile, matchingPattern: rightPattern }, rightEdge),
	);
}
function availableMatchingPatterns(tile, allowVerticalMatchingPattern) {
	const allowed = allowVerticalMatchingPattern ? matchingPatterns(tile.shape) : ['normal'];
	const source = Array.isArray(tile.matchingPatternOptions)
		? tile.matchingPatternOptions
		: tile.matchingPattern ? [tile.matchingPattern] : allowed;
	return source.filter((pattern) => allowed.includes(pattern));
}
function mergeMatchingPatternVariants(variants) {
	const first = variants[0], patternOptions = [...new Set(variants.map((variant) => variant.matchingPattern).filter(Boolean))];
	const domains = new Map();
	for (const variant of variants) for (const [id, patterns] of Object.entries(variant.resolvedMatchingPatternDomains || {})) {
		const values = domains.get(id) || new Set();
		patterns.forEach((pattern) => values.add(pattern));
		domains.set(id, values);
	}
	return {
		...first,
		matchingPattern: patternOptions.length === 1 ? patternOptions[0] : null,
		matchingPatternOptions: patternOptions,
		resolvedMatchingPatternDomains: Object.fromEntries([...domains].map(([id, patterns]) => [id, [...patterns]])),
	};
}
function applyResolvedMatchingPatternDomains(board, tile) {
	for (const [id, patterns] of Object.entries(tile.resolvedMatchingPatternDomains || {})) {
		const neighbor = board.getTile(id);
		if (!neighbor) continue;
		neighbor.matchingPatternOptions = [...patterns];
		neighbor.matchingPattern = patterns.length === 1 ? patterns[0] : null;
	}
	const patterns = tile.matchingPatternOptions || (tile.matchingPattern ? [tile.matchingPattern] : []);
	if (patterns.length) {
		tile.matchingPatternOptions = [...patterns];
		tile.matchingPattern = patterns.length === 1 ? patterns[0] : null;
	}
	delete tile.resolvedMatchingPatternDomains;
}

// ルール3: 盤面頂点の時計回り配列は、許可された頂点型の循環連続部分列だけに制限する。
export function vertexPatternsAllow(board, candidate) {
	for (const point of Object.values(verticesFor(candidate, board.side))) {
		const sequence = vertexSequenceAt(board, candidate, point);
		if (!Object.values(VERTEX_PATTERNS).some((pattern) => isCyclicSegment(sequence, pattern))) return false;
	}
	return true;
}

// 識別列が現れた頂点は、対応する頂点型の循環順列にだけ進める。
export function forcedVertexTypesAllow(board, candidate, assignedTypes = null) {
	for (const point of Object.values(verticesFor(candidate, board.side))) {
		const type = vertexTypeAt(board, point, assignedTypes);
		if (type && !isCyclicSegment(vertexSequenceAt(board, candidate, point), VERTEX_PATTERNS[type])) return false;
	}
	return true;
}

function vertexTypeAt(board, point, assignedTypes = null) {
	return assignedTypes?.get(vertexKey(point)) || inferVertexTypeAt(board, point);
}

function rememberVertexTypes(board, assignedTypes, points = null) {
	const targets = points || board.tiles.flatMap((tile) => Object.values(verticesFor(tile, board.side)));
	const added = [];
	for (const point of targets) {
		const key = vertexKey(point);
		if (!assignedTypes.has(key)) {
			const type = inferVertexTypeAt(board, point);
			if (type) {
				assignedTypes.set(key, type);
				added.push(point);
			}
		}
	}
	return added;
}

function inferVertexTypeAt(board, point) {
	const preferred = forcedVertexTypeForSequence(vertexHintSequenceAt(board, point));
	if (preferred) return preferred;
	return inferredVertexTypeForSequence(vertexSequenceAt(board, null, point));
}

export function inferredVertexTypeForSequence(sequence) {
	const possible = Object.entries(VERTEX_PATTERNS)
		.filter(([, pattern]) => isCyclicSegment(sequence, pattern))
		.map(([type]) => type);
	return possible.length === 1 ? possible[0] : null;
}

export function forcedVertexTypeForSequence(sequence) {
	return FORCED_VERTEX_TYPE_HINTS.get(sequence) || null;
}

function vertexKey(point) {
	return `${Math.round(point.x / EPSILON)}:${Math.round(point.y / EPSILON)}`;
}

// 部分的に埋まった頂点の識別列は、最大の空白角の直後から時計回りに読む。
// 固定の画面角度を起点にすると FH と HF の向きが不安定になるためである。
function vertexHintSequenceAt(board, point) {
	return clockwiseVertexEntries(board, null, point).map(({ vertexId }) => vertexId).join('');
}

export function vertexSequenceAt(board, candidate, point) {
	return clockwiseVertexEntries(board, candidate, point).map(({ vertexId }) => vertexId).join('');
}

// 部分的に埋まった頂点は、最大の空白角の直後から時計回りに読む。
// `atan2` の -π/π 境界で単純にソートすると、例えば実際は H→F→D と
// 連続している並びが D→H→F に分断され、ace の D/G/B が候補から漏れる。
// 頂点型は循環順列なので、完成頂点についてこの起点を選んでも意味は変わらない。
function clockwiseVertexEntries(board, candidate, point) {
	const entries = [];
	for (const tile of [...board.tiles, ...(candidate ? [candidate] : [])]) {
		for (const [vertexId, vertex] of Object.entries(verticesFor(tile, board.side))) if (samePoint(vertex, point)) {
			// 画面座標系では atan2 の昇順が時計回りになる。
			entries.push({ vertexId, direction: Math.atan2(tile.centerY - point.y, tile.centerX - point.x) });
		}
	}
	if (entries.length < 2) return entries;
	entries.sort((left, right) => left.direction - right.direction);
	let largestGap = -Infinity, start = 0;
	for (let index = 0; index < entries.length; index++) {
		const current = entries[index].direction;
		const next = entries[(index + 1) % entries.length].direction + (index + 1 === entries.length ? Math.PI * 2 : 0);
		if (next - current > largestGap) {
			largestGap = next - current;
			start = (index + 1) % entries.length;
		}
	}
	return entries.slice(start).concat(entries.slice(0, start));
}

export function isCyclicSegment(sequence, pattern) {
	if (!sequence || sequence.length > pattern.length) return false;
	const circular = pattern + pattern;
	for (let start = 0; start < pattern.length; start++) if (circular.slice(start, start + sequence.length) === sequence) return true;
	return false;
}

export function edgeSymbolFor(shape, edgeName, matchingPattern = 'normal') { return edgeMatchesFor(shape, matchingPattern)[edgeName]; }

export function isLegalPlacement(board, tile, { allowVerticalMatchingPattern = true } = {}) {
	// 候補には未確定の周辺タイルへ採用するパターンも記録されるため、ここでも
	// 改めて全組合せを解き直して検証する。
	const resolved = resolveMatchingPatterns(board, tile, { allowVerticalMatchingPattern });
	return Boolean(resolved && !board.overlaps(tile) && hasAdjacentEdge(board, tile));
}

export function featureCanReceiveMeeple(board, state, tile, type, index) {
	const component = type === 'field' ? board.fieldScoreComponent(tile, index) : board.component(tile, type, index);
	return !component.features.some(({ tile: featureTile, index: featureIndex }) => state.meeples[board.featureRef(featureTile, type, featureIndex)]);
}

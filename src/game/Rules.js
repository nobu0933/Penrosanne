import { Board } from './Board.js';
import { edgeMatchFor, edgeMatchesFor, edgeNames, edgeSymbolsMatch, edgeVertexPairs, edgesFor, halfTurnTerrainTile, localVertices, matchingPatterns, verticesFor } from './Tile.js';
import { mirrorTile } from './TileSet.js';

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
export function placementCandidates(board, rawTile, { targets = board.freeEdges(), tileOptions = [], fillabilityCache = null, allowVerticalMatchingPattern = true, allowTerrainHalfTurn = true, allowTerrainMirror = false, ignoreMatchingRules = false, candidateFilter = null } = {}) {
	const options = { allowVerticalMatchingPattern, allowTerrainHalfTurn, allowTerrainMirror, ignoreMatchingRules };
	const candidates = ignoreMatchingRules
		? terrainOnlyPlacementCandidates(board, rawTile, targets, options)
		: matchingPlacementCandidates(board, rawTile, targets, options);
	const filtered = candidateFilter ? candidates.filter(candidateFilter) : candidates;
	if (ignoreMatchingRules) return filtered;
	if (!tileOptions.length && !fillabilityCache) return filtered;
	return filtered.filter((candidate) => preservesAbsoluteFillability(board, candidate, tileOptions, fillabilityCache));
}

function terrainOnlyPlacementCandidates(board, rawTile, targets, options) {
	const results = new Map();
	for (const terrainTile of terrainPatternVariants(rawTile, options.allowTerrainHalfTurn, options.allowTerrainMirror))
		for (const candidate of terrainPlacementCandidates(board, terrainTile, targets))
			results.set(placementKey(candidate), candidate);
	return [...results.values()];
}

// 候補区分は通常候補だけである。
export function placementCandidateGroups(board, rawTile, options = {}) {
	return { regular: placementCandidates(board, rawTile, options) };
}

// 手元タイルの地形を使う前に、形状規則だけから盤面の「確定／未確定」の
// 配置位置を増分探索する。返すタイルは仮想タイルであり、ゲーム盤面には追加しない。
export function structuralPlacementFrontier(
	board,
	{ tileOptions = [], fillabilityCache = null, allowVerticalMatchingPattern = true, previous = null, changedTile = null, changedTileAlreadyVirtual = false } = {},
) {
	const structuralOptions = structuralTileOptions(tileOptions);
	if (!structuralOptions.length) return emptyPlacementFrontier();
	const resume = Boolean(previous?.virtualTiles?.length);
	const virtual = resume ? boardFromTiles(board.side, previous.virtualTiles) : cloneBoard(board);
	let changedVirtualTile = null;
	if (resume && changedTile && !changedTileAlreadyVirtual) {
		virtual.add(changedTile);
		changedVirtualTile = virtual.getTile(changedTile.id);
	}
	const queuedVertices = new Map();
	const forced = resume ? structuredClone(previous.forced || []) : [];
	const forcedKeys = new Set(forced.map(structuralPositionKey));
	const vertexTypes = new Map(resume ? previous.vertexTypes || [] : []);
	const searchContext = createStructuralSearchContext(previous?.domainCache);
	let serial = resume ? previous.nextSerial || forced.length : nextStructuralSerial(virtual.tiles);
	const enqueueVertex = (point) => queuedVertices.set(vertexKey(point), point);
	if (!resume) for (const tile of virtual.tiles) for (const point of Object.values(verticesFor(tile, virtual.side))) enqueueVertex(point);
	if (changedVirtualTile) for (const point of Object.values(verticesFor(changedVirtualTile, virtual.side))) enqueueVertex(point);
	while (queuedVertices.size) {
		const [, point] = queuedVertices.entries().next().value;
		queuedVertices.delete(vertexKey(point));
		const types = structuralVertexTypesAt(virtual, point);
		if (types.length === 1) vertexTypes.set(vertexKey(point), types[0]);
		else vertexTypes.delete(vertexKey(point));
		if (!types.length) continue;
		for (const candidate of forcedVertexCompletionCandidates(virtual, point, types, structuralOptions, searchContext)) {
			const forcedKey = structuralPositionKey(candidate);
			if (forcedKeys.has(forcedKey)) continue;
			forcedKeys.add(forcedKey);
			const placed = commitVirtualTile(virtual, { ...candidate, _inferenceStatus: 'forced' }, serial++);
			forced.push({ ...placed, _inferenceStatus: 'forced' });
			for (const placedPoint of Object.values(verticesFor(placed, virtual.side))) enqueueVertex(placedPoint);
		}
	}
	return {
		forced,
		unresolved: [],
		all: forced,
		virtualTiles: structuredClone(virtual.tiles),
		virtualFillabilityCache: new Map(),
		vertexTypes: [...vertexTypes],
		nextSerial: serial,
		domainCache: searchContext.cache,
		truncated: false,
	};
}

// UI側で枚数や経過時間に応じて中断できるよう、追加がない頂点の検査も
// 1ステップずつ進める。同期探索の処理順・確定結果は変えない。
export async function structuralPlacementFrontierProgressively(board, options = {}, { onForced = () => {}, yieldControl = () => {} } = {}) {
	const state = createStructuralFrontierState(board, options);
	if (!state) return emptyPlacementFrontier();
	let forcedCount = 0;
	while (!state.done) {
		const placed = stepStructuralFrontier(state);
		if (placed) {
			forcedCount++;
			onForced({ ...placed, _inferenceStatus: 'forced' });
		}
		const pause = yieldControl({ forcedCount });
		if (pause) await pause;
	}
	return finishStructuralFrontier(state);
}

function createStructuralFrontierState(board, { tileOptions = [], previous = null, changedTile = null, changedTileAlreadyVirtual = false } = {}) {
	const structuralOptions = structuralTileOptions(tileOptions);
	if (!structuralOptions.length) return null;
	const resume = Boolean(previous?.virtualTiles?.length);
	const virtual = resume ? boardFromTiles(board.side, previous.virtualTiles) : cloneBoard(board);
	let changedVirtualTile = null;
	if (resume && changedTile && !changedTileAlreadyVirtual) {
		virtual.add(changedTile);
		changedVirtualTile = virtual.getTile(changedTile.id);
	}
	const state = {
		virtual,
		structuralOptions,
		queuedVertices: new Map(),
		pendingCandidates: [],
		forced: resume ? structuredClone(previous.forced || []) : [],
		forcedKeys: new Set((previous?.forced || []).map(structuralPositionKey)),
		vertexTypes: new Map(resume ? previous.vertexTypes || [] : []),
		searchContext: createStructuralSearchContext(previous?.domainCache),
		serial: resume ? previous.nextSerial || (previous?.forced || []).length : nextStructuralSerial(virtual.tiles),
		done: false,
	};
	const enqueueVertex = (point) => state.queuedVertices.set(vertexKey(point), point);
	if (!resume) for (const tile of virtual.tiles) for (const point of Object.values(verticesFor(tile, virtual.side))) enqueueVertex(point);
	if (changedVirtualTile) for (const point of Object.values(verticesFor(changedVirtualTile, virtual.side))) enqueueVertex(point);
	return state;
}

function stepStructuralFrontier(state) {
	while (!state.done) {
		const candidate = state.pendingCandidates.shift();
		if (candidate) {
			const forcedKey = structuralPositionKey(candidate);
			if (state.forcedKeys.has(forcedKey)) continue;
			state.forcedKeys.add(forcedKey);
			const placed = commitVirtualTile(state.virtual, { ...candidate, _inferenceStatus: 'forced' }, state.serial++);
			state.forced.push({ ...placed, _inferenceStatus: 'forced' });
			for (const point of Object.values(verticesFor(placed, state.virtual.side))) state.queuedVertices.set(vertexKey(point), point);
			return placed;
		}
		if (!state.queuedVertices.size) {
			state.done = true;
			return null;
		}
		const [, point] = state.queuedVertices.entries().next().value;
		state.queuedVertices.delete(vertexKey(point));
		const types = structuralVertexTypesAt(state.virtual, point);
		if (types.length === 1) state.vertexTypes.set(vertexKey(point), types[0]);
		else state.vertexTypes.delete(vertexKey(point));
		if (types.length) state.pendingCandidates = forcedVertexCompletionCandidates(state.virtual, point, types, state.structuralOptions, state.searchContext);
		return null;
	}
	return null;
}

function finishStructuralFrontier(state) {
	return {
		forced: state.forced,
		unresolved: [],
		all: state.forced,
		virtualTiles: structuredClone(state.virtual.tiles),
		virtualFillabilityCache: new Map(),
		vertexTypes: [...state.vertexTypes],
		nextSerial: state.serial,
		domainCache: state.searchContext.cache,
		truncated: false,
	};
}

export function structuralPositionKey(tile) {
	const rotation = ((tile.rotation || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
	// 負の微小角は剰余で 2π 直前になる。同じ物理位置の 0 度と
	// 別キーになると、確定配置との重複として合法候補を落としてしまう。
	const canonicalRotation = Math.min(rotation, Math.PI * 2 - rotation) < EPSILON ? 0 : rotation;
	return `${tile.shape}:${Math.round(tile.centerX / EPSILON)}:${Math.round(tile.centerY / EPSILON)}:${Math.round(canonicalRotation / EPSILON)}`;
}

function emptyPlacementFrontier() { return { forced: [], unresolved: [], all: [], domainCache: new Map(), truncated: false }; }
function cloneBoard(board) {
	const result = new Board(board.side);
	result.tiles = structuredClone(board.tiles);
	return result;
}
function boardFromTiles(side, tiles) {
	const result = new Board(side);
	result.tiles = structuredClone(tiles);
	return result;
}
function nextStructuralSerial(tiles) {
	let next = 0;
	for (const tile of tiles) {
		const match = /^__inferred-(\d+)-/.exec(tile.id || '');
		if (match) next = Math.max(next, Number(match[1]) + 1);
	}
	return next;
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

// 頂点型探索の優先順位。識別列は頂点列全体との完全一致ではなく、時計回りの
// 連続部分として含まれれば確定する。たとえば HC は C を含むため star、
// GBH は BH を含むため ace として扱う。4タイル列の BDGG / GGBD は型自体は
// 曖昧でも、両方の完成形に共通するタイル位置があれば取り出す。
const STRUCTURAL_VERTEX_TYPE_PRIORITIES = [
	{ patterns: ['C'], types: ['star'] },
	{ patterns: ['AA'], types: ['deuce'] },
	{ patterns: ['FH'], types: ['star'] },
	{ patterns: ['HF', 'BH', 'FD'], types: ['ace'] },
	{ patterns: ['AEE', 'EEA', 'EAE'], types: ['jack'] },
	// DGG / GGB は型そのものは一意にならないが、king / queen の両方に
	// 共通するスロットを確定させられる。
	{ patterns: ['DGG', 'GGB'], types: ['king', 'queen'] },
	{ patterns: ['EEEE'], types: ['moon'] },
	{ patterns: ['DGGG', 'GGGB'], types: ['king'] },
	{ patterns: ['BDGB', 'DGBD', 'DGGB'], types: ['queen'] },
];

function structuralVertexTypesFor(sequence) {
	for (const { patterns, types } of STRUCTURAL_VERTEX_TYPE_PRIORITIES) if (patterns.some((pattern) => sequence.includes(pattern))) return types;
	return [];
}

// ひとつの頂点の周囲には、まだタイルで埋まっていない扇形が複数あり得る。
// それらを無視して頂点記号を単純に連結すると、本来は空白を挟む D と G を
// `DG` と誤認し、合法な候補を除外してしまう。確定探索は連続して接する
// タイル列だけを識別列として使う。
function structuralVertexTypesAt(board, point) {
	const runs = contiguousVertexRunsAt(board, null, point);
	for (const { patterns, types } of STRUCTURAL_VERTEX_TYPE_PRIORITIES) {
		if (runs.some((sequence) => patterns.some((pattern) => sequence.includes(pattern)))) return types;
	}
	return [];
}

// 頂点型のすべての完成方法を局所的に列挙し、その全ケースに共通する位置だけを
// 確定配置として返す。辺記号・地形・絶対禁則はここでは判定しない。
function forcedVertexCompletionCandidates(board, point, types, options, context) {
	const cacheKey = structuralCacheKey('forced', board, point, `${types.join(',')}|${structuralOptionKey(options)}`);
	const cached = cacheGet(context, cacheKey);
	if (cached) return cached;

	const completionPaths = [];
	for (const type of types) {
		const pattern = VERTEX_PATTERNS[type];
		const maxAdditionalTiles = pattern.length - board.vertexTiles(point).length;
		if (maxAdditionalTiles < 1) continue;
		completionPaths.push(...collectVertexCompletionPaths(board, point, pattern, options, maxAdditionalTiles, context));
	}
	if (!completionPaths.length) return cacheSet(context, cacheKey, []);
	const common = new Map(completionPaths[0].map((tile) => [structuralPositionKey(tile), tile]));
	for (const path of completionPaths.slice(1)) {
		const keys = new Set(path.map(structuralPositionKey));
		for (const key of common.keys()) if (!keys.has(key)) common.delete(key);
	}
	return cacheSet(context, cacheKey, [...common.values()]);
}

// `path` の前置きを都度コピーせず、同じ仮想盤面から同じ頂点型を埋める後続経路を
// キャッシュする。キーは盤面の全形状・幾何を正規化した完全一致キーなので、
// キャッシュの有無で確定結果は変化しない。
function collectVertexCompletionPaths(board, point, pattern, options, remaining, context) {
	const cacheKey = structuralCacheKey('paths', board, point, `${pattern}|${remaining}|${structuralOptionKey(options)}`);
	const cached = cacheGet(context, cacheKey);
	if (cached) return cached;

	const entries = vertexSectorsAt(board, null, point);
	if (entries.length === pattern.length) return cacheSet(context, cacheKey, vertexPatternFitsEntries(entries, pattern) ? [[]] : []);
	if (remaining <= 0 || !vertexPatternFitsEntries(entries, pattern)) return cacheSet(context, cacheKey, []);
	const nextVertexIds = nextVertexIdsForPattern(entries, pattern);
	const paths = [];
	for (const candidate of structuralVertexCandidates(board, point, pattern, options, nextVertexIds, context)) {
		const next = boardWithTile(board, candidate);
		for (const suffix of collectVertexCompletionPaths(next, point, pattern, options, remaining - 1, context)) paths.push([candidate, ...suffix]);
	}
	return cacheSet(context, cacheKey, paths);
}

function structuralVertexCandidates(board, point, pattern, options, allowedVertexIds, context) {
	const allowedKey = [...allowedVertexIds].sort().join('');
	const cacheKey = structuralCacheKey('candidates', board, point, `${pattern}|${allowedKey}|${structuralOptionKey(options)}`);
	const cached = cacheGet(context, cacheKey);
	if (cached) return cached;

	const candidates = new Map();
	for (const option of options) for (const vertexId of Object.keys(localVertices(option.shape, board.side))) {
		if (!allowedVertexIds.has(vertexId)) continue;
		const localVertex = localVertices(option.shape, board.side)[vertexId];
		for (let step = 0; step < 20; step++) {
			const rotation = step * Math.PI / 10;
			const cos = Math.cos(rotation), sin = Math.sin(rotation);
			const rotated = { x: localVertex.x * cos - localVertex.y * sin, y: localVertex.x * sin + localVertex.y * cos };
			const candidate = {
				...option,
				id: `__vertex-${vertexId}-${step}`,
				centerX: point.x - rotated.x,
				centerY: point.y - rotated.y,
				rotation,
			};
			if (board.overlaps(candidate) || !hasAdjacentEdge(board, candidate)) continue;
			if (!vertexPatternsAllow(board, candidate)) continue;
			if (!vertexPatternFitsEntries(vertexSectorsAt(board, candidate, point), pattern)) continue;
			candidates.set(structuralPositionKey(candidate), candidate);
		}
	}
	return cacheSet(context, cacheKey, [...candidates.values()]);
}

const STRUCTURAL_CACHE_LIMIT = 12000;
function createStructuralSearchContext(previousCache) {
	// 前回のフロンティアは、その後に読み返されない。Map 自体を引き継げば、
	// 大きくなったキャッシュを毎手番コピーするコストも発生しない。
	return { cache: previousCache instanceof Map ? previousCache : new Map() };
}
function structuralOptionKey(options) { return options.map((option) => option.shape).sort().join(','); }
function structuralCacheKey(kind, board, point, detail) {
	return `${kind}|${board.geometrySignature()}|${vertexKey(point)}|${detail}`;
}
function cacheGet(context, key) { return context.cache.get(key); }
function cacheSet(context, key, value) {
	// 上限超過時もキャッシュを捨てるだけで、探索結果そのものは変わらない。
	if (context.cache.size >= STRUCTURAL_CACHE_LIMIT) context.cache.clear();
	context.cache.set(key, value);
	return value;
}
function commitVirtualTile(board, candidate, serial) {
	applyResolvedMatchingPatternDomains(board, candidate);
	const tile = { ...candidate, id: `__inferred-${serial}-${candidate.shape}` };
	board.add(tile);
	return board.getTile(tile.id);
}
function matchingPlacementCandidates(board, rawTile, targets, options) {
	const results = new Map();
	for (const terrainTile of terrainPatternVariants(rawTile, options.allowTerrainHalfTurn, options.allowTerrainMirror))
		for (const base of terrainPlacementCandidates(board, terrainTile, targets)) {
			const candidate = resolveMatchingPatterns(board, base, options);
			if (candidate) results.set(placementKey(candidate), candidate);
		}
	return [...results.values()];
}

// 手札は通常向きの地形データを保持し、候補生成時だけ独立した地形パターンを
// 展開する。辺記号の `matchingPattern` はここでは触らない。
function terrainPatternVariants(rawTile, allowTerrainHalfTurn, allowTerrainMirror) {
	const allowed = allowTerrainHalfTurn ? ['normal', 'halfTurn'] : ['normal'];
	// `terrainPatternOptions` がない生のタイル定義は、開始前設定で許す全状態を
	// 持つものとして扱う。配置済みのタイルをここへ渡す用途はない。
	const requested = Array.isArray(rawTile.terrainPatternOptions)
		? rawTile.terrainPatternOptions
		: allowed;
	const patterns = requested.filter((pattern) => allowed.includes(pattern));
	const rotations = patterns.map((pattern) => {
		if (pattern === 'halfTurn') return halfTurnTerrainTile(rawTile);
		return { ...rawTile, terrainPattern: 'normal', terrainPatternOptions: ['normal'] };
	});
	// 左右反転は地形・特徴領域だけの別状態として、180度回転と直積で評価する。
	// rawTile 自体が反転済みでも mirrorTile() は元向きへ戻るため、常に両状態が揃う。
	return allowTerrainMirror ? [...rotations, ...rotations.map((tile) => mirrorTile(tile))] : rotations;
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
	return edgesFor(tile, board.side).some((edge) => board.matchingEdges(edge).length > 0);
}

function allSharedTerrainMatch(board, tile) {
	for (const edge of edgesFor(tile, board.side)) {
		const neighbors = board.matchingEdges(edge);
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
function placementKey(tile) {
	return `${Math.round(tile.centerX / EPSILON)}:${Math.round(tile.centerY / EPSILON)}:${Math.round(tile.rotation / EPSILON)}:${tile.terrainPattern || 'normal'}:${tile.mirrored ? 'mirror' : 'normal'}`;
}

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
	const reduced = propagateMatchingDomains(domains, constraints, byId);
	// 辺ごとの局所整合性だけでは、閉路上のパターン矛盾を検出できない。
	// 例: 各辺だけを見ると候補があるが、全タイルへ同時に normal / 180度
	// パターンを割り当てられない場合。候補表示には全体で少なくとも1通りの
	// 割当が必要なので、ここで二値 CSP の充足可能性を確認する。
	if (!reduced || !matchingDomainsSatisfiable(reduced, constraints, byId)) return null;
	return Object.fromEntries([...reduced].map(([id, patterns]) => [id, patterns]));
}

function propagateMatchingDomains(initialDomains, constraints, byId) {
	const domains = new Map([...initialDomains].map(([id, patterns]) => [id, [...patterns]]));
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
	return domains;
}

function matchingDomainsSatisfiable(domains, constraints, byId) {
	const reduced = propagateMatchingDomains(domains, constraints, byId);
	if (!reduced) return false;
	let selected = null;
	for (const [id, patterns] of reduced) if (patterns.length > 1) {
		// 接続数の多いタイルから確定すると、矛盾を早く検出できる。
		const degree = constraints.filter((constraint) => constraint.leftId === id || constraint.rightId === id).length;
		if (!selected || degree > selected.degree) selected = { id, patterns, degree };
	}
	if (!selected) return true;
	return selected.patterns.some((pattern) => {
		const branch = new Map([...reduced].map(([id, values]) => [id, id === selected.id ? [pattern] : [...values]]));
		return matchingDomainsSatisfiable(branch, constraints, byId);
	});
}
function matchingEdgeConstraints(tiles, side) {
	// 全辺の総当たりではなく、正規化した辺座標で同じ辺だけをまとめる。
	// 構造候補のたびに呼ばれるため、盤面が広がった時の O(E²) を避ける。
	const byEdge = new Map(), constraints = [];
	for (const tile of tiles) for (const edge of edgesFor(tile, side)) {
		const key = freeEdgeKey(edge), entries = byEdge.get(key) || [];
		entries.push({ tile, edge });
		byEdge.set(key, entries);
	}
	for (const entries of byEdge.values()) for (let left = 0; left < entries.length; left++) for (let right = left + 1; right < entries.length; right++) {
		const one = entries[left], two = entries[right];
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
		const entries = vertexSectorsAt(board, candidate, point);
		if (!Object.values(VERTEX_PATTERNS).some((pattern) => vertexPatternFitsEntries(entries, pattern))) return false;
	}
	return true;
}

// 識別列が現れた頂点は、対応する頂点型の循環順列にだけ進める。
export function forcedVertexTypesAllow(board, candidate, assignedTypes = null) {
	for (const point of Object.values(verticesFor(candidate, board.side))) {
		const type = vertexTypeAt(board, point, assignedTypes);
		if (type && !vertexPatternFitsEntries(vertexSectorsAt(board, candidate, point), VERTEX_PATTERNS[type])) return false;
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
	const entries = vertexSectorsAt(board, null, point);
	const possible = Object.entries(VERTEX_PATTERNS)
		.filter(([, pattern]) => vertexPatternFitsEntries(entries, pattern))
		.map(([type]) => type);
	return possible.length === 1 ? possible[0] : null;
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
export function vertexSequenceAt(board, candidate, point) {
	return clockwiseVertexEntries(board, candidate, point).map(({ vertexId }) => vertexId).join('');
}

// 部分的に埋まった頂点は、最大の「未占有の扇形」の直後から時計回りに読む。
// タイル中心どうしの角度差で空白を選ぶと、144度の A/C と36度の B/D の
// 境界のように、実際には接している大きな扇形を空白と誤認してしまう。
// 各頂点が占有する扇形の端を使うことで、DGGGG など混在した頂点型も
// 一貫した順列として扱える。
function vertexSectorsAt(board, candidate, point) {
	const entries = [];
	const addEntry = (tile, vertexId, vertex) => {
		// 画面座標系では atan2 の昇順が時計回りになる。ひし形は各頂点で
		// 中心方向が内角の二等分線なので、中心角±内角/2 が扇形境界になる。
		const direction = Math.atan2(tile.centerY - point.y, tile.centerX - point.x);
		const vertexAngle = vertexInteriorAngle(tile.shape, vertexId);
		const start = normalizeAngle(direction - vertexAngle / 2);
		entries.push({ vertexId, direction, start, end: start + vertexAngle });
	};
	for (const { tile, vertexId, vertex } of board.vertexEntries(point)) addEntry(tile, vertexId, vertex);
	if (candidate) for (const [vertexId, vertex] of Object.entries(verticesFor(candidate, board.side))) if (samePoint(vertex, point)) addEntry(candidate, vertexId, vertex);
	entries.sort((left, right) => left.start - right.start);
	return entries;
}

function clockwiseVertexEntries(board, candidate, point) {
	const entries = vertexSectorsAt(board, candidate, point);
	if (entries.length < 2) return entries;
	let largestGap = -Infinity, start = 0;
	for (let index = 0; index < entries.length; index++) {
		const currentEnd = entries[index].end;
		const nextStart = entries[(index + 1) % entries.length].start + (index + 1 === entries.length ? Math.PI * 2 : 0);
		if (nextStart - currentEnd > largestGap) {
			largestGap = nextStart - currentEnd;
			start = (index + 1) % entries.length;
		}
	}
	return entries.slice(start).concat(entries.slice(0, start));
}

function contiguousVertexRunsAt(board, candidate, point) {
	const entries = vertexSectorsAt(board, candidate, point);
	if (!entries.length) return [];
	const gaps = [];
	for (let index = 0; index < entries.length; index++) {
		const currentEnd = entries[index].end;
		const nextStart = entries[(index + 1) % entries.length].start + (index + 1 === entries.length ? Math.PI * 2 : 0);
		if (nextStart - currentEnd > EPSILON) gaps.push(index);
	}
	if (!gaps.length) return [entries.map(({ vertexId }) => vertexId).join('')];
	return gaps.map((gapIndex) => {
		const run = [];
		for (let index = (gapIndex + 1) % entries.length; ; index = (index + 1) % entries.length) {
			run.push(entries[index].vertexId);
			if (gaps.includes(index)) break;
		}
		return run.join('');
	});
}

// 頂点型と既存タイルの「角度上の配置」を照合する。
// 頂点記号だけを並べる方式と違い、未配置の扇形を跨いで既存タイルを
// 隣接扱いにしないため、離れた二つのタイルがある外周でも合法配置を
// 取りこぼさない。
function vertexPatternFitsEntries(entries, pattern) {
	if (entries.length > pattern.length) return false;
	if (!entries.length) return true;
	return matchingPatternOffsets(entries, pattern).length > 0;
}

function nextVertexIdsForPattern(entries, pattern) {
	const slots = vertexPatternSlots(pattern), ids = new Set();
	for (const offset of matchingPatternOffsets(entries, pattern, slots)) for (const entry of entries) {
		const index = matchingSlotIndex(entry, slots, offset);
		if (index < 0) continue;
		ids.add(slots[(index + 1) % slots.length].vertexId);
		ids.add(slots[(index - 1 + slots.length) % slots.length].vertexId);
	}
	return ids;
}

function matchingPatternOffsets(entries, pattern, providedSlots = null) {
	const slots = providedSlots || vertexPatternSlots(pattern), offsets = new Set();
	for (const entry of entries) for (const anchor of slots) {
		if (anchor.vertexId !== entry.vertexId) continue;
		const offset = normalizeAngle(entry.start - anchor.start);
		if (entries.every((current) => matchingSlotIndex(current, slots, offset) >= 0)) offsets.add(Math.round(offset / EPSILON));
	}
	return [...offsets].map((value) => value * EPSILON);
}

function matchingSlotIndex(entry, slots, offset) {
	return slots.findIndex((slot) => slot.vertexId === entry.vertexId && sameAngle(entry.start, offset + slot.start));
}

function vertexPatternSlots(pattern) {
	const slots = [];
	let start = 0;
	for (const vertexId of pattern) {
		const width = vertexInteriorAngle(vertexId >= 'E' ? 'fat' : 'thin', vertexId);
		slots.push({ vertexId, start, width });
		start += width;
	}
	return slots;
}

function sameAngle(one, two) {
	const full = Math.PI * 2;
	const difference = ((one - two + Math.PI) % full + full) % full - Math.PI;
	return Math.abs(difference) < EPSILON;
}

function normalizeAngle(value) {
	const full = Math.PI * 2;
	return ((value % full) + full) % full;
}

function vertexInteriorAngle(shape, vertexId) {
	if (shape === 'thin') return (vertexId === 'A' || vertexId === 'C') ? Math.PI * 4 / 5 : Math.PI / 5;
	return (vertexId === 'E' || vertexId === 'G') ? Math.PI * 2 / 5 : Math.PI * 3 / 5;
}

export function isCyclicSegment(sequence, pattern) {
	if (!sequence || sequence.length > pattern.length) return false;
	const circular = pattern + pattern;
	for (let start = 0; start < pattern.length; start++) if (circular.slice(start, start + sequence.length) === sequence) return true;
	return false;
}

export function edgeSymbolFor(shape, edgeName, matchingPattern = 'normal') { return edgeMatchesFor(shape, matchingPattern)[edgeName]; }

export function isLegalPlacement(board, tile, { allowVerticalMatchingPattern = true, allowTerrainHalfTurn = true, ignoreMatchingRules = false } = {}) {
	// 候補には未確定の周辺タイルへ採用するパターンも記録されるため、ここでも
	// 改めて全組合せを解き直して検証する。
	const resolved = ignoreMatchingRules || resolveMatchingPatterns(board, tile, { allowVerticalMatchingPattern });
	return Boolean(
		(allowTerrainHalfTurn || (tile.terrainPattern || 'normal') === 'normal')
		&& resolved
		&& !board.overlaps(tile)
		&& hasAdjacentEdge(board, tile)
		&& allSharedTerrainMatch(board, tile),
	);
}

export function featureCanReceiveMeeple(board, state, tile, type, index) {
	const component = type === 'field' ? board.fieldScoreComponent(tile, index) : board.component(tile, type, index);
	return !component.features.some(({ tile: featureTile, index: featureIndex }) => state.meeples[board.featureRef(featureTile, type, featureIndex)]);
}

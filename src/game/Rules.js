import { Board } from './Board.js';
import { arrowFor, arrowPatterns, edgeVertexPairs, edgesFor, localVertices, verticesFor } from './Tile.js';

const EPSILON = 1e-5;
const samePoint = (a, b) => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
const angle = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

export function placementCandidates(board, rawTile, { targets = board.freeEdges(), preventUnfillableGaps = false, tileOptions = [], fillabilityCache = null } = {}) {
	const legal = arrowPlacementCandidates(board, rawTile, targets);
	if (!preventUnfillableGaps) return legal;
	return legal.filter((candidate) => fillabilityClass(board, candidate, tileOptions, fillabilityCache) === 'regular');
}

// 絶対禁則（物理的に埋められない）は常に除外する。相対禁則は矢印だけが原因で
// 将来の空き辺を満たせない候補であり、何度でも配置できる。
export function placementCandidateGroups(board, rawTile, { targets = board.freeEdges(), tileOptions = [], fillabilityCache = null, allowRelativePlacement = true, allowArrowOverride = false } = {}) {
	const regular = [], relative = [], relativeBlocked = [], arrowOverride = [];
	const allGeometry = terrainPlacementCandidates(board, rawTile, targets);
	const legalByGeometry = new Map();
	for (const candidate of arrowPlacementCandidates(board, rawTile, targets)) legalByGeometry.set(placementKey(candidate), candidate);
	for (const geometry of allGeometry) {
		const legal = legalByGeometry.get(placementKey(geometry));
		const candidate = legal || chooseArrowOverridePattern(board, geometry);
		const kind = fillabilityClass(board, candidate, tileOptions, fillabilityCache);
		if (kind === 'absolute') continue;
		if (legal) {
			if (kind === 'regular') regular.push(legal);
			else if (allowRelativePlacement) relative.push(legal);
			else relativeBlocked.push(legal);
		} else if (allowArrowOverride && sharedEdgeCount(board, candidate) >= 3) {
			arrowOverride.push({ ...candidate, _ignoresArrowMatching: true });
		}
	}
	return { regular, relative, relativeBlocked, arrowOverride };
}

function terrainPlacementCandidates(board, rawTile, targets) {
	return geometricPlacementCandidates(board, rawTile, targets, { requireTerrain: true, requireArrows: false });
}
function arrowPlacementCandidates(board, rawTile, targets) {
	return geometricPlacementCandidates(board, rawTile, targets, { requireTerrain: true, requireArrows: true });
}
function geometricPlacementCandidates(board, rawTile, targets, { requireTerrain, requireArrows }) {
	const results = new Map();
	for (const { edge: targetEdge } of targets) for (const sourceEdge of edgesFor({ ...rawTile, centerX: 0, centerY: 0, rotation: 0 }, board.side)) {
		if (requireTerrain && sourceEdge.terrain !== targetEdge.terrain) continue;
		const rotation = angle(targetEdge.b, targetEdge.a) - angle(sourceEdge.a, sourceEdge.b);
		const local = localVertices(rawTile.shape, board.side), pairs = edgeVertexPairs(rawTile.shape), [sourceA, sourceB] = pairs[sourceEdge.index];
		const rotate = (point) => ({ x: point.x * Math.cos(rotation) - point.y * Math.sin(rotation), y: point.x * Math.sin(rotation) + point.y * Math.cos(rotation) });
		const midpoint = { x: (targetEdge.a.x + targetEdge.b.x) / 2, y: (targetEdge.a.y + targetEdge.b.y) / 2 };
		const localMid = rotate({ x: (local[sourceA].x + local[sourceB].x) / 2, y: (local[sourceA].y + local[sourceB].y) / 2 });
		const base = { ...rawTile, centerX: midpoint.x - localMid.x, centerY: midpoint.y - localMid.y, rotation };
		if (board.overlaps(base) || !hasAdjacentEdge(board, base)) continue;
		// 生成起点以外の辺にも同時に接する場合がある。矢印無視権で
		// 例外にできるのは矢印だけであり、地形不一致は候補に含めない。
		if (requireTerrain && !allSharedTerrainMatch(board, base)) continue;
		const candidate = requireArrows ? resolveArrowPatterns(board, base) : base;
		if (candidate) results.set(placementKey(candidate), candidate);
	}
	return [...results.values()];
}
function hasAdjacentEdge(board, tile) {
	return edgesFor(tile, board.side).some((edge) => board.allEdges().some(({ edge: other }) => samePoint(edge.a, other.b) && samePoint(edge.b, other.a)));
}
function sharedEdgeCount(board, tile) {
	return edgesFor(tile, board.side).filter((edge) =>
		board.allEdges().some(({ edge: other }) => samePoint(edge.a, other.b) && samePoint(edge.b, other.a)),
	).length;
}
function allSharedTerrainMatch(board, tile) {
	for (const edge of edgesFor(tile, board.side)) {
		const neighbors = board.allEdges().filter(({ edge: other }) => samePoint(edge.a, other.b) && samePoint(edge.b, other.a));
		if (neighbors.some(({ edge: other }) => other.terrain !== edge.terrain)) return false;
	}
	return true;
}

// absolute: 一方の形状も重ならずに入らない辺がある。
// relative: 物理的には入るが、矢印マッチングを満たす形状がない辺がある。
function fillabilityClass(board, placedTile, tileOptions, fillabilityCache) {
	const hypothetical = boardWithTile(board, placedTile), options = distinctTileOptions(tileOptions);
	const before = new Map(board.freeEdges().map((freeEdge) => [freeEdgeKey(freeEdge.edge), freeEdgeStatus(board, freeEdge, options, fillabilityCache)]));
	let relative = false;
	for (const freeEdge of hypothetical.freeEdges()) {
		const previous = before.get(freeEdgeKey(freeEdge.edge));
		// 既存の相対禁則は次手番の候補を相対禁則にしない。
		if (previous && previous.matching === false) continue;
		const status = freeEdgeStatus(hypothetical, freeEdge, options, fillabilityCache, placedTile);
		if (!status.physical) return 'absolute';
		if (!status.matching) relative = true;
	}
	return relative ? 'relative' : 'regular';
}
function boardWithTile(board, tile) { const hypothetical = new Board(board.side); hypothetical.tiles = [...board.tiles, tile]; return hypothetical; }
function freeEdgeStatus(board, freeEdge, options, cache, placedTile = null) {
	const key = freeEdgeKey(freeEdge.edge), cached = cache?.get(key);
	if (!placedTile && cached !== undefined) return normalizeStatus(cached);
	if (placedTile && !edgeIsNearPlacedTile(freeEdge, placedTile, board.side) && cached !== undefined) return normalizeStatus(cached);
	return { physical: Boolean(findWitness(board, freeEdge, options, false)), matching: Boolean(findWitness(board, freeEdge, options, true)) };
}
function normalizeStatus(value) {
	if (value && typeof value === 'object' && 'physical' in value) return value;
	return { physical: Boolean(value), matching: Boolean(value) };
}
function edgeIsNearPlacedTile(freeEdge, placedTile, side) {
	if (freeEdge.tile.id === placedTile.id) return true;
	const midpoint = { x: (freeEdge.edge.a.x + freeEdge.edge.b.x) / 2, y: (freeEdge.edge.a.y + freeEdge.edge.b.y) / 2 };
	return Math.hypot(midpoint.x - placedTile.centerX, midpoint.y - placedTile.centerY) <= side * 3.05;
}
export function createFillabilityCache(board, tileOptions) {
	const options = distinctTileOptions(tileOptions), cache = new Map();
	for (const freeEdge of board.freeEdges()) cache.set(freeEdgeKey(freeEdge.edge), freeEdgeStatus(board, freeEdge, options));
	return cache;
}
export function updateFillabilityCache(board, placedTile, tileOptions, previous = new Map()) {
	const options = distinctTileOptions(tileOptions), next = new Map();
	for (const freeEdge of board.freeEdges()) next.set(freeEdgeKey(freeEdge.edge), freeEdgeStatus(board, freeEdge, options, previous, placedTile));
	return next;
}
function distinctTileOptions(tileOptions) { const unique = new Map(); for (const tile of tileOptions) if (!unique.has(tile.shape)) unique.set(tile.shape, tile); return [...unique.values()]; }
function findWitness(board, freeEdge, options, requireArrows) {
	for (const option of options) {
		const candidate = geometricPlacementCandidates(board, option, [freeEdge], { requireTerrain: false, requireArrows })[0];
		if (candidate) return candidate;
	}
	return null;
}
function freeEdgeKey(edge) { const pointKey = (point) => `${Math.round(point.x / EPSILON)}:${Math.round(point.y / EPSILON)}`; return [pointKey(edge.a), pointKey(edge.b)].sort().join('|'); }
function placementKey(tile) { return `${Math.round(tile.centerX / EPSILON)}:${Math.round(tile.centerY / EPSILON)}:${Math.round(tile.rotation / EPSILON)}`; }

export function resolveArrowPatterns(board, rawTile) {
	const unresolved = board.tiles.filter((tile) => !tile.arrowPattern);
	const combinations = unresolved.reduce((all, tile) => all.flatMap((patterns) => arrowPatterns(tile.shape).map((pattern) => [...patterns, [tile.id, pattern]])), [[]]);
	for (const arrowPattern of arrowPatterns(rawTile.shape)) for (const assignments of combinations) {
		const assignmentMap = new Map(assignments), tile = { ...rawTile, arrowPattern };
		if (allSharedEdgesMatch(board, tile, assignmentMap)) return { ...tile, resolvedArrowPatterns: Object.fromEntries(assignments) };
	}
	return null;
}
// 矢印無視配置後も、以後の候補判定に必要な矢印パターンは確定する。最多一致を採用する。
function chooseArrowOverridePattern(board, rawTile) {
	let best = null;
	for (const pattern of arrowPatterns(rawTile.shape)) {
		const tile = { ...rawTile, arrowPattern: pattern };
		let matches = 0;
		for (const edge of edgesFor(tile, board.side)) for (const { tile: otherTile, edge: other } of board.allEdges())
			if (samePoint(edge.a, other.b) && samePoint(edge.b, other.a) && otherTile.arrowPattern && arrowsMatch(tile, edge, otherTile, other)) matches++;
		if (!best || matches > best.matches) best = { ...tile, matches };
	}
	return best;
}
function allSharedEdgesMatch(board, tile, assignments = new Map()) {
	for (const edge of edgesFor(tile, board.side)) for (const { tile: otherTile, edge: other } of board.allEdges()) {
		if (!samePoint(edge.a, other.b) || !samePoint(edge.b, other.a)) continue;
		const otherPattern = assignments.get(otherTile.id) || otherTile.arrowPattern;
		if (!otherPattern || !arrowsMatch(tile, edge, { ...otherTile, arrowPattern: otherPattern }, other)) return false;
	}
	return true;
}
export function arrowsMatch(tile, edge, otherTile, otherEdge) {
	const one = arrowFor(tile, edge.name), two = arrowFor(otherTile, otherEdge.name);
	if (!one || !two || one.heads !== two.heads) return false;
	const vertices = verticesFor(tile, 1), otherVertices = verticesFor(otherTile, 1);
	const vector = (points, arrow) => ({ x: points[arrow.to].x - points[arrow.from].x, y: points[arrow.to].y - points[arrow.from].y });
	const a = vector(vertices, one), b = vector(otherVertices, two), length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
	return length > EPSILON && (a.x * b.x + a.y * b.y) / length > 1 - EPSILON;
}
export function isLegalPlacement(board, tile, { ignoreArrowMatching = false } = {}) {
	const resolved = ignoreArrowMatching ? chooseArrowOverridePattern(board, tile) : (tile.arrowPattern ? tile : resolveArrowPatterns(board, tile));
	if (!resolved || board.overlaps(tile)) return false;
	let adjacent = false;
	for (const edge of edgesFor(tile, board.side)) {
		const matches = board.allEdges().filter(({ edge: other }) => samePoint(edge.a, other.b) && samePoint(edge.b, other.a));
		if (!matches.length) continue;
		adjacent = true;
		if (matches.some(({ tile: otherTile, edge: other }) => other.terrain !== edge.terrain || (!ignoreArrowMatching && !arrowsMatch(resolved, edge, { ...otherTile, arrowPattern: resolved.resolvedArrowPatterns?.[otherTile.id] || otherTile.arrowPattern }, other)))) return false;
	}
	return adjacent;
}
export function featureCanReceiveMeeple(board, state, tile, type, index) {
	const component = type === 'field' ? board.fieldScoreComponent(tile, index) : board.component(tile, type, index);
	return !component.features.some(({ tile: featureTile, index: featureIndex }) => state.meeples[board.featureRef(featureTile, type, featureIndex)]);
}

import { edgeIndex, edgesFor, verticesFor } from '../game/Tile.js';

export function featureAnchor(tile, type, index, side) {
	const edges = edgesFor(tile, side), group = tile.featureGroups[type]?.[index], names = Array.isArray(group) ? group : group?.boundaryEdges || [];
	const manualAnchor = manualAnchorForFeature(tile, type, index);
	if (manualAnchor) return transformAnchor(tile, manualAnchor, side);
	if (!names.length) return { x: tile.centerX, y: tile.centerY };
	const midpoints = names
		.map((name) => edges.find((edge) => edge.name === name))
		.filter(Boolean)
		.map((edge) => ({ x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 }));
	if (!midpoints.length) return { x: tile.centerX, y: tile.centerY };
	const average = midpoints.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
	const inset = type === 'road' ? .42 : .63;
	return {
		x: tile.centerX + (average.x / midpoints.length - tile.centerX) * inset,
		y: tile.centerY + (average.y / midpoints.length - tile.centerY) * inset,
	};
}

export function fieldScoreAnchor(tile, index, side) {
	if (manualAnchorForFeature(tile, 'field', index)) return featureAnchor(tile, 'field', index, side);
	const points = Object.values(verticesFor(tile, side)), regions = tile.fieldScoreGroups[index] || [];
	const blockers = ['city', 'road'].flatMap((type) => (tile.featureGroups[type] || []).map((_, featureIndex) => featureAnchor(tile, type, featureIndex, side)));
	const candidates = regions.flatMap((region) => {
		const regionIndex = region - 1, vertex = points[regionIndex], previous = points[(regionIndex + 3) % 4], next = points[(regionIndex + 1) % 4];
		const previousMidpoint = midpoint(previous, vertex), nextMidpoint = midpoint(vertex, next);
		return [[.1, .2, .5, .2], [.1, .35, .4, .15], [.1, .15, .4, .35]].map(([centerWeight, previousWeight, vertexWeight, nextWeight]) => ({
			x: tile.centerX * centerWeight + previousMidpoint.x * previousWeight + vertex.x * vertexWeight + nextMidpoint.x * nextWeight,
			y: tile.centerY * centerWeight + previousMidpoint.y * previousWeight + vertex.y * vertexWeight + nextMidpoint.y * nextWeight,
		}));
	});
	if (!candidates.length) return { x: tile.centerX, y: tile.centerY };
	return candidates.reduce((best, candidate) => {
		const clearance = (point) => blockers.length ? Math.min(...blockers.map((blocker) => Math.hypot(point.x - blocker.x, point.y - blocker.y))) : Infinity;
		return clearance(candidate) > clearance(best) ? candidate : best;
	});
}

export function markerForFeature(tile, option, side) {
	if (option.type === 'monastery') return { ...featureAnchor(tile, 'monastery', option.index, side), option };
	if (option.type === 'field' && tile.fieldScoreGroups?.[option.index]) return { ...fieldScoreAnchor(tile, option.index, side), option };
	return { ...featureAnchor(tile, option.type, option.index, side), option };
}

// featureGroups.field[].anchor は従来の記法として残す。
// 道・都市を含む全特徴の手動座標は、tile.featureAnchors へ同じ添字で指定できる。
export function manualAnchorForFeature(tile, type, index) {
	const group = tile.featureGroups?.[type]?.[index];
	return tile.featureAnchors?.[type]?.[index]
		|| (!Array.isArray(group) ? group?.anchor : null)
		|| null;
}

export function featureEdgeNumbers(tile, type, index) {
	const group = tile.featureGroups[type]?.[index], edges = Array.isArray(group) ? group : group?.boundaryEdges || [];
	return edges.map(edgeIndex).filter((edge) => edge >= 0).map((edge) => edge + 1);
}

function transformAnchor(tile, anchor, side) {
	const x = anchor.x * side, y = anchor.y * side, cos = Math.cos(tile.rotation || 0), sin = Math.sin(tile.rotation || 0);
	return { x: tile.centerX + x * cos - y * sin, y: tile.centerY + x * sin + y * cos };
}
function midpoint(left, right) { return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }; }

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrototypeDeck } from '../src/game/TileSet.js';
import { edgeIndex, edgeVertexPairs, localVertices } from '../src/game/Tile.js';
import { tileAssetFilename } from '../src/ui/TileTheme.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 240;
const themes = {
	meadow: { field: '#a8c97b', fieldLine: '#d4e7b1', road: '#c99961', roadLine: '#7d5837', city: '#bd6255', cityLine: '#7b413c', special: '#d9b462' },
	cyber: { field: '#234f54', fieldLine: '#3a8984', road: '#dd9b4d', roadLine: '#734322', city: '#b94f86', cityLine: '#721c52', special: '#a9ecdf' },
};

function pointsFor(shape) {
	const local = localVertices(shape, 1), scale = SIZE / 2;
	return Object.fromEntries(Object.entries(local).map(([id, point]) => [id, { x: SIZE / 2 + point.x * scale, y: SIZE / 2 + point.y * scale }]));
}
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function polygon(points) { return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '); }
function baseSvg(content) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${content}</svg>`; }
function fieldSvg(tile, index, colors) {
	const points = pointsFor(tile.shape), ids = Object.keys(points), pairs = edgeVertexPairs(tile.shape), center = { x: SIZE / 2, y: SIZE / 2 };
	const regions = tile.fieldScoreGroups[index] || [];
	const polygons = regions.map((region) => {
		const vertex = region - 1, previous = (vertex + 3) % 4, next = (vertex + 1) % 4;
		return `<polygon points="${polygon([center, midpoint(points[ids[previous]], points[ids[vertex]]), points[ids[vertex]], midpoint(points[ids[vertex]], points[ids[next]])])}"/>`;
	});
	return baseSvg(`<g fill="${colors.field}" stroke="${colors.fieldLine}" stroke-width="2" opacity=".94">${polygons.join('')}</g>`);
}
function roadSvg(tile, index, colors) {
	const points = pointsFor(tile.shape), pairs = edgeVertexPairs(tile.shape), group = tile.featureGroups.road[index] || [], center = { x: SIZE / 2, y: SIZE / 2 };
	const paths = group.map((name) => {
		const [a, b] = pairs[edgeIndex(name)], from = midpoint(points[a], points[b]);
		return `M ${from.x} ${from.y} Q ${(from.x + center.x) / 2} ${(from.y + center.y) / 2} ${center.x} ${center.y}`;
	});
	return baseSvg(`<g fill="none" stroke-linecap="round"><path d="${paths.join(' ')}" stroke="${colors.road}" stroke-width="22"/><path d="${paths.join(' ')}" stroke="${colors.roadLine}" stroke-width="3" opacity=".7"/></g>`);
}
function citySvg(tile, index, colors) {
	const points = pointsFor(tile.shape), pairs = edgeVertexPairs(tile.shape), group = tile.featureGroups.city[index] || [], center = { x: SIZE / 2, y: SIZE / 2 };
	const wedges = group.map((name) => {
		const [a, b] = pairs[edgeIndex(name)];
		return `<path d="M ${points[a].x} ${points[a].y} L ${points[b].x} ${points[b].y} Q ${center.x} ${center.y} ${points[a].x} ${points[a].y} Z"/>`;
	});
	return baseSvg(`<g fill="${colors.city}" stroke="${colors.cityLine}" stroke-width="2" opacity=".96">${wedges.join('')}</g>`);
}
function specialSvg(layer, colors) {
	if (layer === 'intersection') return baseSvg(`<circle cx="120" cy="120" r="14" fill="${colors.field}" stroke="${colors.roadLine}" stroke-width="4"/>`);
	return baseSvg(`<circle cx="120" cy="120" r="27" fill="${colors.special}" stroke="${colors.roadLine}" stroke-width="4"/><path d="M114 102h12v34h-12z" fill="${colors.roadLine}"/>`);
}
function svgFor(tile, layer, index, colors) {
	if (layer === 'field') return fieldSvg(tile, index, colors);
	if (layer === 'road') return roadSvg(tile, index, colors);
	if (layer === 'city') return citySvg(tile, index, colors);
	return specialSvg(layer, colors);
}
function layersFor(tile) {
	return [
		...(tile.fieldScoreGroups || []).map((_, index) => ['field', index]),
		...(tile.featureGroups.road || []).map((_, index) => ['road', index]),
		...(tile.featureGroups.city || []).map((_, index) => ['city', index]),
		...(Object.values(tile.roadTerminals || {}).some((items) => items.some((item) => item.kind === 'intersection')) ? [['intersection', 0]] : []),
		...(tile.hasMonastery ? [['monastery', 0]] : []),
	];
}

const sourceTiles = createPrototypeDeck(() => .5);
for (const [themeId, colors] of Object.entries(themes)) {
	const directory = join(root, 'assets', 'themes', themeId);
	mkdirSync(directory, { recursive: true });
	for (const tile of sourceTiles) for (const [layer, index] of layersFor(tile)) {
		const filename = tileAssetFilename(tile, layer, index).replace(/\.png$/, '.svg'), target = join(directory, filename);
		if (!existsSync(target)) writeFileSync(target, svgFor(tile, layer, index, colors));
	}
}

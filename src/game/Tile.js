export const SHAPES = {
	thin: {
		vertices: ['A', 'B', 'C', 'D'],
		angle: 72,
	},
	fat: {
		vertices: ['E', 'F', 'G', 'H'],
		angle: 36,
	},
};

// 辺は画面方向ではなく、頂点名の組で一意に表す。回転しても名前は変わらない。
export const EDGE_NAMES = {
	thin: ['AB', 'BC', 'CD', 'DA'],
	fat: ['EF', 'FG', 'GH', 'HE'],
};

export function edgeNames(shape) { return EDGE_NAMES[shape]; }

export function localVertices(shape, side) {
	const radians = (SHAPES[shape].angle * Math.PI) / 180;
	const a = side * Math.cos(radians);
	const b = side * Math.sin(radians);
	const [top, right, bottom, left] = SHAPES[shape].vertices;
	return {
		[top]: { x: 0, y: -a },
		[right]: { x: b, y: 0 },
		[bottom]: { x: 0, y: a },
		[left]: { x: -b, y: 0 },
	};
}

export function verticesFor(tile, side) {
  const local = localVertices(tile.shape, side);
	const cos = Math.cos(tile.rotation || 0),
		sin = Math.sin(tile.rotation || 0);
	return Object.fromEntries(
		Object.entries(local).map(([id, point]) => [
			id,
			{
				x: tile.centerX + point.x * cos - point.y * sin,
				y: tile.centerY + point.x * sin + point.y * cos,
			},
		]),
	);
}

// 辺記号は地形とは独立した形状マッチング用の情報である。
// `verticalInverse` は地形／カードを反転せず、記号だけを上下反転する。
const NORMAL_EDGE_MATCHES = {
	thin: {
		AB: 'beta-concave',
		BC: 'alpha-concave',
		CD: 'alpha-convex',
		DA: 'beta-convex',
	},
	fat: {
		EF: 'beta-concave',
		FG: 'alpha-convex',
		GH: 'alpha-concave',
		HE: 'beta-convex',
	},
};

const VERTICAL_SWAP = { thin: { A: 'C', C: 'A' }, fat: { E: 'G', G: 'E' } };
const canonicalEdgeName = (shape, one, two) => edgeNames(shape).find((name) => name.includes(one) && name.includes(two));
const MIRROR_EDGE_NAMES = {
	thin: { AB: 'DA', BC: 'CD', CD: 'BC', DA: 'AB' },
	fat: { EF: 'HE', FG: 'GH', GH: 'FG', HE: 'EF' },
};

export function matchingPatterns(shape) { return ['normal', 'verticalInverse']; }

export function edgeMatchesFor(shape, pattern = 'normal') {
	const normal = NORMAL_EDGE_MATCHES[shape];
	if (pattern !== 'verticalInverse') return structuredClone(normal);
	const swap = VERTICAL_SWAP[shape];
	const result = {};
	for (const [edgeName, symbol] of Object.entries(normal)) {
		const [from, to] = edgeName;
		result[canonicalEdgeName(shape, swap[from] || from, swap[to] || to)] = symbol;
	}
	return result;
}

export function edgeMatchFor(tile, edgeName) {
	const sourceEdge = tile.mirrored ? MIRROR_EDGE_NAMES[tile.shape][edgeName] : edgeName;
	return edgeMatchesFor(tile.shape, tile.matchingPattern || 'normal')[sourceEdge];
}

export function edgeSymbolsMatch(one, two) {
	const [oneFamily, onePolarity] = (one || '').split('-');
	const [twoFamily, twoPolarity] = (two || '').split('-');
	return Boolean(oneFamily && oneFamily === twoFamily && onePolarity !== twoPolarity);
}

export function edgeVertexPairs(shape) {
	const v = SHAPES[shape].vertices;
	return [
		[v[0], v[1]],
		[v[1], v[2]],
		[v[2], v[3]],
		[v[3], v[0]],
	];
}

export function edgeIndex(name) {
	return Object.values(EDGE_NAMES).flat().indexOf(name) % 4;
}

export function edgesFor(tile, side) {
  const vertices = verticesFor(tile, side);
  const names = edgeNames(tile.shape);
  return edgeVertexPairs(tile.shape).map(([from, to], index) => ({
    index, name: names[index], from, to, a: vertices[from], b: vertices[to], terrain: tile.edgeTerrain[names[index]]
  }));
}

export function createTile(definition, id) {
  return {
    ...structuredClone(definition), id, centerX: 0, centerY: 0, rotation: 0,
		// 開始タイルだけは null を取り得る。通常の山札タイルは候補生成で確定する。
		matchingPattern: definition.matchingPattern ?? null,
  };
}

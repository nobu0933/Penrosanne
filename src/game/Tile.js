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

// 矢印は地形とは独立した形状マッチング用の情報である。
// `verticalInverse` は地形／カードを反転せず、矢印だけを上下反転する。
const NORMAL_ARROWS = {
	thin: {
		AB: { from: 'B', to: 'A', heads: 1 }, DA: { from: 'D', to: 'A', heads: 1 },
		BC: { from: 'B', to: 'C', heads: 2 }, CD: { from: 'D', to: 'C', heads: 2 },
	},
	fat: {
		EF: { from: 'F', to: 'E', heads: 1 }, HE: { from: 'H', to: 'E', heads: 1 },
		FG: { from: 'G', to: 'F', heads: 2 }, GH: { from: 'G', to: 'H', heads: 2 },
	},
};

const VERTICAL_SWAP = { thin: { A: 'C', C: 'A' }, fat: { E: 'G', G: 'E' } };
const canonicalEdgeName = (shape, one, two) => edgeNames(shape).find((name) => name.includes(one) && name.includes(two));

export function arrowPatterns(shape) { return ['normal', 'verticalInverse']; }

export function arrowsFor(shape, pattern = 'normal') {
	const normal = NORMAL_ARROWS[shape];
	if (pattern !== 'verticalInverse') return structuredClone(normal);
	const swap = VERTICAL_SWAP[shape];
	const result = {};
	for (const arrow of Object.values(normal)) {
		const from = swap[arrow.from] || arrow.from, to = swap[arrow.to] || arrow.to;
		result[canonicalEdgeName(shape, from, to)] = { from, to, heads: arrow.heads };
	}
	return result;
}

export function arrowFor(tile, edgeName) {
	return arrowsFor(tile.shape, tile.arrowPattern || 'normal')[edgeName];
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
		arrowPattern: definition.arrowPattern ?? null,
  };
}

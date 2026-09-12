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
// `verticalInverse` は後方互換のための内部名で、地形／カードを回転せずに
// 辺記号だけを 180 度回転したパターンを表す。
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

const HALF_TURN_SWAP = {
	thin: { A: 'C', B: 'D', C: 'A', D: 'B' },
	fat: { E: 'G', F: 'H', G: 'E', H: 'F' },
};
const canonicalEdgeName = (shape, one, two) => edgeNames(shape).find((name) => name.includes(one) && name.includes(two));

export function matchingPatterns(shape) { return ['normal', 'verticalInverse']; }

// 地形パターンは辺記号パターンとは別の状態である。`halfTurn` はカードの
// 輪郭・盤面上の向きを変えず、地形・特徴領域だけを中心回りに180度回す。
// そのため、候補生成では
//   通常 / 辺記号のみ / 地形のみ / 両方
// の4通りを独立に評価できる。
export const TERRAIN_PATTERNS = Object.freeze(['normal', 'halfTurn']);

function halfTurnEdgeMap(shape) {
	const names = edgeNames(shape);
	return Object.fromEntries(names.map((name, index) => [name, names[(index + 2) % names.length]]));
}

function rotateAnchorHalfTurn(anchor) {
	return anchor ? { ...anchor, x: -anchor.x, y: -anchor.y } : anchor;
}

function halfTurnFeatureGroup(group, edgeMap) {
	if (Array.isArray(group)) return group.map((edge) => edgeMap[edge] || edge);
	return {
		...group,
		boundaryEdges: (group.boundaryEdges || []).map((edge) => edgeMap[edge] || edge),
		anchor: rotateAnchorHalfTurn(group.anchor),
	};
}

// `tile` を変更せず、地形だけを180度回した配置用タイルを返す。
// フィーチャー配列の添字は保持するので、都市・道・草原の接続、ミープル、
// 得点用の city adjacency はそのまま対応する。小領域番号だけは ①↔③、
// ②↔④ へ移す。
export function halfTurnTerrainTile(tile) {
	const result = structuredClone(tile);
	const names = edgeNames(tile.shape);
	const edgeMap = halfTurnEdgeMap(tile.shape);
	const subregionMap = { 1: 3, 2: 4, 3: 1, 4: 2 };
	result.edgeTerrain = Object.fromEntries(names.map((edge) => [edgeMap[edge], tile.edgeTerrain[edge]]));
	result.featureGroups = Object.fromEntries(
		Object.entries(tile.featureGroups || {}).map(([type, groups]) => [
			type,
			groups.map((group) => halfTurnFeatureGroup(group, edgeMap)),
		]),
	);
	result.featureAnchors = Object.fromEntries(
		Object.entries(tile.featureAnchors || {}).map(([type, anchors]) => [
			type,
			anchors.map(rotateAnchorHalfTurn),
		]),
	);
	result.roadTerminals = Object.fromEntries(
		Object.entries(tile.roadTerminals || {}).map(([index, terminals]) => [
			index,
			terminals.map((terminal) => terminal.edge ? { ...terminal, edge: edgeMap[terminal.edge] } : { ...terminal }),
		]),
	);
	result.fieldScoreGroups = (tile.fieldScoreGroups || []).map((group) =>
		group.map((subregion) => subregionMap[subregion] || subregion),
	);
	result.terrainPattern = 'halfTurn';
	result.terrainPatternOptions = ['halfTurn'];
	return result;
}

export function edgeMatchesFor(shape, pattern = 'normal') {
	const normal = NORMAL_EDGE_MATCHES[shape];
	if (pattern !== 'verticalInverse') return structuredClone(normal);
	const swap = HALF_TURN_SWAP[shape];
	const result = {};
	for (const [edgeName, symbol] of Object.entries(normal)) {
		const [from, to] = edgeName;
		result[canonicalEdgeName(shape, swap[from] || from, swap[to] || to)] = symbol;
	}
	return result;
}

export function edgeMatchFor(tile, edgeName) {
	// プレイヤーの左右反転は地形カード（地形・特徴領域・アンカー）の操作であり、
	// 形状そのものに印刷された辺記号を左右反転させない。辺記号の向きは
	// `matchingPattern`（通常／180度回転）だけで独立して決まる。
	return edgeMatchesFor(tile.shape, tile.matchingPattern || 'normal')[edgeName];
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
		// 地形はカード定義の通常向きで保持する。手札の候補生成時だけ、必要なら
		// `halfTurnTerrainTile()` で別の配置状態を作る。
		terrainPattern: definition.terrainPattern ?? 'normal',
  };
}

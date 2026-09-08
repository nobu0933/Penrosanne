import assert from "node:assert/strict";
import test from "node:test";
import { Board } from "../src/game/Board.js";
import { GameEngine } from "../src/game/GameEngine.js";
import { featureCanReceiveMeeple, isLegalPlacement, placementCandidateGroups, placementCandidates } from "../src/game/Rules.js";
import { isComplete, scoreFeature, scoreField } from "../src/game/Scoring.js";
import { arrowsFor, createTile, edgeNames, edgesFor, localVertices, verticesFor } from "../src/game/Tile.js";
import { createPrototypeDeck, createPrototypeMirrorTiles, createTileCatalog, manualAnchorOrder, mirrorTile } from "../src/game/TileSet.js";
import { TileTheme, tileAssetFilename } from "../src/ui/TileTheme.js";
import { manualAnchorForFeature, markerForFeature } from "../src/ui/FeatureAnchors.js";

const fixedRandom = () => .42;

test("最初の手番で提示される候補はすべて合法", () => {
  const game = new GameEngine({ random: fixedRandom });
  const candidates = game.candidates();
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => isLegalPlacement(game.state.board, candidate)));
});

test("登録済みの Lite と Standard は、現在の定義どおりに山札を生成する", () => {
	for (const deckType of ["lite", "standard"]) {
		const deck = createPrototypeDeck(fixedRandom, deckType);
		assert.ok(deck.length >= 2);
		assert.equal(new Set(deck.map((tile) => tile.id)).size, deck.length);
		assert.equal(new GameEngine({ random: fixedRandom, deckType }).state.deck.length, deck.length - 2);
	}
});

test("道だけデッキは道3枚・交差点2枚・修道院1枚ずつで構成する", () => {
	const deck = createPrototypeDeck(fixedRandom, "road-only");
	assert.equal(deck.length, 42);
	assert.equal(deck.filter((tile) => tile.shape === "thin").length, 21);
	assert.equal(deck.filter((tile) => tile.shape === "fat").length, 21);
	const count = (idPrefix, shape) => deck.filter((tile) => tile.idPrefix === idPrefix && tile.shape === shape).length;
	for (const idPrefix of ["straight-road", "straight-road-reverse", "curve-road-c", "curve-road-v"])
		for (const shape of ["thin", "fat"]) assert.equal(count(idPrefix, shape), 3);
	for (const idPrefix of ["t-junction", "t-junction-reverse", "cross-junction"])
		for (const shape of ["thin", "fat"]) assert.equal(count(idPrefix, shape), 2);
	for (const idPrefix of ["monastery-field", "monastery-road-end", "monastery-road-end-reverse"])
		for (const shape of ["thin", "fat"]) assert.equal(count(idPrefix, shape), 1);
});

test("タイル一覧用カタログは手動アンカー一覧の順番を使える", () => {
	const unique = [...new Map(createTileCatalog(fixedRandom).map((tile) => [`${tile.shape}:${tile.idPrefix}`, tile])).values()]
		.sort((left, right) => manualAnchorOrder(left) - manualAnchorOrder(right));
	assert.equal(unique.length, 106);
	assert.ok(unique.every((tile, index) => index === 0 || manualAnchorOrder(unique[index - 1]) < manualAnchorOrder(tile)));
});

test("指定タイルは180度回転後の辺・草原小領域・アンカーを直接定義する", () => {
	const catalog = createTileCatalog(fixedRandom);
	const expectations = {
		"curve-road-v": { terrain: ["F", "R", "R", "F"], fields: [[3], [4, 1, 2]] },
		"city-one-side-curve-road-c-reverse": { terrain: ["C", "F", "R", "R"], fields: [[3, 1, 2], [4]] },
		"city-road-end-c-reverse": { terrain: ["F", "F", "R", "C"], fields: [[3, 1, 2], [4]] },
		"t-junction": { terrain: ["F", "R", "R", "R"], fields: [[3], [4], [1, 2]] },
		"city-three-connected": { terrain: ["C", "F", "C", "C"], fields: [[3, 4, 1, 2]] },
		"city-three-connected-reverse": { terrain: ["C", "C", "F", "C"], fields: [[3, 4, 1, 2]] },
		"city-three-road": { terrain: ["C", "R", "C", "C"], fields: [[3], [4, 1, 2]] },
		"city-three-road-reverse": { terrain: ["C", "C", "R", "C"], fields: [[3, 1, 2], [4]] },
		"monastery-road-end-reverse": { terrain: ["F", "F", "R", "F"], fields: [[3, 4, 1, 2]] },
	};
	for (const [idPrefix, expected] of Object.entries(expectations)) for (const shape of ["thin", "fat"]) {
		const tile = catalog.find((candidate) => candidate.idPrefix === idPrefix && candidate.shape === shape);
		assert.deepEqual(edgeNames(shape).map((edge) => tile.edgeTerrain[edge]), expected.terrain, shape + ":" + idPrefix);
		assert.deepEqual(tile.fieldScoreGroups, expected.fields, shape + ":" + idPrefix);
		for (const [roadIndex, terminals] of Object.entries(tile.roadTerminals || {})) {
			const roadEdges = tile.featureGroups.road[Number(roadIndex)];
			for (const terminal of terminals.filter((terminal) => terminal.kind === "edge"))
				assert.ok(roadEdges.includes(terminal.edge), tile.id + ":" + terminal.edge);
		}
	}
	const thinCurve = catalog.find((tile) => tile.shape === "thin" && tile.idPrefix === "curve-road-v");
	assert.equal(thinCurve.featureAnchors.road[0].x, 0);
	assert.equal(thinCurve.featureAnchors.road[0].y, .0649);
	assert.equal(thinCurve.featureAnchors.field[0].x, 0);
	assert.equal(thinCurve.featureAnchors.field[0].y, .25);
});

test("追加した都市・道・修道院タイルは指定辺と道の終点を持つ", () => {
	const catalog = createTileCatalog(fixedRandom);
	const expectations = {
		"city-one-two-road-ends": { terrain: "CRRF", roads: [["edge", "city"], ["edge", "city"]] },
		"city-one-two-road-ends-reverse": { terrain: "FRRC", roads: [["edge", "city"], ["edge", "city"]] },
		"city-road-end-third": { terrain: "CFRF", roads: [["edge", "city"]] },
		"city-road-end-third-reverse": { terrain: "FRFC", roads: [["edge", "city"]] },
		"city-opposite-separated-curve-road": { terrain: "CRRC", roads: [["edge", "edge"]], cities: 2 },
		"city-opposite-separated-road-second-to-first": { terrain: "CRFC", roads: [["edge", "city"]], cities: 2 },
		"city-opposite-separated-road-second-to-first-reverse": { terrain: "CFRC", roads: [["edge", "city"]], cities: 2 },
		"city-opposite-separated-road-third-to-first": { terrain: "CFRC", roads: [["edge", "city"]], cities: 2 },
		"city-opposite-separated-road-third-to-first-reverse": { terrain: "CRFC", roads: [["edge", "city"]], cities: 2 },
		"city-opposite-separated-two-road-ends": { terrain: "CRRC", roads: [["edge", "city"], ["edge", "city"]], cities: 2 },
		"city-opposite-connected-road-second-end": { terrain: "CRFC", roads: [["edge", "city"]], cities: 1 },
		"city-opposite-connected-road-second-end-reverse": { terrain: "CFRC", roads: [["edge", "city"]], cities: 1 },
		"city-opposite-connected-two-road-ends": { terrain: "CRRC", roads: [["edge", "city"], ["edge", "city"]], cities: 1 },
		"monastery-two-road-ends": { terrain: "FRRF", roads: [["edge", "monastery"], ["edge", "monastery"]], cities: 0, monastery: true },
	};
	for (const [idPrefix, expected] of Object.entries(expectations)) for (const shape of ["thin", "fat"]) {
		const tile = catalog.find((candidate) => candidate.idPrefix === idPrefix && candidate.shape === shape);
		assert.ok(tile, `${shape}:${idPrefix}`);
		assert.equal(edgeNames(shape).map((edge) => tile.edgeTerrain[edge]).join(""), expected.terrain);
		assert.equal(tile.featureGroups.city.length, expected.cities ?? 1);
		assert.equal(Boolean(tile.hasMonastery), Boolean(expected.monastery));
		expected.roads.forEach((terminalKinds, index) =>
			assert.deepEqual(tile.roadTerminals[index].map((terminal) => terminal.kind), terminalKinds));
	}
});

test("空白防止は地形を無視し、シン・ファットと矢印の配置可能性で判定する", () => {
	const definition = (shape, terrain) => ({ shape, edgeTerrain:shape === "thin" ? {AB:terrain,BC:terrain,CD:terrain,DA:terrain} : {EF:terrain,FG:terrain,GH:terrain,HE:terrain}, featureGroups:{city:[],road:[],field:[]} });
	const board = new Board(120), start = createTile(definition("thin", "F"), "start"), current = createTile(definition("thin", "F"), "current"), thinRoad = createTile(definition("thin", "R"), "thin-road"), fatRoad = createTile(definition("fat", "R"), "fat-road");
	board.add(start);
	assert.ok(placementCandidates(board, current).length > 0);
	assert.ok(placementCandidates(board, current, { preventUnfillableGaps:true, tileOptions:[thinRoad, fatRoad] }).length > 0);
	const groups = placementCandidateGroups(board, current, { tileOptions:[thinRoad, fatRoad] });
	assert.ok(groups.regular.length + groups.relative.length <= placementCandidates(board, current).length);
});

test("既存の禁則辺は次手番の通常候補を禁則扱いにしない", () => {
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB:"F", BC:"F", CD:"F", DA:"F" } : { EF:"F", FG:"F", GH:"F", HE:"F" },
		featureGroups:{city:[],road:[],field:[]},
	});
	const board = new Board(120);
	const start = createTile(definition("thin"), "start");
	const remote = createTile(definition("thin"), "remote");
	remote.centerX = 1000;
	const current = createTile(definition("thin"), "current");
	const thin = createTile(definition("thin"), "thin-option");
	const fat = createTile(definition("fat"), "fat-option");
	board.add(start);
	board.add(remote);
	const keyFor = (edge) => [edge.a, edge.b]
		.map((point) => `${Math.round(point.x / 1e-5)}:${Math.round(point.y / 1e-5)}`)
		.sort().join("|");
	const fillabilityCache = new Map(board.edges(remote).map((edge) => [keyFor(edge), null]));
	const groups = placementCandidateGroups(board, current, { tileOptions:[thin, fat], fillabilityCache });
	assert.ok(groups.regular.length > 0);
});

test("矢印無視候補は3辺以上の接続時だけ表示する", () => {
	const game = new GameEngine({ random: fixedRandom, rules: { allowArrowOverride: true } });
	// 開始タイルだけに接する最初の手番では、矢印無視候補は作られない。
	assert.equal(game.arrowOverrideCandidates().length, 0);
});

test("矢印無視追加ルールを無効にすると橙候補を返さない", () => {
	const game = new GameEngine({ random: fixedRandom, rules: { allowArrowOverride: false } });
	assert.equal(game.arrowOverrideCandidates().length, 0);
});

test("矢印無視候補でも、複数の接続辺を含む地形一致は必須", () => {
	const game = new GameEngine({ random: fixedRandom });
	assert.ok(game.arrowOverrideCandidates().every((candidate) =>
		isLegalPlacement(game.state.board, candidate, { ignoreArrowMatching: true }),
	));
});

test("空き辺の配置可能性キャッシュは全辺再計算と同じ候補を返す", () => {
	const game = new GameEngine({ random: fixedRandom });
	game.placeTile(game.candidates()[0]);
	game.skipMeeple();
	const cached = game.candidates();
	const uncached = placementCandidates(game.state.board, game.state.currentTile, { preventUnfillableGaps:true, tileOptions:game.tileOptions });
	const key = (tile) => `${Math.round(tile.centerX)}:${Math.round(tile.centerY)}:${Math.round(tile.rotation * 10000)}`;
	assert.deepEqual(new Set(cached.map(key)), new Set(uncached.map(key)));
	assert.equal(game.fillabilityCache.size, game.state.board.freeEdges().length);
});

test("仮タイルセットは頂点名の辺を使う", () => {
	const deck = createPrototypeDeck(fixedRandom);
	const thin = deck.find((tile) => tile.idPrefix === "city-one-side" && tile.shape === "thin");
	const fat = deck.find((tile) => tile.idPrefix === "city-one-side" && tile.shape === "fat");
	assert.equal(thin.edgeTerrain.AB, "C");
	assert.equal(fat.edgeTerrain.EF, "C");
});

test("都市と非接続の道を持つタイルには草原領域が2つある", () => {
  const tile = createPrototypeDeck(fixedRandom).find((candidate) => candidate.idPrefix === "city-one-side-straight-road");
  assert.equal(tile.featureGroups.field.length, 2);
  const board = new Board(120); board.add(tile);
  const state = { meeples: {} };
  assert.equal(featureCanReceiveMeeple(board, state, tile, "field", 0), true);
  assert.equal(featureCanReceiveMeeple(board, state, tile, "field", 1), true);
});

test("都市と道が1辺ずつの反転タイルは草原アンカーも反転する", () => {
  const deck = createPrototypeDeck(fixedRandom);
  const anchors = (idPrefix) => deck
    .find((tile) => tile.idPrefix === idPrefix && tile.shape === "thin")
    .featureGroups.field.map((field) => field.anchor);
  assert.deepEqual(anchors("city-road-end-c-reverse"), [{ x: -0.28, y: 0.08 }, { x: 0.08, y: -0.28 }]);
  assert.deepEqual(anchors("city-road-end-v-reverse"), [{ x: 0.28, y: -0.08 }, { x: -0.08, y: 0.28 }]);
});

test("草原得点用の小領域はタイルごとの定義どおりに接続する", () => {
  const deck = createPrototypeDeck(fixedRandom);
  const groups = (idPrefix) => deck.find((tile) => tile.idPrefix === idPrefix && tile.shape === "thin").fieldScoreGroups;
  assert.deepEqual(groups("curve-road-v"), [[1], [2, 3, 4]]);
  assert.deepEqual(groups("city-opposite-connected"), [[2, 3], [1, 4]]);
  assert.deepEqual(groups("city-adjacent-curve-road-c"), [[1, 2, 3], [4]]);
  assert.deepEqual(groups("city-one-side-straight-road"), [[1, 2], [3, 4]]);
  assert.deepEqual(groups("city-one-t-junction"), [[3], [4], [1, 2]]);
});

test("草原得点用の小領域は各タイルで①〜④を重複なく分割する", () => {
  for (const tile of createPrototypeDeck(fixedRandom)) {
    const subregions = tile.fieldScoreGroups.flat();
    if (!tile.featureGroups.field.length) {
      assert.deepEqual(subregions, [], tile.id);
      continue;
    }
    assert.equal(tile.fieldScoreGroups.length, tile.featureGroups.field.length, tile.id);
    assert.deepEqual([...new Set(subregions)].sort(), [1, 2, 3, 4], tile.id);
    assert.equal(subregions.length, 4, tile.id);
  }
});

test("得点用小領域は実際に接する都市辺だけを得点対象にする", () => {
  const deck = createPrototypeDeck(fixedRandom);
  const tile = deck.find((candidate) => candidate.idPrefix === "city-adjacent-curve-road-c" && candidate.shape === "thin");
  assert.deepEqual(tile.fieldScoreGroups, [[1, 2, 3], [4]]);
  assert.deepEqual(tile.fieldScoreCityAdjacency, { 0: [0], 1: [] });
  const junction = deck.find((candidate) => candidate.idPrefix === "city-one-t-junction" && candidate.shape === "thin");
  assert.deepEqual(junction.fieldScoreCityAdjacency, { 0: [], 1: [], 2: [0] });
});

test("草原得点は未完成の都市を加算しない", () => {
  const tile = createTile({
    shape: "thin",
    edgeTerrain: { AB: "C", BC: "F", CD: "F", DA: "F" },
    featureGroups: { city: [["AB"]], road: [], field: [[]] },
    fieldScoreGroups: [[1, 2, 3, 4]],
    fieldScoreCityAdjacency: { 0: [0] },
  }, "uncompleted-city");
  const board = new Board(120); board.add(tile);
  assert.equal(scoreField(board, board.getTile("uncompleted-city"), 0), 0);
});

test("草原得点は同じ完成都市を1回だけ数える", () => {
  const tile = { fieldScoreCityAdjacency: { 0: [0] } };
  const board = {
    fieldScoreComponent: () => ({ features: [{ tile, index: 0 }, { tile, index: 0 }] }),
    component: () => ({ openEdges: [], key: "one-complete-city" }),
  };
  assert.equal(scoreField(board, tile, 0), 3);
});

test("草原得点用の小領域は道路辺をまたいで接続する", () => {
  const definition = {
    shape: "thin",
    edgeTerrain: { AB: "F", BC: "F", CD: "F", DA: "F" },
    featureGroups: { city: [], road: [], field: [[]] },
    fieldScoreGroups: [[1, 2, 3, 4]],
    fieldScoreCityAdjacency: { 0: [] },
  };
  const board = new Board(120), first = createTile(definition, "first"), second = createTile(definition, "second");
  board.add(first);
  const candidate = placementCandidates(board, second)[0], samePoint = (left, right) => Math.hypot(left.x - right.x, left.y - right.y) < 1e-5;
  const source = board.edges(first).find((edge) => edgesFor(candidate, board.side).some((neighbor) => samePoint(edge.a, neighbor.a) && samePoint(edge.b, neighbor.b) || samePoint(edge.a, neighbor.b) && samePoint(edge.b, neighbor.a)));
  const shared = edgesFor(candidate, board.side).find((edge) => samePoint(edge.a, source.a) && samePoint(edge.b, source.b) || samePoint(edge.a, source.b) && samePoint(edge.b, source.a));
  board.getTile("first").edgeTerrain[source.name] = "R";
  candidate.edgeTerrain[shared.name] = "R";
  board.add(candidate);
  assert.equal(board.fieldScoreComponent(board.getTile("first"), 0).features.length, 2);
});

test("草原得点用の小領域は都市辺をまたいで接続しない", () => {
  const definition = {
    shape: "thin",
    edgeTerrain: { AB: "F", BC: "F", CD: "F", DA: "F" },
    featureGroups: { city: [], road: [], field: [[]] },
    fieldScoreGroups: [[1, 2, 3, 4]],
    fieldScoreCityAdjacency: { 0: [] },
  };
  const board = new Board(120), first = createTile(definition, "first"), second = createTile(definition, "second");
  board.add(first);
  const candidate = placementCandidates(board, second)[0], samePoint = (left, right) => Math.hypot(left.x - right.x, left.y - right.y) < 1e-5;
  const source = board.edges(first).find((edge) => edgesFor(candidate, board.side).some((neighbor) => samePoint(edge.a, neighbor.a) && samePoint(edge.b, neighbor.b) || samePoint(edge.a, neighbor.b) && samePoint(edge.b, neighbor.a)));
  const shared = edgesFor(candidate, board.side).find((edge) => samePoint(edge.a, source.a) && samePoint(edge.b, source.b) || samePoint(edge.a, source.b) && samePoint(edge.b, source.a));
  board.getTile("first").edgeTerrain[source.name] = "R";
  candidate.edgeTerrain[shared.name] = "C";
  board.add(candidate);
  assert.equal(board.fieldScoreComponent(board.getTile("first"), 0).features.length, 1);
});

test("同じタイルでも道・都市で分かれた草原領域は連結しない", () => {
	const tile = createPrototypeDeck(fixedRandom).find((candidate) => candidate.idPrefix === "city-one-side-straight-road");
	const board = new Board(120); board.add(tile);
	assert.notEqual(board.component(tile, "field", 0).key, board.component(tile, "field", 1).key);
});

test("道タイルの草原は道で分離される", () => {
	const deck = createPrototypeDeck(fixedRandom);
	assert.equal(deck.find((tile) => tile.idPrefix === "straight-road").featureGroups.field.length, 2);
	for (const idPrefix of ["curve-road-c", "curve-road-v"])
		assert.equal(deck.find((tile) => tile.idPrefix === idPrefix).featureGroups.field.length, 2);
	assert.equal(deck.find((tile) => tile.idPrefix === "t-junction").featureGroups.field.length, 3);
	for (const idPrefix of ["city-road-end-c", "city-road-end-v"])
		assert.equal(deck.find((tile) => tile.idPrefix === idPrefix).featureGroups.field.length, 2);
});

test("道路終端として指定した辺は対応する道路領域に属する", () => {
	for (const tile of createPrototypeDeck(fixedRandom)) {
		for (const [index, terminals] of Object.entries(tile.roadTerminals || {})) {
			const edges = tile.featureGroups.road[Number(index)];
			for (const terminal of terminals.filter((item) => item.kind === "edge")) assert.ok(edges.includes(terminal.edge));
		}
	}
});

test("追加した都市・交差点タイルは指定どおりの特徴領域を持つ", () => {
	const deck = createPrototypeDeck(fixedRandom);
	const expected = {
		"city-four-connected": [1, 0, 0],
		"city-three-connected": [1, 0, 1],
		"city-three-road": [1, 1, 2],
		"city-opposite-connected": [1, 0, 2],
		"city-opposite-separated": [2, 0, 1],
		"city-adjacent-connected-c": [1, 0, 1],
		"city-adjacent-connected-v": [1, 0, 1],
		"city-adjacent-curve-road-c": [1, 1, 2],
		"city-adjacent-curve-road-v": [1, 1, 2],
		"city-adjacent-separated-c": [2, 0, 1],
		"city-adjacent-separated-v": [2, 0, 1],
		"city-one-t-junction": [1, 3, 3],
		"cross-junction": [0, 4, 4],
	};
	for (const [idPrefix, [cities, roads, fields]] of Object.entries(expected)) {
		for (const shape of ["thin", "fat"]) {
			const tile = deck.find((candidate) => candidate.idPrefix === idPrefix && candidate.shape === shape);
			assert.ok(tile, `${idPrefix}/${shape}`);
			assert.equal(tile.featureGroups.city.length, cities);
			assert.equal(tile.featureGroups.road.length, roads);
			assert.equal(tile.featureGroups.field.length, fields);
		}
	}
});

test("修道院は道路の有効な終端として扱い、草原辺をすべて持つ", () => {
	const deck = createPrototypeDeck(fixedRandom);
	for (const idPrefix of ["monastery-road-end", "monastery-road-end-reverse"]) for (const shape of ["thin", "fat"]) {
		const tile = deck.find((candidate) => candidate.idPrefix === idPrefix && candidate.shape === shape);
		const fieldEdges = tile.featureGroups.field.flatMap((group) => group.boundaryEdges);
		const fieldTerrain = Object.entries(tile.edgeTerrain).filter(([, terrain]) => terrain === "F").map(([edge]) => edge);
		assert.deepEqual([...fieldEdges].sort(), [...fieldTerrain].sort());
		assert.equal(tile.featureGroups.field.length, 1);
		assert.deepEqual(tile.fieldCityAdjacency, { 0: [] });
		assert.ok(tile.roadTerminals[0].some((terminal) => terminal.kind === "monastery"));
		assert.equal(isComplete({ component: () => ({ openEdges: [], features: [{ tile, index: 0 }] }) }, tile, "road", 0), true);
	}
});

test("開始タイルは山札をシャッフルして選ぶ", () => {
  const starts = [.01, .2, .4, .6, .8].map((value) => new GameEngine({ random: () => value }).state.board.tiles[0].idPrefix);
  assert.ok(new Set(starts).size > 1);
  assert.ok(starts.some((id) => id !== "monastery-field"));
});

test("交差点の各道は別の特徴領域で、別々にミープルを置ける", () => {
  const board = new Board(120);
  const junction = createPrototypeDeck(fixedRandom).find((tile) => tile.idPrefix === "t-junction");
  board.add(junction);
  const state = { meeples: { [board.featureRef(junction, "road", 0)]: "p1" } };
  assert.notEqual(board.component(junction, "road", 0).key, board.component(junction, "road", 1).key);
  assert.equal(featureCanReceiveMeeple(board, state, junction, "road", 1), true);
});

test("180度回転後の矢印定義と上下反転パターンで接続を判定する", () => {
	assert.deepEqual(arrowsFor("thin", "normal"), {
		AB: { from: "B", to: "A", heads: 1 }, DA: { from: "D", to: "A", heads: 1 },
		BC: { from: "B", to: "C", heads: 2 }, CD: { from: "D", to: "C", heads: 2 },
	});
	assert.deepEqual(arrowsFor("fat", "normal"), {
		EF: { from: "F", to: "E", heads: 1 }, HE: { from: "H", to: "E", heads: 1 },
		FG: { from: "G", to: "F", heads: 2 }, GH: { from: "G", to: "H", heads: 2 },
	});
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB:"F", BC:"F", CD:"F", DA:"F" } : { EF:"F", FG:"F", GH:"F", HE:"F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const board = new Board(120), thin = createTile(definition("thin"), "thin");
	thin.arrowPattern = "normal";
	board.add(thin);
	const fatCandidates = placementCandidates(board, createTile(definition("fat"), "fat"));
	const sharedSourceEdge = (candidate) => edgesFor(candidate, board.side).find((edge) =>
		board.allEdges().some(({ edge: other }) => Math.hypot(edge.a.x - other.b.x, edge.a.y - other.b.y) < 1e-5 && Math.hypot(edge.b.x - other.a.x, edge.b.y - other.a.y) < 1e-5),
	)?.name;
	const onThinAB = fatCandidates.filter((candidate) => {
		const source = sharedSourceEdge(candidate);
		const target = board.allEdges().find(({ edge }) => edgesFor(candidate, board.side).some((other) => Math.hypot(other.a.x - edge.b.x, other.a.y - edge.b.y) < 1e-5 && Math.hypot(other.b.x - edge.a.x, other.b.y - edge.a.y) < 1e-5));
		return target?.edge.name === "AB" && source;
	});
	assert.ok(onThinAB.some((candidate) => sharedSourceEdge(candidate) === "HE" && candidate.arrowPattern === "normal"));
	assert.ok(onThinAB.some((candidate) => sharedSourceEdge(candidate) === "FG" && candidate.arrowPattern === "verticalInverse"));
});

test("通常のみモードでは開始タイルと候補に上下反転パターンを使わない", () => {
	const game = new GameEngine({ random: fixedRandom, rules: { allowVerticalArrowPattern: false } });
	assert.equal(game.state.board.tiles[0].arrowPattern, "normal");
	const groups = game.candidateGroups();
	assert.ok([...groups.regular, ...groups.relative, ...groups.arrowOverride].every((candidate) => candidate.arrowPattern === "normal"));
});

test("占有済みの特徴領域へはミープルを置けない", () => {
  const game = new GameEngine({ random: fixedRandom });
  const tile = game.state.board.tiles[0];
  const type = tile.featureGroups.field.length ? "field" : "city";
  game.state.meeples[game.state.board.featureRef(tile, type, 0)] = "p1";
  assert.equal(featureCanReceiveMeeple(game.state.board, game.state, tile, type, 0), false);
});

test("接続した草原に他プレイヤーのミープルがあれば置けない", () => {
  const definition = {
    shape: "thin", edgeTerrain: { AB: "F", BC: "F", CD: "F", DA: "F" },
    featureGroups: { city: [], road: [], field: [["AB", "BC", "CD", "DA"]] },
  };
  const board = new Board(120), first = createTile(definition, "field-one"), second = createTile(definition, "field-two");
  board.add(first);
  board.add(placementCandidates(board, second)[0]);
  const placedSecond = board.getTile("field-two");
  const state = { meeples: { [board.featureRef(board.getTile("field-one"), "field", 0)]: "p1" } };
  assert.equal(featureCanReceiveMeeple(board, state, placedSecond, "field", 0), false);
});

test("草原の占有は4小領域で接続した範囲に対して判定する", () => {
  const definition = {
    shape: "thin", edgeTerrain: { AB: "F", BC: "F", CD: "F", DA: "F" },
    featureGroups: { city: [], road: [], field: [["AB"], ["CD"]] },
    fieldScoreGroups: [[1, 2], [3, 4]],
  };
  const board = new Board(120), first = createTile(definition, "small-field-one"), second = createTile(definition, "small-field-two");
  board.add(first);
  board.add(placementCandidates(board, second)[0]);
  const placedSecond = board.getTile("small-field-two");
  const state = { meeples: { [board.featureRef(board.getTile("small-field-one"), "field", 0)]: "p2" } };
  const connectedIndex = board.fieldScoreComponent(placedSecond, 0).features.some(({ tile, index }) => tile.id === "small-field-one" && index === 0) ? 0 : 1;
  assert.equal(featureCanReceiveMeeple(board, state, placedSecond, "field", connectedIndex), false);
});

test("各プレイヤーは引いた未配置タイルを1回だけ引き直せる", () => {
  const game = new GameEngine({ random: fixedRandom });
  const totalBefore = game.state.deck.length + game.state.board.tiles.length;
  game.redrawCurrentTile();
  assert.equal(game.activePlayer.redrawUsed, true);
  assert.equal(game.state.deck.length + game.state.board.tiles.length, totalBefore);
  assert.throws(() => game.redrawCurrentTile(), /1回まで/);
});

test("通常候補がなければ、相対・矢印無視候補があっても引き直し権を消費しない", () => {
	const game = new GameEngine({ random: fixedRandom });
	const relative = game.candidates()[0];
	game._candidateGroups = { regular: [], relative: [relative], arrowOverride: [relative] };
	game.redrawCurrentTile();
	assert.equal(game.activePlayer.redrawUsed, false);
});

test("相対禁則候補の配置はプレイヤーごとに1回だけ使える", () => {
	const game = new GameEngine({ random: fixedRandom }), candidate = game.candidates()[0];
	game._candidateGroups = { regular: [], relative: [candidate], arrowOverride: [] };
	game.placeTile(candidate);
	assert.equal(game.state.players[0].relativePlacementUsed, true);
});

test("ミラー版は辺・アンカー・草原小領域を左右反転し、山札には入らない", () => {
  const original = createPrototypeDeck(fixedRandom).find((tile) => tile.idPrefix === "city-road-end-c" && tile.shape === "thin");
  const mirrored = mirrorTile(original);
  assert.equal(mirrored.idPrefix, "city-road-end-c-mirror");
  assert.equal(mirrored.edgeTerrain.DA, original.edgeTerrain.AB);
  assert.equal(mirrored.edgeTerrain.CD, original.edgeTerrain.BC);
  assert.deepEqual(mirrored.featureGroups.field.map((group) => group.anchor), original.featureGroups.field.map((group) => ({ ...group.anchor, x: -group.anchor.x })));
  assert.deepEqual(mirrored.fieldScoreGroups, original.fieldScoreGroups.map((group) => group.map((region) => ({ 1: 1, 2: 4, 3: 3, 4: 2 })[region])));
  assert.ok(createPrototypeMirrorTiles(fixedRandom).every((tile) => tile.idPrefix.endsWith("-mirror")));
  assert.ok(createPrototypeDeck(fixedRandom).every((tile) => !tile.idPrefix.endsWith("-mirror")));
});

test("すべての明示的な草原アンカーはミラー版で左右反転する", () => {
  const originals = createPrototypeDeck(fixedRandom), mirrors = new Map(createPrototypeMirrorTiles(fixedRandom).map((tile) => [tile.originalId, tile]));
  for (const original of originals) {
    const mirror = mirrors.get(original.id);
    original.featureGroups.field.forEach((field, index) => {
      if (!field.anchor) return;
      assert.deepEqual(mirror.featureGroups.field[index].anchor, { x: -field.anchor.x, y: field.anchor.y }, original.id);
    });
  }
});

test("全特徴の手動アンカーは共通設定を優先し、ミラー時に左右反転する", () => {
	const tile = createTile({
		idPrefix: "manual-anchor",
		shape: "thin",
		edgeTerrain: { AB: "R", BC: "F", CD: "F", DA: "F" },
		featureGroups: { city: [], road: [["AB"]], field: [{ boundaryEdges: ["BC"], anchor: { x: .1, y: .2 } }] },
		featureAnchors: { road: [{ x: .24, y: -.16 }], field: [{ x: -.18, y: .08 }] },
	}, "manual-anchor");
	const road = markerForFeature(tile, { type: "road", index: 0 }, 100);
	assert.deepEqual(manualAnchorForFeature(tile, "road", 0), { x: .24, y: -.16 });
	assert.deepEqual(road, { x: 24, y: -16, option: { type: "road", index: 0 } });
	const mirrored = mirrorTile(tile);
	assert.deepEqual(mirrored.featureAnchors, { road: [{ x: -.24, y: -.16 }], field: [{ x: .18, y: .08 }] });
	assert.deepEqual(manualAnchorForFeature(mirrored, "field", 0), { x: .18, y: .08 });
});

test("試作山札の全特徴には編集用の明示アンカーがある", () => {
	for (const tile of createPrototypeDeck(fixedRandom)) {
		for (const type of ["city", "road", "field"]) {
			assert.equal(tile.featureAnchors[type].length, tile.featureGroups[type].length, `${tile.id}:${type}`);
			tile.featureGroups[type].forEach((_, index) => assert.ok(manualAnchorForFeature(tile, type, index), `${tile.id}:${type}:${index}`));
		}
		if (tile.hasMonastery) assert.deepEqual(tile.featureAnchors.monastery, [{ x: 0, y: 0 }], tile.id);
	}
});

test("テーマ画像の名前は種別・形状・領域を短縮表記で含む", () => {
  const tile = createPrototypeDeck(fixedRandom).find((candidate) => candidate.idPrefix === "city-road-end-c" && candidate.shape === "thin");
  assert.equal(tileAssetFilename(tile, "field", 0), "city-road-end-c_thin_field-134.png");
  assert.equal(tileAssetFilename(tile, "road", 0), "city-road-end-c_thin_road-2.png");
  assert.equal(tileAssetFilename(tile, "city", 0), "city-road-end-c_thin_city-1.png");
  assert.equal(tileAssetFilename(mirrorTile(tile), "city", 0), "city-road-end-c_thin_city-1.png");
});

test("テーマなしは画像レイヤーを描画しない", () => {
  const theme = new TileTheme({ id: "none" });
  assert.equal(theme.isEnabled(), false);
  assert.equal(theme.draw({}, {}, "field", 0, 120), false);
});

test("反転は未配置タイルに1回だけ使え、引き直し後は元の向きに戻る", () => {
  const game = new GameEngine({ random: fixedRandom });
  game.mirrorCurrentTile();
  assert.equal(game.activePlayer.mirrorUsed, true);
  assert.equal(game.state.currentTile.mirrored, true);
  assert.throws(() => game.mirrorCurrentTile(), /1回まで/);
  game.redrawCurrentTile();
  assert.equal(Boolean(game.state.currentTile.mirrored), false);
  assert.ok(game.state.deck.every((tile) => !tile.mirrored));
});

test("完成都市は紋章を含めて2倍得点", () => {
  const board = new Board(120);
  const tile = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[[]],road:[],field:[]}, hasCrest:true }, "city-test");
  board.add(tile);
  assert.equal(scoreFeature(board, board.getTile("city-test"), "city", 0), 4);
});

test("修道院は頂点に接する周辺タイル数だけ得点", () => {
  const board = new Board(120);
  const monastery = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[],road:[],field:[]}, hasMonastery:true }, "monastery");
  board.add(monastery);
  const a = localVertices("thin", 120).A;
  for (const [index, vertex] of Object.values(localVertices("thin", 120)).entries()) {
    const around = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[],road:[],field:[]} }, `around-${index}`);
    around.centerX = vertex.x - a.x; around.centerY = vertex.y - a.y; board.add(around);
  }
  assert.equal(scoreFeature(board, board.getTile("monastery"), "monastery", 0), 4);
});

test("修道院は4頂点の周囲が360度埋まった場合だけ完成する", () => {
  const side = 120, monastery = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[],road:[],field:[]}, hasMonastery:true }, "monastery");
  const points = verticesFor(monastery, side), byPoint = new Map();
  const addAt = (shape, vertex, point, id) => {
    const tile = createTile({ shape, edgeTerrain: shape === "thin" ? {AB:"F",BC:"F",CD:"F",DA:"F"} : {EF:"F",FG:"F",GH:"F",HE:"F"}, featureGroups:{city:[],road:[],field:[]} }, id);
    const local = localVertices(shape, side)[vertex]; tile.centerX = point.x - local.x; tile.centerY = point.y - local.y; return tile;
  };
  for (const [id, point] of Object.entries(points)) {
    const fillers = id === "A" || id === "C"
      ? Array.from({length:6}, (_, index) => addAt("thin", "B", point, `${id}-thin-${index}`))
      : Array.from({length:3}, (_, index) => addAt("fat", "F", point, `${id}-fat-${index}`));
    byPoint.set(`${point.x}:${point.y}`, [monastery, ...fillers]);
  }
  const board = {
    side,
    edges: (tile) => edgesFor(tile, side),
    vertexTiles: (point) => byPoint.get(`${point.x}:${point.y}`) || [],
  };
  assert.equal(isComplete(board, monastery, "monastery", 0), true);
  const game = new GameEngine({ random:fixedRandom });
  game.state.board = board;
  game.state.meeples["monastery:monastery:0"] = "p1";
  game.state.players[0].meeples--;
  game.scoreIfComplete(monastery, "monastery", 0);
  assert.equal(game.state.meeples["monastery:monastery:0"], undefined);
  assert.equal(game.state.players[0].meeples, 7);
  board.vertexTiles = () => [monastery];
  assert.equal(isComplete(board, monastery, "monastery", 0), false);
});

test("ミープルがないプレイヤーはタイル後に配置確認を挟まない", () => {
  const game = new GameEngine({ random:fixedRandom, meeples:0 });
  game.placeTile(game.candidates()[0]);
  assert.notEqual(game.state.phase, "placeMeeple");
});

test("置けるミープル領域がない場合は配置確認をスキップする", () => {
  const game = new GameEngine({ random:fixedRandom, meeples:1 });
  game.meepleOptions = () => [];
  game.finishTurn = () => { game.state.phase = "nextTurn"; };
  game.placeTile(game.candidates()[0]);
  assert.equal(game.state.phase, "nextTurn");
});

test("草原は終局時に完成都市ごとに3点を得て、ミープルは残る", () => {
  const game = new GameEngine({ random:fixedRandom });
  const tile = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[[]],road:[],field:[[]]}, fieldCityAdjacency:{0:[0]} }, "field-score");
  game.state.board = new Board(120); game.state.board.add(tile);
  const ref = game.state.board.featureRef(tile, "field", 0); game.state.meeples[ref] = "p1"; game.state.players[0].meeples--;
  game.finishGame();
  assert.equal(game.state.players[0].score, 3);
  assert.equal(game.state.meeples[ref], "p1");
	assert.deepEqual(game.state.scoreEvents.map((event) => ({ type:event.type, points:event.points, reason:event.reason })), [{type:"field",points:3,reason:"end"}]);
});

test("残り山札を処理するとゲームを終了できる", () => {
  const game = new GameEngine({ random: fixedRandom });
  // 長大な盤面での候補探索を単体テストへ持ち込まず、終局遷移だけを小さな山札で検証する。
  game.state.deck = game.state.deck.slice(-3);
  const expectedTiles = game.state.board.tiles.length + game.state.discarded.length + 1 + game.state.deck.length;
  while (!game.state.finished) {
    const regular = game.candidates(), candidate = regular[0] || game.relativeCandidates()[0] || game.arrowOverrideCandidates()[0];
    game.placeTile(candidate, { ignoreArrowMatching: !regular.length && !game.relativeCandidates().length });
    if (game.state.phase === "placeMeeple") game.skipMeeple();
  }
  assert.equal(game.state.board.tiles.length + game.state.discarded.length, expectedTiles);
  assert.equal(game.state.phase, "finished");
});

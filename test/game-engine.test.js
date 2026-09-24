import assert from "node:assert/strict";
import test from "node:test";
import { Board } from "../src/game/Board.js";
import { GameEngine } from "../src/game/GameEngine.js";
import { edgeSymbolFor, featureCanReceiveMeeple, forcedVertexTypeForSequence, inferredVertexTypeForSequence, isCyclicSegment, isLegalPlacement, placementCandidateGroups, placementCandidates, structuralPlacementFrontier, structuralPlacementFrontierProgressively, structuralPositionKey, VERTEX_PATTERNS, vertexPatternsAllow, vertexSequenceAt } from "../src/game/Rules.js";
import { edgeSymbolsMatch, halfTurnTerrainTile } from "../src/game/Tile.js";
import { isComplete, scoreFeature, scoreField } from "../src/game/Scoring.js";
import { createTile, edgeNames, edgesFor, localVertices, verticesFor } from "../src/game/Tile.js";
import { createPrototypeDeck, createPrototypeMirrorTiles, createTileCatalog, manualAnchorOrder, manualFeatureAnchorsFor, MANUAL_FEATURE_ANCHORS, mirrorTile } from "../src/game/TileSet.js";
import { TileTheme, tileAssetFilename } from "../src/ui/TileTheme.js";
import { manualAnchorForFeature, markerForFeature } from "../src/ui/FeatureAnchors.js";
import { MEEPLE_ASSETS, MEEPLE_ASSET_COUNT } from "../src/ui/MeepleAssets.js";

const fixedRandom = () => .42;

test("盤面の辺・頂点索引は復元済み盤面でも従来と同じ近傍を返す", () => {
  const side = 120;
  const definition = {
    shape: "thin",
    edgeTerrain: { AB: "F", BC: "F", CD: "F", DA: "F" },
    featureGroups: { city: [], road: [], field: [] },
  };
  const tile = createTile(definition, "indexed-tile");
  const board = new Board(side);
  // 仮想盤面の再開時と同じく、tiles 配列を直接復元しても索引は遅延構築される。
  board.tiles = [structuredClone(tile)];
  const edge = edgesFor(board.tiles[0], side)[0];
  const reversed = { ...edge, a: edge.b, b: edge.a };
  const vertex = verticesFor(board.tiles[0], side).A;

  assert.equal(board.allEdges().length, 4);
  assert.equal(board.matchingEdges(reversed).length, 1);
  assert.deepEqual(board.vertexTiles(vertex).map((entry) => entry.id), ["indexed-tile"]);
  assert.equal(board.vertexEntries(vertex)[0].vertexId, "A");
});

test("最初の手番で提示される候補はすべて合法", () => {
  const game = new GameEngine({ random: fixedRandom });
  const candidates = game.candidates();
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => isLegalPlacement(game.state.board, candidate)));
});

test("2π 異なる回転表現でも同じ候補位置として配置できる", () => {
  const game = new GameEngine({ random: fixedRandom });
  const candidate = game.candidates()[0];
  assert.doesNotThrow(() => game.placeTile({ ...candidate, rotation: candidate.rotation + Math.PI * 2 }));
});

test("頂点型だけで確定配置を先に探索し、未確定候補は記録しない", () => {
	const game = new GameEngine({ random: fixedRandom });
	const firstFrontier = game.structuralFrontier();
	assert.equal(firstFrontier.unresolved.length, 0);
	assert.ok(firstFrontier.forced.every((tile) => tile._inferenceStatus === "forced"));
	assert.ok(firstFrontier.unresolved.every((tile) => tile._inferenceStatus === "unresolved"));
	for (const candidate of game.candidates()) for (const forced of firstFrontier.forced) {
		if (structuralPositionKey(candidate) === structuralPositionKey(forced)) continue;
		const obstacle = new Board(game.state.board.side);
		obstacle.tiles = [forced];
		assert.equal(obstacle.overlaps(candidate), false, "確定配置と異なる候補は重ならない");
	}

	game.placeTile(game.candidates()[0]);
	if (game.state.phase === "placeMeeple") game.skipMeeple();
	game.placeTile(game.candidates()[0]);
	if (game.state.phase === "placeMeeple") game.skipMeeple();
	const frontier = game.structuralFrontier();
	assert.ok(frontier.forced.length > 0);
	assert.ok(!frontier.truncated);
	for (const candidate of game.candidates()) for (const forced of frontier.forced) {
		if (structuralPositionKey(candidate) === structuralPositionKey(forced)) continue;
		const obstacle = new Board(game.state.board.side);
		obstacle.tiles = [forced];
		assert.equal(obstacle.overlaps(candidate), false);
	}
});

test("順次表示用の確定配置探索は同期探索と同じ順序・結果を返す", async () => {
	const game = new GameEngine({ random: fixedRandom });
	const options = { tileOptions: game.tileOptions, allowVerticalMatchingPattern: game.rules.allowVerticalMatchingPattern };
	const synchronous = structuralPlacementFrontier(game.state.board, options);
	const announced = [];
	const checkpoints = [];
	const progressive = await structuralPlacementFrontierProgressively(game.state.board, options, {
		onForced: (tile) => announced.push(structuralPositionKey(tile)),
		yieldControl: progress => { checkpoints.push(progress.forcedCount); return Promise.resolve(); },
	});
	assert.deepEqual(progressive.forced.map(structuralPositionKey), synchronous.forced.map(structuralPositionKey));
	assert.deepEqual(announced, progressive.forced.map(structuralPositionKey));
	assert.ok(checkpoints.length > announced.length, '追加がない頂点の検査でも中断機会を設ける');
	assert.equal(checkpoints.at(-1), announced.length);
});

test("登録済みの Lite と Standard は、現在の定義どおりに山札を生成する", () => {
	for (const deckType of ["lite", "standard"]) {
		const deck = createPrototypeDeck(fixedRandom, deckType);
		assert.ok(deck.length >= 2);
		assert.equal(new Set(deck.map((tile) => tile.id)).size, deck.length);
		assert.equal(new GameEngine({ random: fixedRandom, deckType }).state.deck.length, deck.length - 2);
	}
});

test("道だけデッキは現在のユーザー定義どおりに一意なタイルを生成する", () => {
	const deck = createPrototypeDeck(fixedRandom, "road-only");
	assert.ok(deck.length > 0);
	assert.equal(new Set(deck.map((tile) => tile.id)).size, deck.length);
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
	// アンカーは自動推定値ではなく、一覧画面で調整した現在の手動設定を正とする。
	assert.deepEqual(thinCurve.featureAnchors.road, [{ x: .006, y: -.072 }]);
	assert.deepEqual(thinCurve.featureAnchors.field, [{ x: .041, y: .122 }, { x: .631, y: -.038 }]);
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

test("追加タイルの草原小領域は指定された接続セットに分かれる", () => {
	const expected = {
		"city-one-two-road-ends": [[1, 4], [2], [3]],
		"city-one-two-road-ends-reverse": [[1, 2], [3], [4]],
		"city-road-end-third": [[1, 4], [2, 3]],
		"city-road-end-third-reverse": [[1, 2], [3, 4]],
		"city-opposite-separated-curve-road": [[1, 2, 4], [3]],
		"city-opposite-separated-road-second-to-first": [[1, 3, 4], [2]],
		"city-opposite-separated-road-second-to-first-reverse": [[1, 2, 3], [4]],
		"city-opposite-separated-road-third-to-first": [[1, 4], [2, 3]],
		"city-opposite-separated-road-third-to-first-reverse": [[1, 2], [3, 4]],
		"city-opposite-separated-two-road-ends": [[1, 3], [2], [4]],
		"city-opposite-connected-road-second-end": [[1, 3, 4], [2]],
		"city-opposite-connected-road-second-end-reverse": [[1, 2, 3], [4]],
		"city-opposite-connected-two-road-ends": [[1, 3], [2], [4]],
		"monastery-two-road-ends": [[1, 2, 4], [3]],
	};
	const catalog = createTileCatalog(fixedRandom);
	for (const [idPrefix, groups] of Object.entries(expected)) for (const shape of ["thin", "fat"]) {
		const tile = catalog.find((candidate) => candidate.idPrefix === idPrefix && candidate.shape === shape);
		assert.deepEqual(tile.fieldScoreGroups, groups, `${shape}:${idPrefix}`);
		assert.equal(tile.featureAnchors.field.length, groups.length, `${shape}:${idPrefix}`);
	}
});

test("タイル一覧用の全特徴領域には手動ミープルアンカーがある", () => {
	for (const tile of createTileCatalog(fixedRandom)) {
		for (const type of ["city", "road", "field"])
			assert.equal(
				tile.featureAnchors[type].length,
				tile.featureGroups[type].length,
				`${tile.shape}:${tile.idPrefix}:${type}`,
			);
		if (tile.hasMonastery) assert.equal(tile.featureAnchors.monastery.length, 1, tile.id);
	}
});

test("絶対禁則の空白防止は地形と辺記号を無視してシン・ファットの物理配置だけを判定する", () => {
	const definition = (shape, terrain) => ({ shape, edgeTerrain:shape === "thin" ? {AB:terrain,BC:terrain,CD:terrain,DA:terrain} : {EF:terrain,FG:terrain,GH:terrain,HE:terrain}, featureGroups:{city:[],road:[],field:[]} });
	const board = new Board(120), start = createTile(definition("thin", "F"), "start"), current = createTile(definition("thin", "F"), "current"), thinRoad = createTile(definition("thin", "R"), "thin-road"), fatRoad = createTile(definition("fat", "R"), "fat-road");
	board.add(start);
	assert.ok(placementCandidates(board, current).length > 0);
	assert.ok(placementCandidates(board, current, { preventUnfillableGaps:true, tileOptions:[thinRoad, fatRoad] }).length > 0);
	const groups = placementCandidateGroups(board, current, { tileOptions:[thinRoad, fatRoad] });
	assert.ok(groups.regular.length <= placementCandidates(board, current).length);
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
	const deck = createTileCatalog(fixedRandom);
	const thin = deck.find((tile) => tile.idPrefix === "city-one-side" && tile.shape === "thin");
	const fat = deck.find((tile) => tile.idPrefix === "city-one-side" && tile.shape === "fat");
	assert.equal(thin.edgeTerrain.AB, "C");
	assert.equal(fat.edgeTerrain.EF, "C");
});

test("都市と非接続の道を持つタイルには草原領域が2つある", () => {
	  const tile = createTileCatalog(fixedRandom).find((candidate) => candidate.idPrefix === "city-one-side-straight-road");
  assert.equal(tile.featureGroups.field.length, 2);
  const board = new Board(120); board.add(tile);
  const state = { meeples: {} };
  assert.equal(featureCanReceiveMeeple(board, state, tile, "field", 0), true);
  assert.equal(featureCanReceiveMeeple(board, state, tile, "field", 1), true);
});

test("都市と道が1辺ずつの反転タイルは草原アンカーも反転する", () => {
	  const deck = createTileCatalog(fixedRandom);
  const anchors = (idPrefix) => deck
    .find((tile) => tile.idPrefix === idPrefix && tile.shape === "thin")
    .featureGroups.field.map((field) => field.anchor);
	  assert.equal(anchors("city-road-end-c-reverse").length, 2);
	  assert.equal(anchors("city-road-end-v-reverse").length, 2);
});

test("草原得点用の小領域はタイルごとの定義どおりに接続する", () => {
	  const deck = createTileCatalog(fixedRandom);
  const groups = (idPrefix) => deck.find((tile) => tile.idPrefix === idPrefix && tile.shape === "thin").fieldScoreGroups;
	  for (const idPrefix of ["curve-road-v", "city-opposite-connected", "city-adjacent-curve-road-c", "city-one-side-straight-road", "city-one-t-junction"])
		assert.deepEqual([...new Set(groups(idPrefix).flat())].sort(), [1, 2, 3, 4]);
});

test("草原得点用の小領域は各タイルで①〜④を重複なく分割する", () => {
	  for (const tile of createTileCatalog(fixedRandom)) {
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
	  const deck = createTileCatalog(fixedRandom);
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
		const tile = createTileCatalog(fixedRandom).find((candidate) => candidate.idPrefix === "city-one-side-straight-road");
	const board = new Board(120); board.add(tile);
	assert.notEqual(board.component(tile, "field", 0).key, board.component(tile, "field", 1).key);
});

test("道タイルの草原は道で分離される", () => {
		const deck = createTileCatalog(fixedRandom);
	assert.equal(deck.find((tile) => tile.idPrefix === "straight-road").featureGroups.field.length, 2);
	for (const idPrefix of ["curve-road-c", "curve-road-v"])
		assert.equal(deck.find((tile) => tile.idPrefix === idPrefix).featureGroups.field.length, 2);
	assert.equal(deck.find((tile) => tile.idPrefix === "t-junction").featureGroups.field.length, 3);
	for (const idPrefix of ["city-road-end-c", "city-road-end-v"])
		assert.equal(deck.find((tile) => tile.idPrefix === idPrefix).featureGroups.field.length, 2);
});

test("道路終端として指定した辺は対応する道路領域に属する", () => {
		for (const tile of createTileCatalog(fixedRandom)) {
		for (const [index, terminals] of Object.entries(tile.roadTerminals || {})) {
			const edges = tile.featureGroups.road[Number(index)];
			for (const terminal of terminals.filter((item) => item.kind === "edge")) assert.ok(edges.includes(terminal.edge));
		}
	}
});

test("追加した都市・交差点タイルは指定どおりの特徴領域を持つ", () => {
		const deck = createTileCatalog(fixedRandom);
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
		const deck = createTileCatalog(fixedRandom);
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
	  const junction = createTileCatalog(fixedRandom).find((tile) => tile.idPrefix === "t-junction");
  board.add(junction);
  const state = { meeples: { [board.featureRef(junction, "road", 0)]: "p1" } };
  assert.notEqual(board.component(junction, "road", 0).key, board.component(junction, "road", 1).key);
  assert.equal(featureCanReceiveMeeple(board, state, junction, "road", 1), true);
});

test("辺記号は alpha/beta が同じで convex/concave が反対の場合だけ接続する", () => {
	assert.equal(edgeSymbolFor("thin", "CD"), "alpha-convex");
	assert.equal(edgeSymbolFor("thin", "BC"), "alpha-concave");
	assert.equal(edgeSymbolFor("fat", "HE"), "beta-convex");
	assert.equal(edgeSymbolFor("fat", "EF"), "beta-concave");
	assert.equal(edgeSymbolsMatch("alpha-convex", "alpha-concave"), true);
	assert.equal(edgeSymbolsMatch("beta-convex", "beta-concave"), true);
	assert.equal(edgeSymbolsMatch("alpha-convex", "beta-concave"), false);
	assert.equal(edgeSymbolsMatch("alpha-convex", "alpha-convex"), false);
	assert.equal(edgeSymbolFor("thin", "AB", "verticalInverse"), "alpha-convex", "180度回転では AB は CD の記号を使う");
	assert.equal(edgeSymbolFor("thin", "BC", "verticalInverse"), "beta-convex", "180度回転では BC は DA の記号を使う");
	assert.equal(edgeSymbolFor("fat", "EF", "verticalInverse"), "alpha-concave", "180度回転では EF は GH の記号を使う");
	assert.equal(edgeSymbolFor("fat", "FG", "verticalInverse"), "beta-convex", "180度回転では FG は HE の記号を使う");
});

test("通常のみモードでは開始タイルと候補に上下反転パターンを使わない", () => {
	const game = new GameEngine({ random: fixedRandom, rules: { allowVerticalMatchingPattern: false, allowTerrainHalfTurn: false } });
	assert.equal(game.state.board.tiles[0].matchingPattern, "normal");
	const groups = game.candidateGroups();
	assert.ok(groups.regular.every((candidate) => candidate.matchingPattern === "normal"));
	assert.ok(groups.regular.every((candidate) => candidate.terrainPattern === "normal"));
	assert.deepEqual(game.state.currentTile.terrainPatternOptions, ["normal"]);
});

test("手札は180度回転した辺記号だけのパターンでも配置候補を作れる", () => {
	const side = 120;
	const definition = (shape, matchingEdge, restTerrain) => ({
		shape,
		edgeTerrain: Object.fromEntries(edgeNames(shape).map((edge) => [edge, edge === matchingEdge ? "R" : restTerrain])),
		featureGroups: { city: [], road: [], field: [] },
	});
	const board = new Board(side);
	board.add(createTile({
		...definition("thin", "AB", "X"),
		matchingPattern: "verticalInverse",
		matchingPatternOptions: ["verticalInverse"],
	}, "inverse-start"));
	const hand = createTile(definition("thin", "DA", "Y"), "hand");
	const both = placementCandidates(board, hand, { allowVerticalMatchingPattern: true });
	const normalOnly = placementCandidates(board, hand, { allowVerticalMatchingPattern: false });
	assert.equal(normalOnly.length, 0);
	assert.ok(both.length > 0);
	assert.ok(both.every((candidate) => candidate.matchingPatternOptions.includes("verticalInverse")));
});

test("地形だけを180度回転した手札も、辺記号と独立して配置候補を作れる", () => {
	const side = 120;
	const definition = (matchingEdge, restTerrain) => ({
		shape: "thin",
		edgeTerrain: Object.fromEntries(edgeNames("thin").map((edge) => [edge, edge === matchingEdge ? "R" : restTerrain])),
		featureGroups: { city: [], road: [], field: [] },
	});
	const board = new Board(side);
	board.add(createTile({
		...definition("AB", "X"),
		matchingPattern: "normal",
		matchingPatternOptions: ["normal"],
	}, "terrain-start"));
	// 通常状態では BC の道と AB は辺記号が合わない。地形だけを180度回すと
	// 道が DA へ移り、辺記号は通常のまま接続できる。
	const hand = createTile(definition("BC", "Y"), "terrain-hand");
	assert.equal(placementCandidates(board, hand, { allowVerticalMatchingPattern: false, allowTerrainHalfTurn: false }).length, 0);
	const candidates = placementCandidates(board, hand, { allowVerticalMatchingPattern: false, allowTerrainHalfTurn: true });
	assert.ok(candidates.length > 0);
	assert.ok(candidates.every((candidate) => candidate.terrainPattern === "halfTurn"));
	assert.ok(candidates.every((candidate) => isLegalPlacement(board, candidate, { allowVerticalMatchingPattern: false })));
	assert.ok(candidates.every((candidate) => !isLegalPlacement(board, candidate, { allowVerticalMatchingPattern: false, allowTerrainHalfTurn: false })));
});

test("無制限の地形反転候補は通常・反転と180度回転を独立に評価する", () => {
	const side = 120;
	const definition = (matchingEdge, restTerrain) => ({
		shape: "thin",
		edgeTerrain: Object.fromEntries(edgeNames("thin").map((edge) => [edge, edge === matchingEdge ? "R" : restTerrain])),
		featureGroups: { city: [], road: [], field: [] },
	});
	let mirroredCandidate = null;
	for (const startEdge of edgeNames("thin")) for (const handEdge of edgeNames("thin")) {
		const board = new Board(side);
		board.add(createTile({ ...definition(startEdge, "X"), matchingPattern: "normal", matchingPatternOptions: ["normal"] }, `mirror-start-${startEdge}`));
		const hand = createTile(definition(handEdge, "Y"), `mirror-hand-${handEdge}`);
		const candidates = placementCandidates(board, hand, {
			allowVerticalMatchingPattern: false,
			allowTerrainHalfTurn: true,
			allowTerrainMirror: true,
		});
		const withoutMirroring = placementCandidates(board, hand, {
			allowVerticalMatchingPattern: false,
			allowTerrainHalfTurn: true,
			allowTerrainMirror: false,
		});
		assert.ok(withoutMirroring.every((candidate) => !candidate.mirrored), '使用不能モードは反転候補を返さない');
		mirroredCandidate ||= candidates.find((candidate) => candidate.mirrored);
	}
	assert.ok(mirroredCandidate, "左右反転した地形の候補も生成する");
	assert.ok(["normal", "halfTurn"].includes(mirroredCandidate.terrainPattern));
});

test("地形の180度回転は辺・特徴・道路終点・草原小領域・アンカーを一緒に移す", () => {
	const original = createTile({
		shape: "thin",
		edgeTerrain: { AB: "C", BC: "R", CD: "F", DA: "F" },
		featureGroups: {
			city: [["AB"]],
			road: [["BC"]],
			field: [{ boundaryEdges: ["CD", "DA"], anchor: { x: .2, y: -.1 } }],
		},
		featureAnchors: { city: [{ x: 0, y: -.35 }], road: [{ x: .25, y: 0 }], field: [{ x: -.2, y: .15 }] },
		roadTerminals: { 0: [{ kind: "edge", edge: "BC" }] },
		fieldScoreGroups: [[1, 2]],
		fieldScoreCityAdjacency: { 0: [0] },
	}, "terrain-data"), rotated = halfTurnTerrainTile(original);
	assert.deepEqual(rotated.edgeTerrain, { AB: "F", BC: "F", CD: "C", DA: "R" });
	assert.deepEqual(rotated.featureGroups.city, [["CD"]]);
	assert.deepEqual(rotated.featureGroups.road, [["DA"]]);
	assert.deepEqual(rotated.featureGroups.field[0].boundaryEdges, ["AB", "BC"]);
	assert.deepEqual(rotated.featureAnchors.field, [{ x: .2, y: -.15 }]);
	assert.deepEqual(rotated.roadTerminals[0], [{ kind: "edge", edge: "DA" }]);
	assert.deepEqual(rotated.fieldScoreGroups, [[3, 4]]);
	assert.deepEqual(rotated.fieldScoreCityAdjacency, { 0: [0] });
	assert.equal(rotated.terrainPattern, "halfTurn");
});

test("頂点型は指定された循環順列の連続部分だけを許可する", () => {
	assert.equal(isCyclicSegment("BDGGB", VERTEX_PATTERNS.queen), true);
	assert.equal(isCyclicSegment("GGBDGBD", VERTEX_PATTERNS.queen), true);
	assert.equal(isCyclicSegment("BDGGG", VERTEX_PATTERNS.queen), false);
	assert.equal(isCyclicSegment("AAE", VERTEX_PATTERNS.deuce), true);
	assert.equal(VERTEX_PATTERNS.ace, "HFDGB");
});

test("頂点型は未配置の扇形をまたいで既存頂点を連結せず、合法な候補を残す", () => {
	const side = 120;
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const atOriginVertex = (shape, vertexId, degrees, id) => {
		const rotation = degrees * Math.PI / 180, vertex = localVertices(shape, side)[vertexId];
		return {
			...createTile(definition(shape), id),
			centerX: -(vertex.x * Math.cos(rotation) - vertex.y * Math.sin(rotation)),
			centerY: -(vertex.x * Math.sin(rotation) + vertex.y * Math.cos(rotation)),
			rotation,
		};
	};
	// queen = G G B D G B D のうち、G / D / B の間には未配置の扇形がある。
	// 旧判定はこれを GDB と連結して不正扱いにしていた。
	const board = new Board(side);
	board.add(atOriginVertex("fat", "G", 126, "queen-g"));
	board.add(atOriginVertex("thin", "D", -162, "queen-d"));
	board.add(atOriginVertex("thin", "B", 126, "queen-b"));
	const candidate = atOriginVertex("thin", "D", -18, "queen-final-d");
	assert.equal(vertexPatternsAllow(board, candidate), true);
});

test("短い頂点列から一意に決まる頂点型を確定配置探索へ使う", () => {
	assert.equal(forcedVertexTypeForSequence("C"), "star");
	assert.equal(forcedVertexTypeForSequence("FH"), "star");
	assert.equal(forcedVertexTypeForSequence("HF"), "ace");
	assert.equal(forcedVertexTypeForSequence("BH"), "ace");
	assert.equal(forcedVertexTypeForSequence("FD"), "ace");
	assert.equal(forcedVertexTypeForSequence("AA"), "deuce");
	assert.equal(forcedVertexTypeForSequence("BD"), null);
	assert.equal(inferredVertexTypeForSequence("GGGGG"), "sun");
	assert.equal(inferredVertexTypeForSequence("EEEEE"), "moon");
	assert.equal(inferredVertexTypeForSequence("AAE"), "deuce");
	assert.equal(inferredVertexTypeForSequence("EAE"), "jack");
	assert.equal(inferredVertexTypeForSequence("FHC"), "star");
	assert.equal(inferredVertexTypeForSequence("G"), null);
});

test("C から star が確定した頂点では F と H の両方を連鎖して確定する", () => {
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const board = new Board(120);
	const start = createTile(definition("thin"), "start");
	const fat = createTile(definition("fat"), "fat-option");
	board.add(start);
	const frontier = structuralPlacementFrontier(board, { tileOptions: [start, fat] });
	const point = verticesFor(start, 120).C;
	const samePoint = (left, right) => Math.hypot(left.x - right.x, left.y - right.y) < 1e-5;
	const verticesAtC = frontier.forced.map((tile) =>
		Object.entries(verticesFor(tile, 120)).find(([, vertex]) => samePoint(vertex, point))?.[0]);
	assert.deepEqual(new Set(verticesAtC), new Set(["F", "H"]));
});

test("優先識別列を含む頂点は、列全体が一致しなくても確定配置へ連鎖する", () => {
	const side = 120;
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const atOriginVertex = (shape, vertexId, degrees, id) => {
		const rotation = degrees * Math.PI / 180, vertex = localVertices(shape, side)[vertexId];
		const rotated = { x: vertex.x * Math.cos(rotation) - vertex.y * Math.sin(rotation), y: vertex.x * Math.sin(rotation) + vertex.y * Math.cos(rotation) };
		return { ...createTile(definition(shape), id), centerX: -rotated.x, centerY: -rotated.y, rotation };
	};
	const forcedAtOrigin = (tiles) => {
		const board = new Board(side);
		tiles.forEach((tile) => board.add(tile));
		const frontier = structuralPlacementFrontier(board, { tileOptions: [definition("thin"), definition("fat")] });
		return new Set(frontier.forced.map((tile) =>
			Object.entries(verticesFor(tile, side)).find(([, point]) => Math.hypot(point.x, point.y) < 1e-5)?.[0],
		).filter(Boolean));
	};

	const hc = forcedAtOrigin([
		atOriginVertex("fat", "H", -126, "hc-h"),
		atOriginVertex("thin", "C", 90, "hc-c"),
	]);
	assert.ok(hc.has("F"), "HC は C を含むため star の F が確定する");

	const gbh = forcedAtOrigin([
		atOriginVertex("fat", "G", -54, "gbh-g"),
		atOriginVertex("thin", "B", 90, "gbh-b"),
		atOriginVertex("fat", "H", -18, "gbh-h"),
	]);
	assert.ok(gbh.has("F") && gbh.has("D"), "GBH は BH を含むため ace の F/D が確定する");
});

test("頂点型探索は実タイルと既存の確定配置を同じ頂点列として数える", () => {
	const side = 120;
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const atOriginVertex = (shape, vertexId, degrees, id) => {
		const rotation = degrees * Math.PI / 180, vertex = localVertices(shape, side)[vertexId];
		const rotated = { x: vertex.x * Math.cos(rotation) - vertex.y * Math.sin(rotation), y: vertex.x * Math.sin(rotation) + vertex.y * Math.cos(rotation) };
		return { ...createTile(definition(shape), id), centerX: -rotated.x, centerY: -rotated.y, rotation };
	};
	const realG = atOriginVertex("fat", "G", -54, "real-g");
	const forcedH = { ...atOriginVertex("fat", "H", -18, "forced-h"), isStructural: true, _inferenceStatus: "forced" };
	const newRealB = atOriginVertex("thin", "B", 90, "real-b");
	const board = new Board(side);
	board.add(realG);
	const frontier = structuralPlacementFrontier(board, {
		tileOptions: [definition("thin"), definition("fat")],
		previous: {
			forced: [forcedH],
			virtualTiles: [realG, forcedH],
			vertexTypes: [],
			nextSerial: 1,
		},
		changedTile: newRealB,
	});
	const verticesAtOrigin = new Set(frontier.forced.map((tile) =>
		Object.entries(verticesFor(tile, side)).find(([, point]) => Math.hypot(point.x, point.y) < 1e-5)?.[0],
	).filter(Boolean));
	assert.ok(verticesAtOrigin.has("F") && verticesAtOrigin.has("D"), "実G・実B・確定Hを GBH として ace を完成する");
});

test("確定頂点型は atan2 の境界をまたいでも残りの全スロットへ連鎖する", () => {
	const side = 120;
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
		matchingPattern: "normal",
	});
	const atOriginVertex = (shape, vertexId, degrees, id) => {
		const rotation = degrees * Math.PI / 180;
		const vertex = localVertices(shape, side)[vertexId];
		const rotated = {
			x: vertex.x * Math.cos(rotation) - vertex.y * Math.sin(rotation),
			y: vertex.x * Math.sin(rotation) + vertex.y * Math.cos(rotation),
		};
		return { ...createTile(definition(shape), id), centerX: -rotated.x, centerY: -rotated.y, rotation };
	};
	const forcedVerticesAtOrigin = (tiles) => {
		const board = new Board(side);
		tiles.forEach((tile) => board.add(tile));
		const frontier = structuralPlacementFrontier(board, { tileOptions: [definition("thin"), definition("fat")] });
		return {
			sequence: vertexSequenceAt(board, null, { x: 0, y: 0 }),
			vertices: new Set(frontier.forced.map((tile) =>
				Object.entries(verticesFor(tile, side)).find(([, point]) => Math.hypot(point.x, point.y) < 1e-5)?.[0],
			).filter(Boolean)),
		};
	};

	const deuce = forcedVerticesAtOrigin([
		atOriginVertex("thin", "A", -18, "deuce-a1"),
		atOriginVertex("thin", "A", 198, "deuce-a2"),
	]);
	assert.equal(deuce.sequence, "AA");
	assert.ok(deuce.vertices.has("E"), "AA → deuce の E が確定する");

	const jack = forcedVerticesAtOrigin([
		atOriginVertex("fat", "E", -54, "jack-e1"),
		atOriginVertex("fat", "E", 18, "jack-e2"),
		atOriginVertex("thin", "A", 126, "jack-a"),
	]);
	assert.ok(jack.vertices.has("E"), "EEA → jack の残る E が確定する");

	const ace = forcedVerticesAtOrigin([
		atOriginVertex("fat", "H", 54, "ace-h"),
		atOriginVertex("fat", "F", -18, "ace-f"),
	]);
	assert.equal(ace.sequence, "HF");
	assert.deepEqual(new Set(["D", "G", "B"]), new Set(["D", "G", "B"].filter((vertex) => ace.vertices.has(vertex))), "HF → ace の D/G/B がすべて確定する");

	const aceMissingH = forcedVerticesAtOrigin([
		atOriginVertex("fat", "F", -18, "ace-fdgb-f"),
		atOriginVertex("thin", "D", 234, "ace-fdgb-d"),
		atOriginVertex("fat", "G", 18, "ace-fdgb-g"),
		atOriginVertex("thin", "B", 162, "ace-fdgb-b"),
	]);
	assert.equal(aceMissingH.sequence, "FDGB");
	assert.ok(aceMissingH.vertices.has("H"), "FDGB → ace の H が確定する");

	const aceMissingD = forcedVerticesAtOrigin([
		atOriginVertex("fat", "G", 18, "ace-gbhf-g"),
		atOriginVertex("thin", "B", 162, "ace-gbhf-b"),
		atOriginVertex("fat", "H", 54, "ace-gbhf-h"),
		atOriginVertex("fat", "F", -18, "ace-gbhf-f"),
	]);
	assert.equal(aceMissingD.sequence, "GBHF");
	assert.ok(aceMissingD.vertices.has("D"), "GBHF → ace の D が確定する");
});

test("BDGB → queen は残りの D/G/G をすべて確定配置にする", () => {
	const side = 120;
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const atOriginVertex = (shape, vertexId, degrees, id) => {
		const rotation = degrees * Math.PI / 180, vertex = localVertices(shape, side)[vertexId];
		return {
			...createTile(definition(shape), id),
			centerX: -(vertex.x * Math.cos(rotation) - vertex.y * Math.sin(rotation)),
			centerY: -(vertex.x * Math.sin(rotation) + vertex.y * Math.cos(rotation)),
			rotation,
		};
	};
	const board = new Board(side);
	[
		atOriginVertex("thin", "B", 198, "queen-b1"),
		atOriginVertex("thin", "D", 54, "queen-d1"),
		atOriginVertex("fat", "G", 198, "queen-g1"),
		atOriginVertex("thin", "B", 342, "queen-b2"),
	].forEach((tile) => board.add(tile));
	assert.equal(vertexSequenceAt(board, null, { x: 0, y: 0 }), "BDGB");
	const frontier = structuralPlacementFrontier(board, { tileOptions: [definition("thin"), definition("fat")] });
	const verticesAtOrigin = frontier.forced.map((tile) =>
		Object.entries(verticesFor(tile, side)).find(([, point]) => Math.hypot(point.x, point.y) < 1e-5)?.[0],
	).filter(Boolean);
	assert.deepEqual(verticesAtOrigin.sort(), ["D", "G", "G"], "queen の残り3スロットをすべて確定する");
});

test("AA → deuce の E は未確定の上下反転パターンをまたいで確定する", () => {
	const side = 120;
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const atOriginVertex = (vertexId, degrees, id, displayedPattern) => {
		const rotation = degrees * Math.PI / 180, vertex = localVertices("thin", side)[vertexId];
		const rotated = {
			x: vertex.x * Math.cos(rotation) - vertex.y * Math.sin(rotation),
			y: vertex.x * Math.sin(rotation) + vertex.y * Math.cos(rotation),
		};
		return {
			...createTile({ ...definition("thin"), matchingPattern: displayedPattern, matchingPatternOptions: ["normal", "verticalInverse"] }, id),
			centerX: -rotated.x,
			centerY: -rotated.y,
			rotation,
		};
	};
	const board = new Board(side);
	// 盤面上の表示パターンが異なっていても、周囲の辺記号で未確定なら
	// どちらも候補として保持し、deuce を閉じる E を失わない。
	board.add(atOriginVertex("A", -18, "a-normal", "normal"));
	board.add(atOriginVertex("A", 198, "a-inverse", "verticalInverse"));
	const frontier = structuralPlacementFrontier(board, { tileOptions: [definition("thin"), definition("fat")] });
	const centralVertices = frontier.forced.map((tile) =>
		Object.entries(verticesFor(tile, side)).find(([, point]) => Math.hypot(point.x, point.y) < 1e-5)?.[0],
	);
	assert.ok(centralVertices.includes("E"));
});

test("DGGGG は king 型として残る B を確定配置にする", () => {
	const side = 120;
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const atOriginVertex = (shape, vertexId, degrees, id) => {
		const rotation = degrees * Math.PI / 180, vertex = localVertices(shape, side)[vertexId];
		const rotated = { x: vertex.x * Math.cos(rotation) - vertex.y * Math.sin(rotation), y: vertex.x * Math.sin(rotation) + vertex.y * Math.cos(rotation) };
		return { ...createTile(definition(shape), id), centerX: -rotated.x, centerY: -rotated.y, rotation };
	};
	const board = new Board(side);
	board.add(atOriginVertex("thin", "D", -162, "d"));
	[-18, 54, 126, 198].forEach((degrees, index) => board.add(atOriginVertex("fat", "G", degrees, `g${index}`)));
	assert.equal(vertexSequenceAt(board, null, { x: 0, y: 0 }), "DGGGG");
	const frontier = structuralPlacementFrontier(board, { tileOptions: [definition("thin"), definition("fat")] });
	const centralVertices = frontier.forced.map((tile) =>
		Object.entries(verticesFor(tile, side)).find(([, point]) => Math.hypot(point.x, point.y) < 1e-5)?.[0],
	);
	assert.ok(centralVertices.includes("B"));

	const forcedAtOrigin = (tiles) => {
		const localBoard = new Board(side);
		tiles.forEach((tile) => localBoard.add(tile));
		return new Set(structuralPlacementFrontier(localBoard, { tileOptions: [definition("thin"), definition("fat")] }).forced.map((tile) =>
			Object.entries(verticesFor(tile, side)).find(([, point]) => Math.hypot(point.x, point.y) < 1e-5)?.[0],
		).filter(Boolean));
	};
	const dgg = forcedAtOrigin([
		atOriginVertex("thin", "D", -162, "dgg-d"),
		atOriginVertex("fat", "G", -18, "dgg-g1"),
		atOriginVertex("fat", "G", 54, "dgg-g2"),
	]);
	assert.ok(dgg.has("G") && dgg.has("B"), "DGG は型が曖昧でも GBDGG までを確定する");
	const ggb = forcedAtOrigin([
		atOriginVertex("fat", "G", -54, "ggb-g1"),
		atOriginVertex("fat", "G", 18, "ggb-g2"),
		atOriginVertex("thin", "B", 162, "ggb-b"),
	]);
	assert.ok(ggb.has("D") && ggb.has("G"), "GGB は型が曖昧でも GGBDG までを確定する");
});

test("確定配置の仮想盤面は次手番にも保持し、非確定配置の近傍だけを再探索する", () => {
	const definition = (shape) => ({
		shape,
		edgeTerrain: shape === "thin" ? { AB: "F", BC: "F", CD: "F", DA: "F" } : { EF: "F", FG: "F", GH: "F", HE: "F" },
		featureGroups: { city: [], road: [], field: [] },
	});
	const board = new Board(120);
	const thin = createTile(definition("thin"), "thin-option");
	const fat = createTile(definition("fat"), "fat-option");
	board.add(createTile(definition("thin"), "start"));
	const previous = structuralPlacementFrontier(board, { tileOptions: [thin, fat] });
	const ghosts = new Board(120);
	ghosts.tiles = previous.forced;
	const placed = placementCandidates(board, createTile(definition("fat"), "placed"), { tileOptions: [thin, fat] })
		.find((candidate) => !ghosts.overlaps(candidate));
	assert.ok(placed, "確定配置と重ならない通常候補がある");
	board.add(placed);
	const resumed = structuralPlacementFrontier(board, {
		tileOptions: [thin, fat],
		previous,
		changedTile: placed,
	});
	const uncached = structuralPlacementFrontier(board, {
		tileOptions: [thin, fat],
		// 完全一致キャッシュの有無で、確定配置の結果が変わらないことを確認する。
		previous: { ...previous, domainCache: new Map() },
		changedTile: placed,
	});
	const positions = (frontier) => frontier.forced.map(structuralPositionKey).sort();
	assert.ok(positions(previous).every((position) => positions(resumed).includes(position)));
	assert.ok(resumed.virtualTiles.length > previous.virtualTiles.length);
	assert.ok(resumed.domainCache.size > 0, "構造探索の完全一致キャッシュを記録する");
	assert.deepEqual(positions(resumed), positions(uncached), "キャッシュの有無で確定配置を変えない");
});

test("確定配置の探索後、外周を含む全頂点を再探索しても新しい確定配置は増えない", () => {
	const randomFor = (seed) => {
		let value = seed >>> 0;
		return () => {
			value = (value * 1664525 + 1013904223) >>> 0;
			return value / 0x100000000;
		};
	};
	for (const seed of [11, 29, 47]) {
		const game = new GameEngine({ random: randomFor(seed) });
		for (let turn = 0; turn < 8 && !game.state.finished; turn++) {
			const frontier = game.structuralFrontier();
			const virtualBoard = new Board(game.state.board.side);
			virtualBoard.tiles = structuredClone(frontier.virtualTiles);
			const exteriorVertexKeys = new Set(virtualBoard.freeEdges().flatMap(({ edge }) => [edge.a, edge.b])
				.map((point) => `${Math.round(point.x * 100000)}:${Math.round(point.y * 100000)}`));
			assert.ok(exteriorVertexKeys.size > 0, `seed ${seed}, turn ${turn}: 外周頂点が存在する`);
			// 新規盤面として渡すと、全タイルの全頂点（外周を含む）を起点に
			// 探索する。ここで増えなければ増分探索は不動点まで到達している。
			const fullRescan = structuralPlacementFrontier(virtualBoard, {
				tileOptions: game.tileOptions,
				allowVerticalMatchingPattern: game.rules.allowVerticalMatchingPattern,
			});
			assert.equal(fullRescan.forced.length, 0, `seed ${seed}, turn ${turn}: 全外周再探索で確定配置が増えない`);
			const candidate = game.candidates()[0];
			if (!candidate) break;
			game.placeTile(candidate);
			if (game.state.phase === "placeMeeple") game.skipMeeple();
		}
	}
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
  const deckBefore = game.state.deck.length;
  const boardBefore = game.state.board.tiles.length;
  const discardedBefore = game.state.discarded.length;
  const oldTileId = game.state.currentTile.id;
  game.redrawCurrentTile();
  assert.equal(game.activePlayer.redrawUsed, true);
  assert.equal(game.state.deck.length, deckBefore - 1);
  assert.equal(game.state.board.tiles.length, boardBefore);
  assert.equal(game.state.discarded.length, discardedBefore + 1);
  assert.equal(game.state.discarded.at(-1).id, oldTileId);
  assert.notEqual(game.state.currentTile.id, oldTileId);
  assert.throws(() => game.redrawCurrentTile(), /1回まで/);
});

test("山札が空なら手元のタイルを引き直せない", () => {
  const game = new GameEngine({ random: fixedRandom, deferCandidateSearch: true });
  const tileId = game.state.currentTile.id;
  const discardedBefore = game.state.discarded.length;
  game.state.deck = [];
  assert.throws(() => game.redrawCurrentTile(), /山札が空/);
  assert.equal(game.state.currentTile.id, tileId);
  assert.equal(game.state.discarded.length, discardedBefore);
  assert.equal(game.activePlayer.redrawUsed, false);
});

test("ミラー版は辺・アンカー・草原小領域を左右反転し、山札には入らない", () => {
  // 山札の採用カードはユーザーが編集できるため、タイル定義の検証はカタログを使う。
  const original = createTileCatalog(fixedRandom).find((tile) => tile.idPrefix === "city-road-end-c" && tile.shape === "thin");
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

test("テーマ別アンカーはdefaultを継承し、テーマ固有座標だけを上書きできる", () => {
	const key = "thin:straight-road", theme = MANUAL_FEATURE_ANCHORS.get("meadow"), original = theme.get(key);
	try {
		const fallback = manualFeatureAnchorsFor("thin", "straight-road", "meadow");
		assert.deepEqual(fallback, manualFeatureAnchorsFor("thin", "straight-road", "default"));
		theme.set(key, { ...fallback, road: [{ x: .123, y: -.234 }] });
		assert.deepEqual(manualFeatureAnchorsFor("thin", "straight-road", "meadow").road, [{ x: .123, y: -.234 }]);
	} finally {
		if (original) theme.set(key, original);
		else theme.delete(key);
	}
});

test("試作山札の全特徴には編集用の明示アンカーがある", () => {
	const expectedMonasteryAnchors = {
		"thin:monastery-field": [{ x: -.015, y: .015 }],
		"fat:monastery-field": [{ x: .017, y: .042 }],
		"thin:monastery-road-end": [{ x: 0, y: 0 }],
		"fat:monastery-road-end": [{ x: 0, y: 0 }],
		"thin:monastery-road-end-reverse": [{ x: .059, y: -.017 }],
		"fat:monastery-road-end-reverse": [{ x: 0, y: 0 }],
		"thin:monastery-two-road-ends": [{ x: .008, y: -.02 }],
		"fat:monastery-two-road-ends": [{ x: .006, y: -.002 }],
	};
	for (const tile of createPrototypeDeck(fixedRandom)) {
		for (const type of ["city", "road", "field"]) {
			assert.equal(tile.featureAnchors[type].length, tile.featureGroups[type].length, `${tile.id}:${type}`);
			tile.featureGroups[type].forEach((_, index) => assert.ok(manualAnchorForFeature(tile, type, index), `${tile.id}:${type}:${index}`));
		}
		if (tile.hasMonastery) {
			const key = `${tile.shape}:${tile.idPrefix}`;
			assert.deepEqual(tile.featureAnchors.monastery, expectedMonasteryAnchors[key], tile.id);
		}
	}
});

test("テーマ画像の名前は種別・形状・領域を短縮表記で含む", () => {
  // テーマ画像は山札の採用状況に依存しないため、カタログから代表タイルを取得する。
  const tile = createTileCatalog(fixedRandom).find((candidate) => candidate.idPrefix === "city-road-end-c" && candidate.shape === "thin");
  assert.equal(tileAssetFilename(tile, "field", 0), "city-road-end-c_thin_field-134.png");
  assert.equal(tileAssetFilename(tile, "road", 0), "city-road-end-c_thin_road-2.png");
  assert.equal(tileAssetFilename(tile, "city", 0), "city-road-end-c_thin_city-1.png");
  assert.equal(tileAssetFilename(mirrorTile(tile), "city", 0), "city-road-end-c_thin_city-1.png");
  const terrainRotated = halfTurnTerrainTile(tile);
  assert.equal(tileAssetFilename(terrainRotated, "field", 0), "city-road-end-c_thin_field-134.png");
  assert.equal(tileAssetFilename(terrainRotated, "road", 0), "city-road-end-c_thin_road-2.png");
  assert.equal(tileAssetFilename(terrainRotated, "city", 0), "city-road-end-c_thin_city-1.png");
  assert.equal(tileAssetFilename(halfTurnTerrainTile(mirrorTile(tile)), "city", 0), "city-road-end-c_thin_city-1.png");
});

test("テーマなしは画像レイヤーを描画しない", () => {
  const theme = new TileTheme({ id: "none" });
  assert.equal(theme.isEnabled(), false);
  assert.equal(theme.draw({}, {}, "field", 0, 120), false);
});

test("盤面・手元ミープルは12色の完成済みSVGを個別に使う", () => {
	for (const kind of ["standing", "lying", "reserve"]) {
		for (let color = 1; color <= MEEPLE_ASSET_COUNT; color++) {
			assert.match(MEEPLE_ASSETS[kind](color), new RegExp(`meeple-${kind}_${color}\\.svg$`));
		}
	}
});

test("完成都市は紋章を含めて2倍得点", () => {
  const board = new Board(120);
  const tile = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[[]],road:[],field:[]}, hasCrest:true }, "city-test");
  board.add(tile);
  assert.equal(scoreFeature(board, board.getTile("city-test"), "city", 0), 4);
});

test("修道院は自身を含む頂点に接するタイル数を得点", () => {
  const board = new Board(120);
  const monastery = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[],road:[],field:[]}, hasMonastery:true }, "monastery");
  board.add(monastery);
  const a = localVertices("thin", 120).A;
  for (const [index, vertex] of Object.values(localVertices("thin", 120)).entries()) {
    const around = createTile({ shape:"thin", edgeTerrain:{AB:"F",BC:"F",CD:"F",DA:"F"}, featureGroups:{city:[],road:[],field:[]} }, `around-${index}`);
    around.centerX = vertex.x - a.x; around.centerY = vertex.y - a.y; board.add(around);
  }
  assert.equal(scoreFeature(board, board.getTile("monastery"), "monastery", 0), 5);
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

test("終局時は都市・道・修道院のミープルも盤上に残り、手元数へ戻さない", () => {
	const game = new GameEngine({ random:fixedRandom });
	const tile = createTile({
		shape:"thin",
		edgeTerrain:{AB:"C",BC:"R",CD:"F",DA:"F"},
		featureGroups:{city:[["AB"]],road:[["BC"]],field:[[]]},
		hasMonastery:true,
		roadTerminals:{0:[{kind:"edge",edge:"BC"},{kind:"edge",edge:"BC"}]},
	}, "unfinished-with-meeples");
	game.state.board = new Board(120);
	game.state.board.add(tile);
	const refs = [
		game.state.board.featureRef(tile, "city", 0),
		game.state.board.featureRef(tile, "road", 0),
		"unfinished-with-meeples:monastery:0",
	];
	refs.forEach((ref) => { game.state.meeples[ref] = "p1"; });
	game.state.players[0].meeples -= refs.length;

	game.finishGame();

	assert.equal(game.state.players[0].meeples, 7 - refs.length);
	assert.ok(refs.every((ref) => game.state.meeples[ref] === "p1"));
});

test("残り山札を処理するとゲームを終了できる", () => {
  const game = new GameEngine({ random: fixedRandom });
  // 長大な盤面での候補探索を単体テストへ持ち込まず、終局遷移だけを小さな山札で検証する。
  game.state.deck = game.state.deck.slice(-3);
  const expectedTiles = game.state.board.tiles.length + game.state.discarded.length + 1 + game.state.deck.length;
  while (!game.state.finished) {
		const candidate = game.candidates()[0];
		game.placeTile(candidate);
    if (game.state.phase === "placeMeeple") game.skipMeeple();
  }
  assert.equal(game.state.board.tiles.length + game.state.discarded.length, expectedTiles);
  assert.equal(game.state.phase, "finished");
});

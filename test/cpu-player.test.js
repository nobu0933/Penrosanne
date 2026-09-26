import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine } from '../src/game/GameEngine.js';
import { chooseCpuAction, DEFAULT_CPU_WEIGHTS } from '../src/ai/CpuPlayer.js';
import { deriveSeed, seededRandom } from '../src/ai/SeededRandom.js';
import { createPrototypeDeck } from '../src/game/TileSet.js';
import { Board } from '../src/game/Board.js';
import { oneTileBridgeCopies, publicRemainingTilePool, reachableTileCopies } from '../src/ai/TacticalSearch.js';
import { placementCandidates } from '../src/game/Rules.js';
import { createCpuObservation } from '../src/ai/CpuObservation.js';

test('山札とCPUの乱数系列はシードから再現でき、系列を分離できる', () => {
	const one = seededRandom(deriveSeed(123, 'deck'));
	const again = seededRandom(deriveSeed(123, 'deck'));
	assert.deepEqual(Array.from({ length: 8 }, () => one()), Array.from({ length: 8 }, () => again()));
	assert.notEqual(deriveSeed(123, 'deck'), deriveSeed(123, 'cpu-A'));
});

test('CPUの初版は実盤面を変更せず、エンジンが受理する合法手だけを選ぶ', () => {
	const game = new GameEngine({
		playerCount: 2,
		deckType: 'standard',
		fieldScoring: true,
		titles: { vertexKing: true },
		rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true },
		random: seededRandom(deriveSeed(7, 'deck')),
	});
	const tileCount = game.state.board.tiles.length;
	const currentTileId = game.state.currentTile.id;
	const first = chooseCpuAction(game, { random: seededRandom(99), weights: DEFAULT_CPU_WEIGHTS });
	const second = chooseCpuAction(game, { random: seededRandom(99), weights: DEFAULT_CPU_WEIGHTS });
	assert.deepEqual({ placement: first.placement, meeple: first.meeple, value: first.value }, { placement: second.placement, meeple: second.meeple, value: second.value });
	assert.equal(game.state.board.tiles.length, tileCount);
	assert.equal(game.state.currentTile.id, currentTileId);
	assert.ok(game.candidates().includes(first.placement));
	assert.ok(Number.isFinite(first.value));
	game.placeTile(first.placement);
	if (game.state.phase === 'placeMeeple') {
		if (first.meeple) {
			assert.ok(game.meepleOptions().some(option => option.type === first.meeple.type && option.index === first.meeple.index));
			game.placeMeeple(first.meeple);
		} else game.skipMeeple();
	} else assert.equal(first.meeple, null);
	assert.equal(game.state.board.tiles.length, tileCount + 1);
});

test('同じ重みを先後交換した比較は、席ごとの乱数を共有できる', () => {
	const makeGame = names => new GameEngine({
		playerCount: 2,
		playerNames: names,
		deckType: 'standard',
		fieldScoring: true,
		titles: { vertexKing: true },
		rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true },
		random: seededRandom(deriveSeed(21, 'deck')),
	});
	const first = makeGame(['challenger', 'baseline']);
	const swapped = makeGame(['baseline', 'challenger']);
	const choose = game => chooseCpuAction(game, { random: seededRandom(deriveSeed(21, 'cpu-seat-0')) });
	assert.deepEqual(choose(first), choose(swapped));
});

test('残りタイル構成は公開済みタイルだけを差し引き、山札順に依存しない', () => {
	const catalog = createPrototypeDeck(() => 0, 'standard');
	const visible = [catalog[0], catalog[2]];
	const first = publicRemainingTilePool(catalog, visible);
	const reordered = publicRemainingTilePool([...catalog].reverse(), [...visible].reverse());
	const counts = pool => Object.fromEntries(pool.map(({ tile, copies }) => [`${tile.shape}:${tile.idPrefix}`, copies]));
	assert.deepEqual(counts(first), counts(reordered));
	assert.equal(first.reduce((sum, entry) => sum + entry.copies, 0), catalog.length - visible.length);
});

test('妨害用の1手先探索は実際の辺・地形を判定し、遠い地形を便乗と誤認しない', () => {
	const catalog = createPrototypeDeck(() => 0, 'standard');
	const game = new GameEngine({ deckType: 'standard', random: seededRandom(17) });
	const pool = publicRemainingTilePool(catalog, [game.state.board.tiles[0], game.state.currentTile]);
	const firstEdge = game.state.board.freeEdges()[0];
	assert.ok(reachableTileCopies(game.state.board, firstEdge, pool, game.rules) > 0);
	const city = catalog.find(tile => tile.featureGroups.city.length);
	const board = new Board(120);
	const one = { ...city, centerX: 0, centerY: 0, rotation: 0 };
	const two = { ...city, id: `${city.id}-distant`, centerX: 1000, centerY: 0, rotation: 0 };
	board.tiles = [one, two];
	const source = { type: 'city', component: board.component(one, 'city', 0) };
	const target = { type: 'city', component: board.component(two, 'city', 0) };
	assert.equal(oneTileBridgeCopies(board, source, target, pool, game.rules), 0);
});

test('戦術先読みを有効にしても実盤面は変わらず、エンジンの合法候補から選ぶ', () => {
	const game = new GameEngine({ deckType: 'standard', random: seededRandom(deriveSeed(7, 'deck')) });
	game.tilePool = publicRemainingTilePool(createPrototypeDeck(() => 0, 'standard'), [...game.state.board.tiles, game.state.currentTile]);
	const before = game.state.board.tiles.length;
	const action = chooseCpuAction(game, { random: seededRandom(11), tacticalLimit: 3 });
	assert.equal(game.state.board.tiles.length, before);
	assert.ok(game.candidates().includes(action.placement));
	assert.ok(Number.isFinite(action.value));
});

test('便乗用の1枚橋渡しは、実際につながる都市・道だけを数える', () => {
	const catalog = createPrototypeDeck(() => 0, 'standard');
	const roadTiles = [...new Map(catalog.filter(tile => tile.featureGroups.road.some(group => (Array.isArray(group) ? group : group.boundaryEdges || []).length >= 2)).map(tile => [tile.idPrefix, tile])).values()];
	const rules = { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true };
	let found = false;
	for (const startTile of roadTiles) {
		const start = { ...startTile, id: '__test-start', centerX: 0, centerY: 0, rotation: 0 };
		const board = new Board(120);
		board.tiles = [start];
		for (const freeEdge of board.freeEdges().filter(entry => entry.edge.terrain === 'R')) {
			for (const bridgeTile of roadTiles) {
				const bridges = placementCandidates(board, { ...bridgeTile, id: '__test-bridge' }, { targets: [freeEdge], ...rules });
				for (const bridge of bridges) {
					const withBridge = new Board(120);
					withBridge.tiles = [start, bridge];
					for (const exit of withBridge.freeEdges().filter(entry => entry.tile.id === bridge.id && entry.edge.terrain === 'R')) {
						const targets = placementCandidates(withBridge, { ...startTile, id: '__test-target' }, { targets: [exit], ...rules });
						for (const target of targets) {
							const withoutBridge = new Board(120);
							withoutBridge.tiles = [start, target];
							const source = { type: 'road', component: withoutBridge.component(start, 'road', 0) };
							const destination = { type: 'road', component: withoutBridge.component(target, 'road', 0) };
							if (source.component.key === destination.component.key) continue;
							if (oneTileBridgeCopies(withoutBridge, source, destination, [{ tile: bridgeTile, copies: 2 }], rules)) { found = true; break; }
						}
						if (found) break;
					}
					if (found) break;
				}
				if (found) break;
			}
			if (found) break;
		}
		if (found) break;
	}
	assert.equal(found, true);
});

test('ブラウザ用CPUは公開情報だけで3人・公開手札3枚の合法手を選べる', async () => {
	const game = new GameEngine({
		playerCount: 3, handMode: 'private-city-planning', deckType: 'lite', deferCandidateSearch: true,
		random: seededRandom(deriveSeed(9, 'deck')),
	});
	const candidates = (await game.candidateGroupsProgressively()).regular;
	assert.ok(candidates.length);
	const observation = createCpuObservation(game, candidates, createPrototypeDeck(() => 0, 'lite'));
	assert.equal('deck' in observation.state, false);
	assert.equal('hands' in observation.state, false);
	assert.ok(observation.tilePool.length);
	const action = chooseCpuAction(observation, { random: seededRandom(9), tacticalLimit: 0 });
	assert.ok(candidates.includes(action.placement));
	assert.ok(game.handForPlayer().some(tile => tile.id === action.placement._handTileId));
	game.placeTile(action.placement);
	if (game.state.phase === 'placeMeeple') {
		if (action.meeple) {
			assert.ok(game.meepleOptions().some(option => option.type === action.meeple.type && option.index === action.meeple.index));
			game.placeMeeple(action.meeple);
		} else game.skipMeeple();
	}
});

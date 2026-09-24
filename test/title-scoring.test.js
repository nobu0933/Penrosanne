import assert from 'node:assert/strict';
import test from 'node:test';
import { Board } from '../src/game/Board.js';
import { GameEngine } from '../src/game/GameEngine.js';
import { createPlayer } from '../src/game/Player.js';
import { provisionalTitleLeaders, titleAwards } from '../src/game/Scoring.js';
import { createTile } from '../src/game/Tile.js';

test('称号は有効な記録の同率首位全員に付与し、0件なら付与しない', () => {
	const players = ['p1', 'p2', 'p3'].map((id) => createPlayer({ id, name: id }));
	players[0].vertexCompletions = 3; players[1].vertexCompletions = 3;
	players[0].supportCount = 2; players[2].supportCount = 2;
	const state = { players, scoreEvents: [
		{ playerId: 'p1', type: 'road', points: 4, reason: 'complete' },
		{ playerId: 'p2', type: 'road', points: 6, reason: 'end' },
		{ playerId: 'p3', type: 'road', points: 6, reason: 'complete' },
	] };
	const awards = titleAwards(state, { vertexKing: true, roadKing: true, supportKing: true });
	assert.deepEqual(awards.map(({ playerId, titleId, points }) => [playerId, titleId, points]), [
		['p1', 'vertexKing', 10], ['p2', 'vertexKing', 10],
		['p2', 'roadKing', 10], ['p3', 'roadKing', 10],
		['p1', 'supportKing', 10], ['p3', 'supportKing', 10],
	]);
	assert.deepEqual(titleAwards(state, {}), []);
	assert.deepEqual(titleAwards({ players: players.map((p) => createPlayer({ id: p.id, name: p.name })), scoreEvents: [] },
		{ vertexKing: true, roadKing: true, supportKing: true }), []);
});

test('称号の暫定首位は未完成の所有道と同率所有者も含める', () => {
	const players = ['p1', 'p2', 'p3'].map((id) => createPlayer({ id, name: id }));
	const tiles = ['a', 'b', 'c'].map((id) => ({ id, featureGroups: { road: [[]] } }));
	const board = {
		tiles,
		featureRef: (tile) => `${tile.id}:road:0`,
		component: () => ({ features: tiles.map((tile) => ({ tile, index: 0 })) }),
	};
	const state = { board, players, scoreEvents: [{ playerId: 'p3', type: 'road', points: 2 }],
		meeples: { 'a:road:0': 'p1', 'b:road:0': 'p2' } };
	assert.deepEqual(provisionalTitleLeaders(state, { roadKing: true }),
		[{ id: 'roadKing', count: 3, playerIds: ['p1', 'p2'] }]);
	state.meeples = {};
	assert.deepEqual(provisionalTitleLeaders(state, { roadKing: true }),
		[{ id: 'roadKing', count: 2, playerIds: ['p3'] }]);
});

test('完成地形を他人だけが得点したとき、配置者の支援回数を1増やす', () => {
	const tile = createTile({ shape: 'thin', edgeTerrain: { AB: 'F', BC: 'F', CD: 'F', DA: 'F' },
		featureGroups: { city: [], road: [[]], field: [] },
		roadTerminals: { 0: [{ kind: 'intersection' }, { kind: 'intersection' }] } }, 'road');
	const board = new Board(120);
	board.add(tile);
	const players = ['p1', 'p2'].map((id) => createPlayer({ id, name: id }));
	const engine = Object.create(GameEngine.prototype);
	engine.state = { board, turn: 0, players, meeples: { [board.featureRef(tile, 'road', 0)]: 'p2' },
		scored: [], scoreEvents: [] };
	engine.scoreIfComplete(tile, 'road', 0);
	assert.equal(players[0].supportCount, 1);
	assert.equal(players[1].score, 1);
	engine.scoreIfComplete(tile, 'road', 0);
	assert.equal(players[0].supportCount, 1);
});

test('配置者のミープルがあっても得点できなければ支援、同率得点なら支援しない', () => {
	const tiles = ['one', 'two', 'three'].map((id) => ({ id, hasCrest: false }));
	const players = ['p1', 'p2'].map((id) => createPlayer({ id, name: id }));
	const board = {
		component: () => ({ features: tiles.map((tile) => ({ tile, index: 0 })), openEdges: [], key: 'city' }),
		featureRef: (tile) => `${tile.id}:city:0`,
	};
	const engine = Object.create(GameEngine.prototype);
	engine.state = { board, turn: 0, players, scored: [], scoreEvents: [],
		meeples: { 'one:city:0': 'p1', 'two:city:0': 'p2', 'three:city:0': 'p2' } };
	engine.scoreIfComplete(tiles[0], 'city', 0);
	assert.equal(players[0].score, 0);
	assert.equal(players[1].score, 6);
	assert.equal(players[0].supportCount, 1);
	engine.state.scored = [];
	engine.state.meeples = { 'one:city:0': 'p1', 'two:city:0': 'p2' };
	engine.scoreIfComplete(tiles[0], 'city', 0);
	assert.equal(players[0].supportCount, 1);
});

test('終局時に有効な称号だけを加点し、得点詳細用イベントを記録する', () => {
	const engine = new GameEngine({ deckType: 'lite', random: () => .42,
		rules: { ignoreMatchingRules: true }, titles: { vertexKing: true, roadKing: false, supportKing: false } });
	engine.state.board.tiles = [];
	engine.state.players[0].vertexCompletions = 2;
	engine.state.players[1].vertexCompletions = 1;
	engine.finishGame();
	assert.equal(engine.state.players[0].score, 10);
	assert.equal(engine.state.players[1].score, 0);
	assert.deepEqual(engine.state.titleAwards.map(({ playerId, titleId }) => [playerId, titleId]), [['p1', 'vertexKing']]);
	assert.equal(engine.state.scoreEvents.at(-1).reason, 'title');
});

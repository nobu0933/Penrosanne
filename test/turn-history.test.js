import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { beginHistoryTurn, captureHistoryMeeples, completeHistoryTurn } from '../src/game/TurnHistory.js';

test('履歴は採点で回収したミープルと、配置・回収後の状態を別々に保持する', () => {
  const state = { players: [{ id: 'p1' }], turn: 0, board: { tiles: [{}, {}] }, meeples: { 'old:road:0': 'p2' }, scoreEvents: [] };
  beginHistoryTurn(state, { id: 'new' });
  state.meeples['new:city:0'] = 'p1';
  captureHistoryMeeples(state);
  delete state.meeples['old:road:0'];
  state.scoreEvents.push({ playerId: 'p2', type: 'road', points: 3, reason: 'complete' });
  completeHistoryTurn(state);
  const entry = state.turnHistory[0];
  assert.equal(entry.placedMeeple, 'new:city:0');
  assert.equal(entry.meeples['old:road:0'], 'p2');
  assert.equal(entry.meeplesAfter['old:road:0'], undefined);
  assert.equal(entry.scores[0].points, 3);
  assert.equal(entry.tileCount, 2);
  state.meeples['new:city:0'] = 'p2';
  state.scoreEvents[0].points = 100;
  assert.equal(entry.meeples['new:city:0'], 'p1');
  assert.equal(entry.scores[0].points, 3);
});

test('実際の配置から手番ログを記録し、強制終局でも配置済みの未完了手番を失わない', () => {
  const game = new GameEngine({ random: () => .4 });
  const tile = game.candidates()[0];
  const actor = game.activePlayer.id;
  game.placeTile(tile);
  if (game.state.phase === 'placeMeeple') game.skipMeeple();
  assert.equal(game.state.turnHistory.length, 1);
  assert.equal(game.state.turnHistory[0].playerId, actor);
  assert.equal(game.state.turnHistory[0].tileId, tile.id);
  assert.equal(game.state.turnHistory[0].tileCount, 2);
  const next = game.candidates()[0];
  game.placeTile(next);
  game.finishGame();
  assert.equal(game.state.turnHistory.length, 2);
  assert.ok(game.state.finalMeeples);
  game.finishGame();
  assert.equal(game.state.turnHistory.length, 2);
});

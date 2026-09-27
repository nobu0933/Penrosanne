import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { GameEngine } from '../src/game/GameEngine.js';
import { createPrototypeDeck } from '../src/game/TileSet.js';
import { createMctsSession } from '../src/ai/MctsCpu.js';
import { seededRandom } from '../src/ai/SeededRandom.js';

const turns = Math.max(0, Number(process.argv[2] || 0));
const simulations = Math.max(1, Number(process.argv[3] || 3));
const reuseCandidates = process.argv[4] !== 'no-cache';
const normalBoard = process.argv[5] === 'normal';
const pattern = JSON.parse(readFileSync(new URL('../training-patterns/standard-training-v1/pattern-01.json', import.meta.url)));
const game = new GameEngine({ random: seededRandom(13), trainingPattern: normalBoard ? null : pattern,
  rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true },
  titles: { vertexKing: true } });
for (let turn = 0; turn < turns && !game.state.finished; turn++) {
  const legal = game.candidates();
  game.placeTile(legal[turn % legal.length]);
  if (game.state.phase === 'placeMeeple') game.skipMeeple();
}
if (game.state.finished) throw new Error('指定した手数より先に対局が終了しました。');
const catalog = createPrototypeDeck(() => 0, 'standard');
const profile = {};
const start = performance.now();
const session = createMctsSession(game, { catalog, random: seededRandom(7), profile, reuseCandidates });
profile.setupMs = performance.now() - start;
for (let index = 0; index < simulations; index++) {
  const stepStart = performance.now();
  session.step();
  profile.totalStepMs = (profile.totalStepMs || 0) + performance.now() - stepStart;
}
console.log(JSON.stringify({ turns: game.state.board.tiles.length - 1, simulations, reuseCandidates, normalBoard,
  legalCandidates: game.candidates().length, profile, averageMs: profile.totalStepMs / simulations }, null, 2));

import { GameEngine } from '../src/game/GameEngine.js';
import { structuralPositionKey } from '../src/game/Rules.js';
import { cachedVertexExpansionTemplates } from '../src/game/TrainingVertexTemplates.js';
import { seededRandom } from '../src/ai/SeededRandom.js';

const turns = Math.max(1, Number(process.argv[2] || 12));
const seed = Number(process.argv[3] || 19);
const buildStarted = performance.now();
const templates = cachedVertexExpansionTemplates(120);
const buildMs = performance.now() - buildStarted;
const normal = new GameEngine({ random: seededRandom(seed) });
const fast = new GameEngine({ random: seededRandom(seed), trainingFastFrontier: true });
const key = tile => JSON.stringify([structuralPositionKey(tile), tile.idPrefix,
  tile.terrainPattern, Boolean(tile.mirrored), tile.matchingPattern, tile.matchingPatternOptions]);
const positions = tiles => tiles.map(structuralPositionKey).sort();
let normalMs = 0, fastMs = 0, equal = true, completed = 0;
const windows = [];
let windowNormalMs = 0, windowFastMs = 0;
for (let turn = 0; turn < turns && !normal.state.finished; turn++) {
  const choices = normal.candidates(), next = choices[turn % choices.length];
  const other = fast.candidates().find(tile => key(tile) === key(next));
  if (!other) { equal = false; break; }
  let started = performance.now();
  normal.placeTile(next);
  if (normal.state.phase === 'placeMeeple') normal.skipMeeple();
  const normalTurnMs = performance.now() - started;
  normalMs += normalTurnMs;
  windowNormalMs += normalTurnMs;
  started = performance.now();
  fast.placeTile(other);
  if (fast.state.phase === 'placeMeeple') fast.skipMeeple();
  const fastTurnMs = performance.now() - started;
  fastMs += fastTurnMs;
  windowFastMs += fastTurnMs;
  completed++;
  if (completed % 10 === 0 || completed === turns || normal.state.finished) {
    windows.push({ throughTurn: completed, normalMs: Math.round(windowNormalMs), fastMs: Math.round(windowFastMs),
      speedup: Number((windowNormalMs / windowFastMs).toFixed(2)), forced: normal.structuralCandidates().length });
    windowNormalMs = 0;
    windowFastMs = 0;
  }
  if (JSON.stringify(positions(normal.structuralCandidates())) !== JSON.stringify(positions(fast.structuralCandidates()))
    || JSON.stringify(normal.candidates().map(key).sort()) !== JSON.stringify(fast.candidates().map(key).sort())) {
    equal = false;
    break;
  }
}
console.log(JSON.stringify({ seed, turns: completed, equal, templateBuildMs: Math.round(buildMs),
  templateTileCounts: Object.fromEntries(Object.entries(templates).map(([type, template]) => [type, template.tiles.length])),
  normalMs: Math.round(normalMs), fastMs: Math.round(fastMs), speedup: Number((normalMs / fastMs).toFixed(2)),
  forced: normal.structuralCandidates().length, windows }, null, 2));
if (!equal) process.exitCode = 1;

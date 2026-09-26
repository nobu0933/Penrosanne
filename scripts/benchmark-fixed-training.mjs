import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { playStandardMatch } from '../src/ai/SelfPlay.js';
import { MIN_TRAINING_CONFIRMED } from '../src/game/FixedTrainingLayout.js';

let seed = 7, patternFile = null;
for (let index = 2; index < process.argv.length; index++) {
	const key = process.argv[index], value = process.argv[++index];
	if (key === '--seed') seed = Number(value);
	else if (key === '--pattern') patternFile = value;
	else throw new Error(`Unknown option: ${key}`);
}
if (!Number.isSafeInteger(seed) || seed < 0 || !patternFile) throw new Error('Usage: node scripts/benchmark-fixed-training.mjs --pattern pattern-01.json [--seed N]');
const pattern = JSON.parse(readFileSync(resolve(patternFile), 'utf8'));
if (pattern.forcedCount < MIN_TRAINING_CONFIRMED) throw new Error(`At least ${MIN_TRAINING_CONFIRMED} confirmed placements are required.`);
const results = [];
for (const [mode, trainingPattern] of [['fixed', pattern], ['normal', null]]) {
	console.log(`${mode}: starting`);
	const result = playStandardMatch({ seed, trainingPattern, onTurn: ({ turn, elapsedMs }) => {
		if (turn % 10 === 0) console.log(`${mode}: ${turn} turns, ${Math.round(elapsedMs / 1000)} s`);
	} });
	results.push({ mode, turns: result.turns, elapsedMs: result.elapsedMs, setupMs: result.setupMs, thinkingMs: result.thinkingMs, rulesMs: result.rulesMs, discarded: result.discarded.length });
}
const [fixed, normal] = results;
console.log(JSON.stringify({ seed, patternSeed: pattern.seed, results, speedupTotal: Number((normal.elapsedMs / fixed.elapsedMs).toFixed(2)), speedupPerTurn: Number(((normal.elapsedMs / normal.turns) / (fixed.elapsedMs / fixed.turns)).toFixed(2)) }, null, 2));

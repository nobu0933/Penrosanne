import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GameEngine } from '../src/game/GameEngine.js';
import { createPrototypeDeck } from '../src/game/TileSet.js';
import { structuralPositionKey } from '../src/game/Rules.js';
import { deriveSeed, seededRandom } from '../src/ai/SeededRandom.js';

function optionsFrom(argv) {
	const options = { count: 3, minForced: 1100, maxTurns: 100, maxSeeds: 30, seed: 1, deckSeed: null, strategy: 'random', out: 'training-patterns' };
	for (let index = 0; index < argv.length; index++) {
		const key = argv[index];
		if (key === '--help') {
			console.log('Usage: node scripts/generate-training-patterns.mjs [--count N] [--min-forced N] [--max-turns N] [--max-seeds N] [--seed N] [--deck-seed N] [--strategy random|outer] [--out NEW_DIRECTORY]');
			process.exit(0);
		}
		const normalized = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
		if (!key.startsWith('--') || !(normalized in options) || !argv[index + 1]) throw new Error(`Unknown or incomplete option: ${key}`);
		options[normalized] = argv[++index];
	}
	for (const key of ['count', 'minForced', 'maxTurns', 'maxSeeds', 'seed', 'deckSeed']) {
		if (key === 'deckSeed' && options[key] === null) continue;
		options[key] = Number(options[key]);
		if (!Number.isSafeInteger(options[key]) || options[key] < (key === 'seed' ? 0 : 1)) throw new Error(`Invalid ${key}`);
	}
	if (!['random', 'outer'].includes(options.strategy)) throw new Error('strategy must be random or outer');
	return options;
}

function geometry(tile) {
	return { shape: tile.shape, x: tile.centerX, y: tile.centerY, rotation: tile.rotation || 0 };
}

function generate(seed, options) {
	const deckSeed = options.deckSeed ?? seed;
	const game = new GameEngine({
		playerCount: 2, deckType: 'standard', side: 120, fieldScoring: true,
		titles: { vertexKing: true }, deferCandidateSearch: true,
		rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true },
		random: seededRandom(deriveSeed(deckSeed, 'pattern-deck')),
	});
	// 抽出専用の長時間対局。定義は変えず、同じStandardの枚数を追加する。
	for (let copy = 0; copy < 3; copy++) {
		const extra = createPrototypeDeck(seededRandom(deriveSeed(deckSeed, `extension-${copy}`)), 'standard');
		for (const tile of extra) tile.id += `-pattern-${seed}-${copy}`;
		game.state.deck.unshift(...extra);
	}
	const decisionRandom = seededRandom(deriveSeed(seed, 'pattern-decisions'));
	const startId = game.state.board.tiles[0].id;
	const begun = performance.now();
	let turns = 0, forced = [];
	let peak = 0;
	while (!game.state.finished && turns < options.maxTurns) {
		forced = game.structuralCandidates();
		peak = Math.max(peak, forced.length);
		if (forced.length >= options.minForced) break;
		const choices = game.candidates();
		if (!choices.length) {
			if (!game.state.deck.length) break;
			game.state.discarded.push(game.state.currentTile);
			game.state.currentTile = null;
			game.nextTurn();
			continue;
		}
		const forcedKeys = new Set(forced.map(structuralPositionKey));
		const extending = choices.filter(tile => !forcedKeys.has(structuralPositionKey(tile)));
		// 手元のタイルによって未確定位置を選べない手番もある。
		const optionsForTurn = extending.length ? extending : choices;
		const choice = options.strategy === 'outer'
			? optionsForTurn.reduce((best, tile) => Math.hypot(tile.centerX, tile.centerY) > Math.hypot(best.centerX, best.centerY) ? tile : best)
			: optionsForTurn[Math.floor(decisionRandom() * optionsForTurn.length)];
		game.placeTile(choice);
		if (game.state.phase === 'placeMeeple') game.skipMeeple();
		turns++;
		if (turns % 5 === 0) console.log(`seed ${seed}: ${turns} turns, ${forced.length} forced, ${Math.round((performance.now() - begun) / 1000)} s`);
	}
	if (forced.length < options.minForced) {
		console.log(`seed ${seed}: peak ${peak} forced after ${turns} turns; trying next seed`);
		return null;
	}
	const occupied = game.state.board.tiles.map(geometry);
	const slots = new Map();
	for (const tile of [...game.state.board.tiles, ...forced]) slots.set(structuralPositionKey(tile), geometry(tile));
	return {
		format: 1, side: 120, seed, deckSeed, strategy: `legal-${options.strategy}-unforced-first`,
		sourceDeck: 'extended-standard-for-extraction-only', startId, turns,
		forcedCount: forced.length, occupied, slots: [...slots.values()],
		elapsedMs: Math.round(performance.now() - begun),
	};
}

const options = optionsFrom(process.argv.slice(2));
const output = resolve(options.out);
if (existsSync(output)) throw new Error(`Output already exists: ${output}`);
mkdirSync(output, { recursive: true });
let saved = 0;
for (let attempt = 0; attempt < options.maxSeeds && saved < options.count; attempt++) {
	const pattern = generate(options.seed + attempt, options);
	if (!pattern) continue;
	const filename = resolve(output, `pattern-${String(++saved).padStart(2, '0')}.json`);
	writeFileSync(filename, JSON.stringify(pattern));
	console.log(`${filename}: ${pattern.forcedCount} forced, ${pattern.slots.length} slots, ${pattern.elapsedMs} ms`);
}
if (saved < options.count) throw new Error(`${saved}/${options.count} patterns found within ${options.maxSeeds} seeds`);

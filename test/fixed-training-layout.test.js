import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine } from '../src/game/GameEngine.js';
import { createFixedTrainingLayout } from '../src/game/FixedTrainingLayout.js';
import { seededRandom } from '../src/ai/SeededRandom.js';
import { fileURLToPath } from 'node:url';
import { loadTrainingPatterns } from '../scripts/training-patterns.mjs';

function geometry(tile) { return { shape: tile.shape, x: tile.centerX, y: tile.centerY, rotation: tile.rotation }; }

test('固定訓練盤面は初期タイルを中央へ合わせ、保存済み位置だけに候補を絞る', () => {
	const normal = new GameEngine({ random: seededRandom(17) });
	const start = normal.state.board.tiles[0], allowed = normal.candidates()[0];
	const other = start.shape === 'thin' ? 'fat' : 'thin';
	const slots = [geometry(start), geometry(allowed)];
	for (let index = 0; index < 1500; index++) slots.push({ shape: other, x: (index - 750) * 1000, y: 1000, rotation: 0 });
	const pattern = { format: 1, side: 120, seed: 99, forcedCount: 1501, slots };
	const game = new GameEngine({ random: seededRandom(17), trainingPattern: pattern });
	const candidates = game.candidates();
	assert.ok(candidates.length > 0);
	assert.ok(candidates.every(candidate => game.fixedTrainingLayout.allows(candidate)));
	assert.deepEqual(game.structuralCandidates(), []);
	assert.doesNotThrow(() => game.placeTile(candidates[0]));
	assert.ok(game.state.board.tiles.length === 2);
});

test('固定訓練盤面は開始位置を回転・平行移動しても一致する', () => {
	const pattern = { format: 1, side: 120, seed: 5, forcedCount: 1501, slots: [
		{ shape: 'thin', x: 100, y: 200, rotation: Math.PI / 2 },
		{ shape: 'fat', x: 100, y: 320, rotation: Math.PI / 2 },
		...Array.from({ length: 1499 }, (_, index) => ({ shape: 'fat', x: 100000 + index, y: 100000, rotation: 0 })),
	] };
	const layout = createFixedTrainingLayout(pattern, { shape: 'thin' }, 120);
	assert.equal(layout.allows({ shape: 'thin', centerX: 0, centerY: 0, rotation: 0 }), true);
	assert.equal(layout.allows({ shape: 'fat', centerX: 120, centerY: 0, rotation: 0 }), true);
	assert.equal(layout.allows({ shape: 'fat', centerX: 121, centerY: 0, rotation: 0 }), false);
});

test('保存済みの3パターンは実際の標準対局の合法候補を生成できる', () => {
	const directory = fileURLToPath(new URL('../training-patterns/standard-training-v1/', import.meta.url));
	const patterns = loadTrainingPatterns(directory);
	assert.equal(patterns.length, 3);
	for (const pattern of patterns) {
		const game = new GameEngine({
			deckType: 'standard', trainingPattern: pattern,
			rules: { allowVerticalMatchingPattern: true, allowTerrainHalfTurn: true, allowTerrainMirror: true },
			random: seededRandom(17),
		});
		assert.ok(game.candidates().length > 0);
		assert.ok(game.candidates().every(candidate => game.fixedTrainingLayout.allows(candidate)));
		assert.equal(game.structuralCandidates().length, 0);
	}
});

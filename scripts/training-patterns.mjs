import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MIN_TRAINING_CONFIRMED } from '../src/game/FixedTrainingLayout.js';

export function loadTrainingPatterns(directory) {
	if (!directory) return null;
	const names = readdirSync(resolve(directory)).filter(name => /^pattern-\d+\.json$/.test(name)).sort();
	if (!names.length) throw new Error(`固定訓練パターンが見つかりません: ${directory}`);
	return names.map(name => {
		const pattern = JSON.parse(readFileSync(join(resolve(directory), name), 'utf8'));
		if (pattern.format !== 1 || pattern.forcedCount < MIN_TRAINING_CONFIRMED || !Array.isArray(pattern.slots))
			throw new Error(`確定配置が${MIN_TRAINING_CONFIRMED}枚未満か、形式が不正です: ${name}`);
		return pattern;
	});
}

export function patternForSeed(patterns, seed) {
	return patterns ? patterns[seed % patterns.length] : null;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { handDisplayTile, handTileLayout } from '../src/ui/HandTileLayout.js';
import { verticesFor } from '../src/game/Tile.js';

test('手元タイルは両形状・全方向で側面と影までキャンバス内に収まる', () => {
	for (const [width, height] of [[136, 96], [116, 82]]) {
		for (const shape of ['thin', 'fat']) {
			for (let degrees = 0; degrees < 360; degrees++) {
				const tile = { shape, rotation: degrees * Math.PI / 180 };
				const layout = handTileLayout(tile, width, height);
				const points = Object.values(verticesFor({ ...tile, centerX: layout.x, centerY: layout.y }, layout.side));
				for (const p of points) {
					assert.ok(p.x >= 3 - 1e-8 && p.x <= width - 3 + 1e-8);
					assert.ok(p.y >= 3 - 1e-8 && p.y + 12 <= height - 3 + 1e-8);
				}
			}
		}
	}
});

test('THINだけ手元では縦長になり、配置用タイルの向きは変えない', () => {
	const thin = { shape: 'thin', rotation: 0, centerX: 14, centerY: -8 };
	const displayedThin = handDisplayTile(thin);
	assert.notEqual(displayedThin, thin);
	assert.equal(displayedThin.rotation, Math.PI / 2);
	assert.equal(thin.rotation, 0);
	const points = Object.values(verticesFor({ ...displayedThin, centerX: 0, centerY: 0 }, 1));
	assert.ok(Math.max(...points.map(point => Math.abs(point.y))) > Math.max(...points.map(point => Math.abs(point.x))));
	const fat = { shape: 'fat', rotation: Math.PI / 3 };
	assert.equal(handDisplayTile(fat), fat);
});

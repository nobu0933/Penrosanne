import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardView } from '../src/ui/BoardView.js';
import { verticesFor } from '../src/game/Tile.js';
import { roundedTilePath } from '../src/ui/TileTheme.js';

test('描画輪郭だけを内側に縮め、投影影は80%で角丸を強める', () => {
	for (const shape of ['thin', 'fat']) {
		const trace = (...args) => {
			const curves = [];
			roundedTilePath({ beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
				quadraticCurveTo(...values) { curves.push(values); } }, shape, 100, ...args);
			return curves;
		};
		const full = trace(1), inset = trace(), shadow = trace(.8, .18);
		full.forEach((corner, i) => {
			for (const axis of [0, 1]) {
				assert.ok(Math.abs(inset[i][axis] - corner[axis] * .985) < 1e-8);
				assert.ok(Math.abs(shadow[i][axis] - corner[axis] * .8) < 1e-8);
			}
			assert.ok(Math.hypot(shadow[i][2]-shadow[i][0], shadow[i][3]-shadow[i][1]) > Math.hypot(inset[i][2]-inset[i][0], inset[i][3]-inset[i][1]));
		});
	}
});

test('クリック落下中も投影影を全タイル要素の下に描く', () => {
	const view = viewForTest(), calls = [];
	view.ctx = new Proxy({}, { get: () => () => {} });
	view.previewTile = { id:'preview', centerX:0, centerY:0 };
	view.previewDropOffsetY = 10;
	view.drawLandingShadow = () => calls.push('shadow');
	view.drawTileBody = () => calls.push('body');
	view.drawTile = () => calls.push('top');
	view.drawFeatureMarkers = view.drawMeeples = () => {};
	view.render();
	assert.deepEqual(calls, ['shadow', 'body', 'top']);
	calls.length = 0;
	view.previewDropOffsetY = 0;
	view.render();
	assert.deepEqual(calls, ['body', 'top']);
});

function viewForTest() {
	const view = Object.create(BoardView.prototype);
	Object.assign(view, {
		width: 800, height: 600, camera: { x: 0, y: 0, zoom: 1 },
		options: { side: 100, placed: [], candidates: [] }, renderFrame: null,
	});
	return view;
}

test('画面端に接するタイルと側面はズーム・回転しても描画対象に残る', () => {
	const view = viewForTest();
	for (const zoom of [.2, 1, 2.8]) {
		view.camera = { x: 95, y: -74, zoom };
		for (const shape of ['thin', 'fat']) {
			for (let rotation = 0; rotation < Math.PI * 2; rotation += Math.PI / 10) {
				const tile = { shape, rotation, centerX: 0, centerY: 0 };
				const vertices = Object.values(verticesFor(tile, view.options.side));
				// 上端の外側に中心があり、底面の影だけが画面に入る場合。
				tile.centerY = (-view.height / 2 - view.camera.y - 11) / zoom - Math.max(...vertices.map(p => p.y));
				assert.equal(view.tileIsVisible(tile), true);
				tile.centerY -= 1000 / zoom;
				assert.equal(view.tileIsVisible(tile), false);
			}
		}
	}
});

test('画面外を省いても履歴のタイル番号と側面・上面・ミープルの描画順を保つ', () => {
	const view = viewForTest(), calls = [];
	const alphas = [];
	view.ctx = new Proxy({ globalAlpha: 1, save() { alphas.push(this.globalAlpha); }, restore() { this.globalAlpha = alphas.pop(); } }, { get: (ctx, key) => key in ctx ? ctx[key] : () => {} });
	const tile = (id, centerX) => ({ id, centerX, centerY: 0 });
	view.options.placed = [tile('outside', 10000), tile('old', 0), tile('future', 50)];
	view.historyEntry = { tileCount: 2 };
	view.previewTile = tile('preview', 80);
	view.drawTileBody = (ctx, tile) => calls.push(['body', tile.id, ctx.globalAlpha]);
	view.drawTile = (ctx, tile) => calls.push(['top', tile.id, ctx.globalAlpha]);
	view.drawFeatureMarkers = () => calls.push(['markers']);
	view.drawMeeples = () => calls.push(['meeples']);
	view.render();
	assert.deepEqual(calls.map(c => c.slice(0, 2)), [
		['body', 'old'], ['body', 'future'], ['body', 'preview'],
		['top', 'old'], ['top', 'future'], ['top', 'preview'], ['markers'], ['meeples'],
	]);
	assert.equal(calls[0][2], 1);
	assert.equal(calls[1][2], .18);
	assert.equal(calls[3][2], 1);
	assert.equal(calls[4][2], .18);
});

test('同じフレームのカメラ操作は最新の状態で1回だけ描画する', (t) => {
	const view = viewForTest(), frames = [];
	const original = globalThis.requestAnimationFrame;
	globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
	t.after(() => { if (original) globalThis.requestAnimationFrame = original; else delete globalThis.requestAnimationFrame; });
	let renderedCamera;
	view.render = () => { renderedCamera = { ...view.camera }; };
	for (let i = 0; i < 100; i++) { view.camera.x = i; view.requestRender(); }
	assert.equal(frames.length, 1);
	frames[0]();
	assert.equal(renderedCamera.x, 99);
	view.requestRender();
	assert.equal(frames.length, 2);
});

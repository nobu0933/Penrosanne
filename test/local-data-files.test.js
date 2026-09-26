import test from 'node:test';
import assert from 'node:assert/strict';
import { listLocalDataFiles, readLocalDataFile } from '../src/ai/LocalDataFiles.js';

test('許可されたフォルダーのJSON一覧だけを取得する', async () => {
	const original = globalThis.fetch;
	let requested;
	globalThis.fetch = async (url, options) => {
		requested = { url, options };
		return { ok: true, json: async () => ({ files: [{ name: 'cpu.json' }, { name: 'note.txt' }] }) };
	};
	try {
		assert.deepEqual(await listLocalDataFiles('cpu'), [{ name: 'cpu.json' }]);
		assert.equal(requested.url, '/api/local-data-files?kind=cpu');
		assert.equal(requested.options.cache, 'no-store');
		await assert.rejects(listLocalDataFiles('other'), /Unknown local data folder/);
	} finally { globalThis.fetch = original; }
});

test('フォルダー内のファイルを読み、パス指定は拒否する', async () => {
	const original = globalThis.fetch;
	let requested;
	globalThis.fetch = async url => { requested = url; return { ok: true, json: async () => ({ format: 1 }) }; };
	try {
		assert.deepEqual(await readLocalDataFile('battle', '対局 1.json'), { format: 1 });
		assert.equal(requested, '/battle-data/%E5%AF%BE%E5%B1%80%201.json');
		await assert.rejects(readLocalDataFile('battle', '../outside.json'), /Invalid local data file/);
	} finally { globalThis.fetch = original; }
});

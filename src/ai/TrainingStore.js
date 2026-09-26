import { DEFAULT_CPU_WEIGHTS } from './CpuPlayer.js';
import { TRAINING_PHASES } from './TrainingEvolution.js';

const DATABASE_NAME = 'penrosanne-cpu-training';
const DATABASE_VERSION = 3;
const STORE_NAME = 'recent-generations';
const CACHE_LIMIT = 10;
let databasePromise = null;
let lastStoredAt = 0;

export function latestArchiveGeneration(payload) {
	const records = Array.isArray(payload) ? payload : payload?.generations;
	if (!Array.isArray(records) || (payload?.format !== undefined && payload.format !== 1)) throw new Error('CPU generation JSON format is not supported.');
	const valid = records.filter(record => Number.isInteger(record?.generation) && record.generation >= 0 && record.championWeights && Array.isArray(record.candidates) && Array.isArray(record.matches));
	if (!valid.length) throw new Error('No valid generations were found in this file.');
	return valid.reduce((latest, record) => record.generation >= latest.generation ? record : latest);
}

export function recentTrainingGenerations(records) {
	return [...records].sort((a, b) => (a.storedAt || 0) - (b.storedAt || 0) || String(a.storageId).localeCompare(String(b.storageId))).slice(-CACHE_LIMIT);
}

function database() {
	if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			const store = db.objectStoreNames.contains(STORE_NAME)
				? request.transaction.objectStore(STORE_NAME)
				: db.createObjectStore(STORE_NAME, { keyPath: 'storageId' });
			if (!store.indexNames.contains('storedAt')) store.createIndex('storedAt', 'storedAt');
			if (db.objectStoreNames.contains('generations')) {
				request.transaction.objectStore('generations').getAll().onsuccess = event => {
					const rows = event.target.result.map(record => ({ ...record, storageId: `legacy:${record.generation}`, storedAt: Date.parse(record.createdAt) || record.generation }));
					for (const record of recentTrainingGenerations(rows)) store.put(record);
					db.deleteObjectStore('generations');
				};
			}
		};
		request.onsuccess = () => {
			request.result.onversionchange = () => request.result.close();
			resolve(request.result);
		};
		request.onerror = () => { databasePromise = null; reject(request.error); };
	});
	return databasePromise;
}

function summary(record) {
	return {
		storageId: record.storageId, lineageName: record.lineageName || '', generation: record.generation,
		storedAt: record.storedAt, createdAt: record.createdAt, method: record.method,
		trainingSchema: record.trainingSchema || 0, championId: record.championId,
		championByPhase: record.championByPhase, championWeights: record.championWeights,
		config: record.config,
		candidates: record.candidates.map(({ id, weights, phaseWeights, wins, draws, losses, scoreDifference, progressScoreDifference, progressEvaluationDifference }) => ({ id, weights, phaseWeights, wins, draws, losses, scoreDifference, progressScoreDifference, progressEvaluationDifference })),
	};
}

export async function listTrainingGenerations() {
	const db = await database();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly');
		const request = transaction.objectStore(STORE_NAME).getAll();
		transaction.oncomplete = () => resolve(recentTrainingGenerations(request.result).map(summary));
		transaction.onerror = () => reject(transaction.error);
	});
}

export async function readTrainingGeneration(storageId) {
	const db = await database();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly');
		const request = transaction.objectStore(STORE_NAME).get(String(storageId));
		transaction.oncomplete = () => resolve(request.result || null);
		transaction.onerror = () => reject(transaction.error);
	});
}

export async function clearTrainingGenerations() {
	const db = await database();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).clear();
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

export async function ensureInitialGeneration() {
	const phaseWeights = Object.fromEntries(TRAINING_PHASES.map(phase => [phase, { ...DEFAULT_CPU_WEIGHTS }]));
	return {
		format: 1, trainingSchema: 2, generation: 0, method: 'baseline', createdAt: new Date(0).toISOString(),
		config: { populationSize: 1, gamesPerGeneration: 0, mutation: 0, seed: 0 },
		candidates: [{ id: 0, weights: { ...DEFAULT_CPU_WEIGHTS }, phaseWeights, wins: 0, draws: 0, losses: 0, scoreDifference: 0 }],
		championId: 0, championByPhase: Object.fromEntries(TRAINING_PHASES.map(phase => [phase, 0])), championWeights: { phaseWeights }, matches: [],
	};
}

export async function saveTrainingGeneration(record, { replace = false } = {}) {
	const db = await database();
	lastStoredAt = Math.max(Date.now(), lastStoredAt + 1);
	const saved = { ...record, storageId: record.storageId || `${record.runId || 'import'}:${record.lineageName || ''}:${record.generation}`, storedAt: lastStoredAt };
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		store[replace ? 'put' : 'add'](saved);
		let count = 0;
		store.index('storedAt').openKeyCursor(null, 'prev').onsuccess = event => {
			const cursor = event.target.result;
			if (!cursor) return;
			if (++count > CACHE_LIMIT) store.delete(cursor.primaryKey);
			cursor.continue();
		};
		transaction.oncomplete = () => resolve(summary(saved));
		transaction.onerror = () => reject(transaction.error);
	});
}

export async function exportTrainingData() {
	const db = await database();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly');
		const request = transaction.objectStore(STORE_NAME).getAll();
		request.onsuccess = () => resolve({ format: 1, type: 'penrosanne-cpu-generations', exportedAt: new Date().toISOString(), generations: recentTrainingGenerations(request.result) });
		request.onerror = () => reject(request.error);
	});
}

export async function importTrainingData(payload) {
	const records = Array.isArray(payload) ? payload : payload?.generations;
	if (!Array.isArray(records) || (payload?.format !== undefined && payload.format !== 1)) throw new Error('CPU generation JSON format is not supported.');
	if (records.length) latestArchiveGeneration(payload);
	const valid = records.filter(item => Number.isInteger(item?.generation) && item.generation >= 0 && item.championWeights && Array.isArray(item.candidates) && Array.isArray(item.matches));
	for (const record of valid) await saveTrainingGeneration(record, { replace: true });
	return valid.length;
}

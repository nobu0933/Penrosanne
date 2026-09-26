import { DEFAULT_CPU_WEIGHTS } from './ai/CpuPlayer.js';
import { gamesPerPairBlock, normalizeCpuPolicy, normalizeCpuWeights, TRAINING_PHASES, validateTrainingConfig } from './ai/TrainingEvolution.js';
import { clearTrainingGenerations, ensureInitialGeneration, exportTrainingData, importTrainingData, latestArchiveGeneration, listTrainingGenerations, readTrainingGeneration, saveTrainingGeneration } from './ai/TrainingStore.js';
import { listLocalDataFiles, readLocalDataFile } from './ai/LocalDataFiles.js';
import { applyTranslations, language, setLanguage, t } from './ui/i18n.js';

const el = {
	language: document.querySelector('#training-language'), population: document.querySelector('#population-size'),
	games: document.querySelector('#games-per-generation'), generations: document.querySelector('#generation-count'),
	mutation: document.querySelector('#mutation-strength'), help: document.querySelector('#games-help'),
	start: document.querySelector('#start-training'), stop: document.querySelector('#stop-training'),
	status: document.querySelector('#training-status'), history: document.querySelector('#generation-select'),
	summary: document.querySelector('#generation-summary'), table: document.querySelector('#weights-table'),
	matches: document.querySelector('#match-list'),
	export: document.querySelector('#export-generations'), import: document.querySelector('#import-generations'), clear: document.querySelector('#clear-generations'),
	importStatus: document.querySelector('#generation-import-status'),
	manualLogs: document.querySelector('#manual-logs'), manualLogsFolder: document.querySelector('#manual-logs-folder'), supervisedStart: document.querySelector('#start-supervised'), manualLogStatus: document.querySelector('#manual-log-status'),
	source: document.querySelector('#training-source'), sourceFolder: document.querySelector('#training-source-folder'), sourceStatus: document.querySelector('#source-status'), lineageName: document.querySelector('#lineage-name'),
	tournamentFiles: document.querySelector('#tournament-files'), tournamentStart: document.querySelector('#start-tournament'), tournamentStop: document.querySelector('#stop-tournament'), tournamentStatus: document.querySelector('#tournament-status'), tournamentResults: document.querySelector('#tournament-results'),
};
let summaries = [], worker = null, visibleRecord = null, previousWeights = DEFAULT_CPU_WEIGHTS, manualLogs = [], sourceGeneration = null, tournamentContenders = [], tournamentRunning = false;
let sourceLoadToken = 0, manualLoadToken = 0;

function setRunning(running) {
	el.start.disabled = running; el.stop.disabled = !running; el.supervisedStart.disabled = running || !manualLogs.length;
	for (const input of [el.population, el.games, el.generations, el.mutation]) input.disabled = running;
	el.source.disabled = running; el.sourceFolder.disabled = running; el.manualLogs.disabled = running; el.manualLogsFolder.disabled = running;
	el.lineageName.disabled = running; el.tournamentFiles.disabled = running;
	el.clear.disabled = running;
	el.tournamentStart.disabled = running || tournamentContenders.length < 2; el.tournamentStop.disabled = !running || !tournamentRunning;
}

function generationName(record) { return record.lineageName ? `${record.lineageName}${record.generation}` : t('cpu.generationOption', { number: record.generation }); }

function updateGamesHelp() {
	const population = Math.max(2, Number(el.population.value) || 4), block = gamesPerPairBlock(population);
	el.games.min = String(block); el.games.step = String(block);
	if (Number(el.games.value) < block || Number(el.games.value) % block) el.games.value = String(Math.ceil(Math.max(block, Number(el.games.value) || block) / block) * block);
	el.help.textContent = t('cpu.gamesHelp', { count: population, block });
}

function cell(content, tag = 'td') {
	const element = document.createElement(tag);
	element.textContent = String(content);
	return element;
}

function showWeights(record, priorWeights) {
	el.table.replaceChildren();
	const phases = TRAINING_PHASES;
	const head = document.createElement('tr');
	const candidates = record?.candidates || [{ id: 0, weights: DEFAULT_CPU_WEIGHTS, phaseWeights: normalizeCpuPolicy(DEFAULT_CPU_WEIGHTS).phaseWeights, wins: 0, draws: 0, losses: 0, scoreDifference: 0 }];
	const keys = [...new Set([...Object.keys(DEFAULT_CPU_WEIGHTS), ...candidates.flatMap(candidate => phases.flatMap(phase => Object.keys(candidate.phaseWeights?.[phase] || candidate.weights || {})))])];
	for (const label of [t('cpu.individual'), t('cpu.result'), t(record?.method === 'supervised' ? 'cpu.supervisedFitness' : 'cpu.progressDiff'), ...phases.flatMap(phase => keys.map(key => `${t(`cpu.phase.${phase}`)} · ${key}`))]) head.append(cell(label, 'th'));
	el.table.append(head);
	for (const candidate of candidates) {
		const row = document.createElement('tr');
		if (candidate.id === record?.championId) row.className = 'champion';
		row.append(cell(candidate.id === 0 ? `${t('cpu.baseline')} #0` : `#${candidate.id}${candidate.parentPhase ? ` · ${t(`cpu.phase.${candidate.parentPhase}`)}` : ''}`));
		const phaseMetrics = candidate.phaseMetrics;
		row.append(cell(record?.method === 'supervised' && phaseMetrics
			? phases.map(phase => `${t(`cpu.phase.${phase}`)} ${phaseMetrics[phase].top5}/${phaseMetrics[phase].samples}`).join(' · ')
			: candidate.id === 0 ? '—' : `${candidate.wins}-${candidate.draws}-${candidate.losses}`));
		row.append(cell(record?.method === 'supervised' && phaseMetrics
			? (phases.reduce((sum, phase) => sum + phaseMetrics[phase].fitness, 0) / phases.length).toFixed(2)
			: candidate.id === 0 ? '—' : `${candidate.progressScoreDifference >= 0 ? '+' : ''}${candidate.progressScoreDifference ?? 0} / ${candidate.progressEvaluationDifference >= 0 ? '+' : ''}${(candidate.progressEvaluationDifference ?? 0).toFixed(2)}`));
		const weightsByPhase = candidate.phaseWeights || normalizeCpuPolicy(candidate.weights || DEFAULT_CPU_WEIGHTS).phaseWeights;
		const priorByPhase = normalizeCpuPolicy(priorWeights).phaseWeights;
		for (const phase of phases) for (const key of keys) {
			const valueNumber = normalizeCpuWeights(weightsByPhase[phase])[key], value = cell(valueNumber.toFixed(3));
			if (candidate.id === (record?.championByPhase?.[phase] ?? record?.championId)) {
				const difference = valueNumber - normalizeCpuWeights(priorByPhase[phase])[key];
				if (Math.abs(difference) >= 0.0005) {
					const small = document.createElement('small');
					small.className = 'delta'; small.textContent = ` ${difference > 0 ? '+' : ''}${difference.toFixed(3)}`;
					value.append(small);
				}
			}
			row.append(value);
		}
		el.table.append(row);
	}
}

function showMatches(record) {
	el.matches.replaceChildren();
	if (!record?.matches?.length) return;
	for (const [index, match] of record.matches.entries()) {
		const details = document.createElement('details'), summary = document.createElement('summary'), actions = document.createElement('ol');
		summary.textContent = t('cpu.matchSummary', { number: index + 1, challenger: match.challenger, challengerScore: match.challengerScore, baselineScore: match.baselineScore, turns: match.turns });
		for (const action of match.actions) {
			const item = document.createElement('li');
			const challengerTurn = action.player === (match.challengerFirst ? 1 : 2);
			const player = challengerTurn ? `#${match.challenger}` : t('cpu.baseline');
			const meeple = action.meeple ? t('cpu.meeple', { type: action.meeple.type }) : '';
			const points = action.points?.length ? t('cpu.points', { points: action.points.map(score => `${score.playerId}+${score.points}`).join(', ') }) : '';
			item.textContent = t('cpu.action', { player, tile: action.tileId, meeple, points, phase: t(`cpu.phase.${action.phase || 'middle'}`), evaluation: action.evaluation ?? '—' });
			actions.append(item);
		}
		details.append(summary, actions); el.matches.append(details);
	}
}

async function showGeneration(storageId) {
	visibleRecord = storageId === 'baseline' ? await ensureInitialGeneration() : await readTrainingGeneration(storageId);
	const currentIndex = summaries.findIndex(item => item.storageId === storageId);
	const previous = currentIndex > 0 && summaries[currentIndex - 1].lineageName === visibleRecord?.lineageName ? await readTrainingGeneration(summaries[currentIndex - 1].storageId) : null;
	previousWeights = previous?.championWeights || DEFAULT_CPU_WEIGHTS;
	el.summary.textContent = visibleRecord
		? visibleRecord.method === 'supervised'
			? t('cpu.supervisedSummary', { generation: visibleRecord.lineageName ? `${visibleRecord.lineageName}${visibleRecord.generation}` : visibleRecord.generation, early: visibleRecord.championByPhase.early, middle: visibleRecord.championByPhase.middle, late: visibleRecord.championByPhase.late, samples: Object.values(visibleRecord.supervised.samples).reduce((sum, count) => sum + count, 0) })
			: t('cpu.summary', { generation: visibleRecord.lineageName ? `${visibleRecord.lineageName}${visibleRecord.generation}` : visibleRecord.generation, champion: visibleRecord.championId, games: visibleRecord.matches.length })
		: t('cpu.noHistory');
	showWeights(visibleRecord, previousWeights); showMatches(visibleRecord);
}

async function refreshHistory(selectLatest = false) {
	const previousSelection = el.history.value;
	summaries = await listTrainingGenerations();
	el.history.replaceChildren();
	const initial = document.createElement('option'); initial.value = 'baseline'; initial.textContent = t('cpu.defaultGeneration'); el.history.append(initial);
	for (const item of [...summaries].reverse()) {
		const option = document.createElement('option'); option.value = item.storageId;
		option.textContent = generationName(item); el.history.append(option);
	}
	const active = summaries.filter(item => item.trainingSchema >= 2).at(-1) || summaries.at(-1);
	el.history.value = selectLatest && active ? active.storageId : [...el.history.options].some(option => option.value === previousSelection) ? previousSelection : active?.storageId || 'baseline';
	await showGeneration(el.history.value);
}

function endRun(message) {
	worker?.terminate(); worker = null;
	setRunning(false);
	el.status.textContent = message;
}

async function exportGenerations() {
	try {
		const payload = await exportTrainingData();
		if (!payload.generations.length) payload.generations.push(await ensureInitialGeneration());
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const anchor = document.createElement('a');
		anchor.href = URL.createObjectURL(blob); anchor.download = `penrosanne-cpu-generations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
		anchor.click(); URL.revokeObjectURL(anchor.href); el.importStatus.textContent = t('cpu.exported');
	} catch (error) { el.importStatus.textContent = t('cpu.error', { message: error.message }); }
}

async function importGenerations(file) {
	if (!file) return;
	try {
		const count = await importTrainingData(JSON.parse(await file.text()));
		el.importStatus.textContent = t('cpu.imported', { count });
		await refreshHistory(true);
	} catch (error) { el.importStatus.textContent = t('cpu.error', { message: error.message }); }
	el.import.value = '';
}

async function clearCachedGenerations() {
	if (worker || !window.confirm(t('cpu.clearCacheConfirm'))) return;
	el.clear.disabled = true;
	try {
		await clearTrainingGenerations();
		await refreshHistory();
		el.importStatus.textContent = t('cpu.cacheCleared');
	} catch (error) {
		el.importStatus.textContent = t('cpu.error', { message: error.message });
	} finally { el.clear.disabled = Boolean(worker); }
}

async function startTraining(supervised = false) {
	if (worker) return;
	if (!sourceGeneration) { el.status.textContent = t('cpu.sourceRequired'); return; }
	const lineageName = el.lineageName.value.trim();
	if (!lineageName) { el.status.textContent = t('cpu.nameRequired'); el.lineageName.focus(); return; }
	const config = {
		populationSize: Number(el.population.value), gamesPerGeneration: Number(el.games.value),
		generations: Number(el.generations.value), mutation: Number(el.mutation.value), seed: 1,
	};
	try { validateTrainingConfig(config); }
	catch (error) { el.status.textContent = t('cpu.error', { message: error.message }); return; }
	const nextGeneration = sourceGeneration.generation + 1;
	if (supervised && !manualLogs.length) { el.manualLogStatus.textContent = t('cpu.noManualLogs'); return; }
	worker = new Worker(new URL('./ai/TrainingWorker.js', import.meta.url), { type: 'module' });
	setRunning(true); el.status.textContent = t('cpu.progress', { generation: nextGeneration, game: 0, games: config.gamesPerGeneration, turn: 0 });
	worker.onmessage = async event => {
		const message = event.data;
		if (message.type === 'progress') el.status.textContent = message.mode === 'supervised' ? t('cpu.supervisedProgress', { generation: message.generation, phase: t(`cpu.phase.${message.phase}`), completed: message.completed, total: message.total }) : t('cpu.progress', message);
		else if (message.type === 'generation') {
			try {
				await saveTrainingGeneration(message.record);
				await refreshHistory(true);
				el.status.textContent = t('cpu.saved', { generation: message.record.generation });
				worker?.postMessage({ type: 'ackGeneration' });
			} catch (error) { endRun(t('cpu.error', { message: error.message })); }
		} else if (message.type === 'done') endRun(t('cpu.done'));
		else if (message.type === 'stopped') endRun(t('cpu.stopped'));
		else if (message.type === 'error') endRun(t('cpu.error', { message: message.message }));
	};
	worker.onerror = error => endRun(t('cpu.error', { message: error.message }));
	worker.postMessage({ type: supervised ? 'startSupervised' : 'start', config, logs: manualLogs, firstGeneration: nextGeneration, baseWeights: sourceGeneration.championWeights, lineageName, runId: crypto.randomUUID() });
}

async function loadSource(fromFolder = false) {
	const token = ++sourceLoadToken;
	if (fromFolder) el.source.value = '';
	else el.sourceFolder.value = '';
	sourceGeneration = null;
	const file = el.source.files?.[0], folderName = el.sourceFolder.value;
	if (!file && !folderName) { el.sourceStatus.textContent = t('cpu.sourceRequired'); return; }
	try {
		const payload = folderName ? await readLocalDataFile('cpu', folderName) : JSON.parse(await file.text());
		const record = latestArchiveGeneration(payload);
		if (token !== sourceLoadToken) return;
		sourceGeneration = record;
		el.sourceStatus.textContent = t('cpu.sourceLoaded', { file: folderName || file.name, generation: generationName(record), next: `${el.lineageName.value.trim() || '…'}${record.generation + 1}` });
	} catch (error) { if (token === sourceLoadToken) el.sourceStatus.textContent = t('cpu.error', { message: error.message }); }
}

async function loadTournamentFiles() {
	tournamentContenders = [];
	const files = [...(el.tournamentFiles.files || [])];
	if (files.length < 2 || files.length > 4) { el.tournamentStatus.textContent = t('cpu.tournamentSelect'); setRunning(false); return; }
	try {
		for (const file of files) {
			const record = latestArchiveGeneration(JSON.parse(await file.text()));
			tournamentContenders.push({ name: `${file.name} / ${generationName(record)}`, championWeights: record.championWeights });
		}
		el.tournamentStatus.textContent = tournamentContenders.map(item => item.name).join('、');
	} catch (error) { tournamentContenders = []; el.tournamentStatus.textContent = t('cpu.error', { message: error.message }); }
	setRunning(false);
}

function showTournament(results) {
	el.tournamentResults.replaceChildren();
	const header = document.createElement('tr');
	for (const key of ['Generation', 'Wins', 'Draws', 'Losses', 'Score', 'Difference']) header.append(cell(t(`cpu.tournamentColumn${key}`), 'th'));
	el.tournamentResults.append(header);
	for (const result of [...results].sort((a, b) => (b.wins + b.draws / 2) - (a.wins + a.draws / 2) || b.scoreDifference - a.scoreDifference)) {
		const row = document.createElement('tr');
		for (const value of [tournamentContenders[result.index].name, result.wins, result.draws, result.losses, result.score, result.scoreDifference]) row.append(cell(value));
		el.tournamentResults.append(row);
	}
}

function startTournament() {
	if (worker || tournamentContenders.length < 2) return;
	worker = new Worker(new URL('./ai/TrainingWorker.js', import.meta.url), { type: 'module' });
	tournamentRunning = true; setRunning(true); el.tournamentStatus.textContent = t('cpu.tournamentProgress', { completed: 0, total: tournamentContenders.length * (tournamentContenders.length - 1) });
	worker.onmessage = event => {
		const message = event.data;
		if (message.type === 'tournamentProgress') {
			el.tournamentStatus.textContent = t('cpu.tournamentProgress', message);
			if (message.results) showTournament(message.results);
		} else if (message.type === 'tournamentDone') {
			showTournament(message.results); el.tournamentStatus.textContent = message.stopped ? t('cpu.tournamentStopped') : t('cpu.tournamentDone', { count: message.matches.length });
			worker.terminate(); worker = null; tournamentRunning = false; setRunning(false);
		} else if (message.type === 'error') { el.tournamentStatus.textContent = t('cpu.error', { message: message.message }); worker.terminate(); worker = null; tournamentRunning = false; setRunning(false); }
	};
	worker.onerror = error => { el.tournamentStatus.textContent = t('cpu.error', { message: error.message }); worker.terminate(); worker = null; tournamentRunning = false; setRunning(false); };
	worker.postMessage({ type: 'tournament', contenders: tournamentContenders });
}

async function loadManualLogs() {
	const token = ++manualLoadToken;
	manualLogs = [];
	el.supervisedStart.disabled = true;
	try {
		const loaded = [];
		const folderName = el.manualLogsFolder.value;
		if (folderName) loaded.push({ name: folderName, payload: await readLocalDataFile('battle', folderName) });
		for (const file of el.manualLogs.files || []) loaded.push({ name: file.name, payload: JSON.parse(await file.text()) });
		for (const { name, payload } of loaded) {
			if (payload?.type !== 'penrosanne-manual-game-log' || payload?.format !== 1 || !Array.isArray(payload.decisions)) throw new Error(`${name}: ${t('cpu.invalidManualLog')}`);
		}
		if (token !== manualLoadToken) return;
		manualLogs = loaded.map(item => item.payload);
		const counts = manualLogs.reduce((sum, log) => sum + log.decisions.filter(decision => decision.actual?.placement).length, 0);
		el.manualLogStatus.textContent = t('cpu.loadedManualLogs', { logs: manualLogs.length, decisions: counts });
	} catch (error) {
		if (token !== manualLoadToken) return;
		manualLogs = []; el.manualLogStatus.textContent = t('cpu.error', { message: error.message });
	}
	el.supervisedStart.disabled = Boolean(worker) || !manualLogs.length;
}

async function populateFolderSelect(select, kind) {
	const selected = select.value;
	select.replaceChildren(new Option(t('cpu.chooseFolderFile'), ''));
	try {
		for (const file of await listLocalDataFiles(kind)) select.add(new Option(file.name, file.name));
		select.value = [...select.options].some(option => option.value === selected) ? selected : '';
	} catch (error) {
		select.options[0].textContent = t('cpu.folderUnavailable');
		console.warn(`${kind} folder could not be listed`, error);
	}
}

async function refreshFolderSelects() {
	await Promise.all([populateFolderSelect(el.sourceFolder, 'cpu'), populateFolderSelect(el.manualLogsFolder, 'battle')]);
}

el.population.addEventListener('input', updateGamesHelp);
el.history.addEventListener('change', () => showGeneration(el.history.value).catch(error => { el.status.textContent = t('cpu.error', { message: error.message }); }));
el.source.addEventListener('change', () => loadSource(false));
el.sourceFolder.addEventListener('change', () => loadSource(true));
el.tournamentFiles.addEventListener('change', loadTournamentFiles);
el.tournamentStart.addEventListener('click', startTournament);
el.tournamentStop.addEventListener('click', () => { worker?.postMessage({ type: 'stop' }); el.tournamentStatus.textContent = t('cpu.stopping'); });
el.start.addEventListener('click', () => startTraining(false));
el.supervisedStart.addEventListener('click', () => startTraining(true));
el.manualLogs.addEventListener('change', loadManualLogs);
el.manualLogsFolder.addEventListener('change', loadManualLogs);
el.stop.addEventListener('click', () => { if (worker) { worker.postMessage({ type: 'stop' }); el.status.textContent = t('cpu.stopping'); } });
el.export.addEventListener('click', exportGenerations);
el.import.addEventListener('change', () => importGenerations(el.import.files?.[0]));
el.clear.addEventListener('click', clearCachedGenerations);
el.language.value = language();
el.language.addEventListener('change', () => setLanguage(el.language.value));
window.addEventListener('penrosanne-language-change', () => {
	el.language.value = language(); updateGamesHelp(); refreshHistory().catch(error => { el.status.textContent = t('cpu.error', { message: error.message }); });
	refreshFolderSelects().catch(error => console.warn('Folder choices could not be refreshed', error));
});
applyTranslations(); updateGamesHelp();
refreshFolderSelects().catch(error => console.warn('Folder choices could not be loaded', error));
refreshHistory(true).catch(error => { el.status.textContent = t('cpu.error', { message: error.message }); });

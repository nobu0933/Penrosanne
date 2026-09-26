import { playBrowserTrainingMatch } from './BrowserSelfPlay.js';
import { completeGeneration, createGenerationPlan, validateTrainingConfig } from './TrainingEvolution.js';
import { evaluateSupervisedGeneration } from './SupervisedEvolution.js';
import { recordTournamentResult, roundRobinSchedule } from './TrainingTournament.js';

let running = false, stopRequested = false, acknowledge = null;
const patternURLs = [1, 2, 3].map(index => new URL(`../../training-patterns/standard-training-v1/pattern-0${index}.json`, import.meta.url));

async function loadPatterns() {
	return Promise.all(patternURLs.map(async url => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Failed to load ${url.pathname}: ${response.status}`);
		return response.json();
	}));
}

async function run({ config, firstGeneration, baseWeights, lineageName, runId }) {
	const patterns = await loadPatterns();
	let currentWeights = baseWeights;
	for (let offset = 0; offset < config.generations; offset++) {
		if (stopRequested) break;
		const plan = createGenerationPlan({ generation: firstGeneration + offset, baseWeights: currentWeights, config });
		const matches = [];
		for (let index = 0; index < plan.schedule.length; index++) {
			if (stopRequested) break;
			const scheduled = plan.schedule[index], challenger = plan.candidates[scheduled.challenger];
			const baselinePolicy = { phaseWeights: plan.candidates[0].phaseWeights };
			const policies = scheduled.challengerFirst
				? [challenger, baselinePolicy]
				: [baselinePolicy, challenger];
			const pattern = patterns[scheduled.seed % patterns.length];
			self.postMessage({ type: 'progress', generation: plan.generation, game: index + 1, games: plan.schedule.length, turn: 0 });
			const result = await playBrowserTrainingMatch({
				seed: scheduled.seed, policies, pattern, isCancelled: () => stopRequested,
				onTurn: ({ turn }) => self.postMessage({ type: 'progress', generation: plan.generation, game: index + 1, games: plan.schedule.length, turn }),
			});
			if (!result) break;
			matches.push({
				challenger: scheduled.challenger, challengerFirst: scheduled.challengerFirst, seed: scheduled.seed,
				patternSeed: pattern.seed, patternStrategy: pattern.strategy,
				challengerScore: result.scores[scheduled.challengerFirst ? 0 : 1],
				baselineScore: result.scores[scheduled.challengerFirst ? 1 : 0],
				progressScoreDifference: Object.values(result.phaseLeads).reduce((sum, lead) => sum + lead * (scheduled.challengerFirst ? 1 : -1), 0),
				progressEvaluationDifference: Object.values(result.phaseEvaluations).reduce((sum, evaluations) => sum + (evaluations[scheduled.challengerFirst ? 0 : 1] - evaluations[scheduled.challengerFirst ? 1 : 0]), 0),
				phaseLeads: result.phaseLeads, phaseEvaluations: result.phaseEvaluations, turns: result.turns, discarded: result.discarded,
				elapsedMs: result.elapsedMs, actions: result.actions, turnEvaluations: result.turnEvaluations,
			});
			self.postMessage({ type: 'progress', generation: plan.generation, game: index + 1, games: plan.schedule.length, turn: result.turns, completed: true });
		}
		if (stopRequested) break;
		const record = { ...completeGeneration(plan, matches, config), lineageName, runId };
		self.postMessage({ type: 'generation', record });
		await new Promise(resolve => { acknowledge = resolve; });
		acknowledge = null;
		currentWeights = record.championWeights;
	}
	self.postMessage({ type: stopRequested ? 'stopped' : 'done' });
}

async function runSupervised({ config, firstGeneration, baseWeights, logs, lineageName, runId }) {
	let currentWeights = baseWeights;
	for (let offset = 0; offset < config.generations; offset++) {
		if (stopRequested) break;
		const plan = createGenerationPlan({ generation: firstGeneration + offset, baseWeights: currentWeights, config });
		const record = await evaluateSupervisedGeneration(plan, logs, {
			isCancelled: () => stopRequested,
			onProgress: progress => self.postMessage({ type: 'progress', mode: 'supervised', generation: plan.generation, ...progress }),
		});
		if (!record || stopRequested) break;
		self.postMessage({ type: 'generation', record: { ...record, lineageName, runId } });
		await new Promise(resolve => { acknowledge = resolve; });
		acknowledge = null;
		currentWeights = record.championWeights;
	}
	self.postMessage({ type: stopRequested ? 'stopped' : 'done' });
}

async function runTournament({ contenders }) {
	const patterns = await loadPatterns();
	let results = contenders.map((item, index) => ({ index, wins: 0, draws: 0, losses: 0, score: 0, scoreDifference: 0 }));
	const matches = [];
	const schedule = roundRobinSchedule(contenders.length), total = schedule.length;
	for (const { seats, seed, patternIndex } of schedule) {
			if (stopRequested) { self.postMessage({ type: 'tournamentDone', stopped: true, results, matches }); return; }
			self.postMessage({ type: 'tournamentProgress', completed: matches.length, total });
			const match = await playBrowserTrainingMatch({ seed, pattern: patterns[patternIndex % patterns.length],
				policies: seats.map(index => contenders[index].championWeights), isCancelled: () => stopRequested });
			if (!match) { self.postMessage({ type: 'tournamentDone', stopped: true, results, matches }); return; }
			const [first, second] = seats;
			matches.push({ first, second, scores: match.scores, turns: match.turns });
			results = recordTournamentResult(results, seats, match.scores);
			self.postMessage({ type: 'tournamentProgress', completed: matches.length, total, results, matches });
	}
	self.postMessage({ type: 'tournamentDone', stopped: false, results, matches });
}

self.onmessage = event => {
	const message = event.data;
	if (message.type === 'stop') { stopRequested = true; acknowledge?.(); return; }
	if (message.type === 'ackGeneration') { acknowledge?.(); return; }
	if (!['start', 'startSupervised', 'tournament'].includes(message.type) || running) return;
	try {
		if (message.type === 'tournament') {
			if (!Array.isArray(message.contenders) || message.contenders.length < 2 || message.contenders.length > 4 || message.contenders.some(item => !item.championWeights)) throw new Error('Select 2–4 valid generations.');
		} else validateTrainingConfig(message.config);
	}
	catch (error) { self.postMessage({ type: 'error', message: error.message }); return; }
	running = true; stopRequested = false;
	const task = message.type === 'tournament' ? runTournament(message) : message.type === 'startSupervised' ? runSupervised(message) : run(message);
	task.catch(error => self.postMessage({ type: 'error', message: error.message || String(error) }))
		.finally(() => { running = false; });
};

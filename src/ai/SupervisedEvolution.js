import { TRAINING_PHASES } from './TrainingEvolution.js';
import { evaluateManualExamples } from './SupervisedLearning.js';

export function manualExamplesByPhase(logs) {
	const examples = Object.fromEntries(TRAINING_PHASES.map(phase => [phase, []]));
	for (const log of logs) {
		if (log?.type !== 'penrosanne-manual-game-log' || log?.format !== 1 || !Array.isArray(log.decisions)) continue;
		for (const decision of log.decisions) if (decision?.snapshot && decision?.actual?.placement && examples[decision.snapshot.phase]) examples[decision.snapshot.phase].push(decision);
	}
	return examples;
}

export async function evaluateSupervisedGeneration(plan, logs, { onProgress = () => {}, isCancelled = () => false } = {}) {
	const examples = manualExamplesByPhase(logs);
	for (const phase of TRAINING_PHASES) if (!examples[phase].length) throw new Error(`No manual examples were found for ${phase}.`);
	let completed = 0;
	const total = plan.candidates.length * TRAINING_PHASES.reduce((sum, phase) => sum + examples[phase].length, 0);
	for (const candidate of plan.candidates) {
		candidate.phaseMetrics = {};
		for (const phase of TRAINING_PHASES) {
			const metrics = await evaluateManualExamples(examples[phase], candidate.phaseWeights[phase], {
				isCancelled,
			onProgress: progress => onProgress({ individual: candidate.id, phase, completed: completed + progress.completed, total }),
			});
			if (!metrics) return null;
			candidate.phaseMetrics[phase] = metrics;
			completed += examples[phase].length;
			onProgress({ individual: candidate.id, phase, completed, total });
		}
	}
	const bestFor = phase => [...plan.candidates].sort((a, b) =>
		b.phaseMetrics[phase].fitness - a.phaseMetrics[phase].fitness || a.id - b.id)[0];
	const winners = Object.fromEntries(TRAINING_PHASES.map(phase => [phase, bestFor(phase)]));
	const championByPhase = Object.fromEntries(TRAINING_PHASES.map(phase => [phase, winners[phase].id]));
	const phaseWeights = Object.fromEntries(TRAINING_PHASES.map(phase => [phase, winners[phase].phaseWeights[phase]]));
	const overallFitness = candidate => TRAINING_PHASES.reduce((sum, phase) => sum + candidate.phaseMetrics[phase].fitness, 0) / TRAINING_PHASES.length;
	const championId = [...plan.candidates].sort((a, b) => overallFitness(b) - overallFitness(a) || a.id - b.id)[0].id;
	return {
		format: 1, trainingSchema: 2, method: 'supervised', generation: plan.generation, createdAt: new Date().toISOString(),
		config: plan.config, championId, championByPhase,
		championWeights: {
			phaseWeights,
			phaseParents: Object.fromEntries(TRAINING_PHASES.map(phase => [phase, winners[phase].phaseWeights])),
		},
		candidates: plan.candidates,
		matches: [],
		supervised: { samples: Object.fromEntries(TRAINING_PHASES.map(phase => [phase, examples[phase].length])), fitnessByPhase: Object.fromEntries(TRAINING_PHASES.map(phase => [phase, winners[phase].phaseMetrics[phase].fitness])) },
	};
}

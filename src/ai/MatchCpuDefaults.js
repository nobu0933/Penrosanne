// 通常対戦の固定CPU。出典: cpu-generation-data/penrosanne-cpu-generations-2026-09-26T14-11-11-971Z.json の A123。
// 訓練用の DEFAULT_CPU_WEIGHTS とは独立させる。
export const MATCH_CPU_A123 = Object.freeze({
	phaseWeights: {
		early: {
			immediate: 1.05644, future: 1.53537, meepleCost: 1.1, fieldMeepleCost: 1.483,
			fieldFuture: 0.37576, vertex: 1.09537, obstruction: 0.29637, poach: 1.08691,
			poachProximity: 0.047, obstructionMobility: 0.31981, poachBridge: 1.1403,
		},
		middle: {
			immediate: 0.87331, future: 1.08632, meepleCost: 1.09891, fieldMeepleCost: 1.15494,
			fieldFuture: 0.2465, vertex: 0.571, obstruction: 0.23386, poach: 0.77357,
			poachProximity: 0.03465, obstructionMobility: 0.44635, poachBridge: 0.90565,
		},
		late: {
			immediate: 1.10339, future: 1.08717, meepleCost: 1.54912, fieldMeepleCost: 2.59713,
			fieldFuture: 0.48478, vertex: 1.52297, obstruction: 0.26411, poach: 1.62288,
			poachProximity: 0.03522, obstructionMobility: 0.67453, poachBridge: 1.26387,
		},
	},
});

// 通常対戦の固定CPU。出典: cpu-generation-data/penrosanne-cpu-generations-2026-09-26T17-41-38-324Z.json の D210。
// 訓練用の DEFAULT_CPU_WEIGHTS とは独立させる。
export const MATCH_CPU_WEIGHTS = Object.freeze({
	phaseWeights: {
		early: {
			immediate: 0.60752, future: 1.11371, meepleCost: 1.1, fieldMeepleCost: 1.71401,
			fieldFuture: 0.41639, vertex: 0.47975, obstruction: 0.12132, poach: 2.41559,
			poachProximity: 0.05218, obstructionMobility: 0.34224, poachBridge: 1.43863,
		},
		middle: {
			immediate: 0.29024, future: 0.58642, meepleCost: 1.28125, fieldMeepleCost: 0.70998,
			fieldFuture: 0.03219, vertex: 0.40802, obstruction: 0.17893, poach: 0.43946,
			poachProximity: 0.01413, obstructionMobility: 0.28899, poachBridge: 0.52293,
		},
		late: {
			immediate: 0.67078, future: 0.6334, meepleCost: 1.89425, fieldMeepleCost: 1.89746,
			fieldFuture: 0.38525, vertex: 1.9527, obstruction: 0.34471, poach: 1.31652,
			poachProximity: 0.03547, obstructionMobility: 0.65841, poachBridge: 1.01318,
		},
	},
});

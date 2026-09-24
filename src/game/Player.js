export function createPlayer({ id, name, type = "human", meeples = 7 }) {
  return { id, name, type, score: 0, meeples, redrawUsed: false, vertexCompletions: 0, supportCount: 0 };
}

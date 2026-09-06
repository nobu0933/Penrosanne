export function createPlayer({ id, name, type = "human", meeples = 7 }) {
  return { id, name, type, score: 0, meeples, redrawUsed: false, mirrorUsed: false, relativePlacementUsed: false, vertexChips: 0 };
}

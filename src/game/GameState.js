export function createGameState({ players, deck }) {
  return {
    players, deck, discarded: [], board: null, turn: 0, phase: "setup", currentTile: null,
    meeples: {}, scored: [], scoreEvents: [], events: [], finished: false,
    claimedVertices: [], vertexChipEvents: [],
    turnHistory: [], pendingHistoryTurn: null, finalMeeples: null,
  };
}

export function createGameState({ players, deck, handMode = 'single' }) {
  return {
    players, deck, discarded: [], board: null, turn: 0, phase: "setup", currentTile: null,
    handMode, hands: Object.fromEntries(players.map(player => [player.id, []])), consecutivePasses: 0,
    meeples: {}, scored: [], scoreEvents: [], events: [], finished: false,
    countedVertices: [], vertexCompletionEvents: [], titleAwards: [],
    turnHistory: [], pendingHistoryTurn: null, finalMeeples: null,
  };
}

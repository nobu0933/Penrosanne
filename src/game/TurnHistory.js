// 表示用の履歴。採点直前のミープルを保存し、回収後もその手番を再現できる。
export function beginHistoryTurn(state, tile) {
  state.turnHistory ||= [];
  state.pendingHistoryTurn = {
    number: state.turnHistory.length + 1,
    playerId: state.players[state.turn].id,
    tileId: tile.id,
    tileCount: state.board.tiles.length,
    meeplesBefore: { ...state.meeples },
    scoreStart: state.scoreEvents.length,
  };
}

export function captureHistoryMeeples(state) {
  if (state.pendingHistoryTurn) state.pendingHistoryTurn.meeples = { ...state.meeples };
}

export function completeHistoryTurn(state) {
  const entry = state.pendingHistoryTurn;
  if (!entry) return;
  entry.meeples ||= { ...state.meeples };
  entry.placedMeeple = Object.keys(entry.meeples).find((ref) => !(ref in entry.meeplesBefore)) || null;
  entry.meeplesAfter = { ...state.meeples };
  entry.scores = structuredClone(state.scoreEvents.slice(entry.scoreStart));
  delete entry.meeplesBefore;
  delete entry.scoreStart;
  state.turnHistory.push(entry);
  state.pendingHistoryTurn = null;
}

import { publicRemainingTilePool } from './TacticalSearch.js';

// 自己対戦とブラウザ対局で同じ公開情報を渡す。山札の順番はCPUに渡さない。
export function createCpuObservation(engine, candidates, catalog = null) {
	const visibleTiles = [...engine.state.board.tiles, ...engine.state.discarded];
	if (engine.privatePlanning) {
		for (const player of engine.state.players) visibleTiles.push(...engine.handForPlayer(player.id));
	} else if (engine.state.currentTile) visibleTiles.push(engine.state.currentTile);
	return {
		state: {
			players: engine.state.players,
			turn: engine.state.turn,
			phase: engine.state.phase,
			board: engine.state.board,
			meeples: engine.state.meeples,
			scored: engine.state.scored,
			countedVertices: engine.state.countedVertices,
		},
		activePlayer: engine.activePlayer,
		fieldScoring: engine.fieldScoring,
		privatePlanning: engine.privatePlanning,
		rules: engine.rules,
		tilePool: catalog ? publicRemainingTilePool(catalog, visibleTiles) : [],
		candidates: () => candidates,
	};
}

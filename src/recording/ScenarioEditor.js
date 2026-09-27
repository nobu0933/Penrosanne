import { Board } from '../game/Board.js';
import { placementCandidates, isLegalPlacement, vertexPatternsAllow } from '../game/Rules.js';

export const RECORDING_RULES = Object.freeze({
	allowVerticalMatchingPattern: true,
	allowTerrainHalfTurn: true,
	allowTerrainMirror: true,
	ignoreMatchingRules: false,
});

export function scenarioCandidates(board, tile) {
	if (!board.tiles.length) return [{ ...tile, centerX: 0, centerY: 0, rotation: 0 }];
	// 編集中は通常対局の「絶対禁則」を課さない。地形・辺記号・頂点型の
	// 検証は placementCandidates 内で既存ゲームと同じ実装を使う。
	return placementCandidates(board, tile, RECORDING_RULES);
}

export function validateScenarioBoard(board) {
	if (!board.tiles.length) return { valid: false, reason: 'タイルを1枚以上置いてください。' };
	const ids = new Set();
	for (const tile of board.tiles) {
		if (ids.has(tile.id)) return { valid: false, reason: '同じタイルIDが重複しています。' };
		ids.add(tile.id);
		const rest = new Board(board.side);
		rest.tiles = board.tiles.filter((item) => item.id !== tile.id);
		if (rest.overlaps(tile)) return { valid: false, reason: `${tile.id} が別のタイルと重なっています。` };
		if (rest.tiles.length && (!isLegalPlacement(rest, tile, RECORDING_RULES) || !vertexPatternsAllow(rest, tile)))
			return { valid: false, reason: `${tile.id} の地形・辺記号・頂点型が整合していません。` };
	}
	const visited = new Set([board.tiles[0].id]);
	const queue = [board.tiles[0]];
	while (queue.length) {
		const tile = queue.pop();
		for (const edge of board.edges(tile)) for (const { tile: neighbor } of board.matchingEdges(edge)) {
			if (!visited.has(neighbor.id)) { visited.add(neighbor.id); queue.push(neighbor); }
		}
	}
	if (visited.size !== board.tiles.length) return { valid: false, reason: '盤面が複数の離れた領域に分かれています。' };
	return { valid: true, reason: '' };
}

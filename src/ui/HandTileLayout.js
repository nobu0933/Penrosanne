import { verticesFor } from '../game/Tile.js';

// 手元表示だけの向き。手札や候補の rotation は変更しない。
export function handDisplayTile(tile) {
	return tile.shape === 'thin' ? { ...tile, rotation: (tile.rotation || 0) + Math.PI / 2 } : tile;
}

// 手元の描画とドラッグ開始で共用する。側面11px＋接地影1pxも枠内に収める。
export function handTileLayout(tile, width, height) {
	const padding = 3, depth = 12;
	const points = Object.values(verticesFor({ ...tile, centerX: 0, centerY: 0 }, 1));
	const halfWidth = Math.max(...points.map(p => Math.abs(p.x)));
	const halfHeight = Math.max(...points.map(p => Math.abs(p.y)));
	const side = Math.max(0, Math.min(
		Math.min(width, height) * .68,
		(width - padding * 2) / (halfWidth * 2),
		(height - padding * 2 - depth) / (halfHeight * 2),
	));
	return { x: width / 2, y: (height - depth) / 2, side };
}

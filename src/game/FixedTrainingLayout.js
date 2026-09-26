const POSITION_CELL = 1e-3;
const POSITION_EPSILON = 1e-4;
const ROTATION_EPSILON = 1e-4;
const FULL_TURN = Math.PI * 2;
export const MIN_TRAINING_CONFIRMED = 1100;

const bucket = (shape, x, y) => `${shape}:${Math.round(x / POSITION_CELL)}:${Math.round(y / POSITION_CELL)}`;
const sameRotation = (a, b) => Math.abs(((a - b + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI) < ROTATION_EPSILON;

// 保存時の盤面の中心近くにある同形状スロットへ初期タイルを重ねる。
// 回転と縮尺を一緒に変換し、ゲーム側の開始タイルは常に (0,0), 回転0にする。
export function createFixedTrainingLayout(pattern, startTile, side) {
	if (pattern?.format !== 1 || !Array.isArray(pattern.slots) || pattern.forcedCount < MIN_TRAINING_CONFIRMED || pattern.slots.length < MIN_TRAINING_CONFIRMED || !(pattern.side > 0))
		throw new Error('固定訓練パターンが不足または不正です。');
	const xs = pattern.slots.map(slot => slot.x), ys = pattern.slots.map(slot => slot.y);
	const middle = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
	const anchors = pattern.slots.filter(slot => slot.shape === startTile.shape);
	if (!anchors.length) throw new Error('開始タイルと同じ形状のスロットがありません。');
	anchors.sort((a, b) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(b.x - middle.x, b.y - middle.y));
	const anchor = anchors[0], scale = side / pattern.side;
	const cosine = Math.cos(-anchor.rotation), sine = Math.sin(-anchor.rotation);
	const slots = pattern.slots.map(slot => {
		const x = (slot.x - anchor.x) * scale, y = (slot.y - anchor.y) * scale;
		return { shape: slot.shape, centerX: x * cosine - y * sine, centerY: x * sine + y * cosine, rotation: slot.rotation - anchor.rotation };
	});
	const index = new Map();
	for (const slot of slots) {
		const key = bucket(slot.shape, slot.centerX, slot.centerY);
		if (!index.has(key)) index.set(key, []);
		index.get(key).push(slot);
	}
	return {
		patternSeed: pattern.seed,
		slotCount: slots.length,
		allows(tile) {
			const x = Math.round(tile.centerX / POSITION_CELL), y = Math.round(tile.centerY / POSITION_CELL);
			for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
				for (const slot of index.get(`${tile.shape}:${x + dx}:${y + dy}`) || [])
					if (Math.abs(tile.centerX - slot.centerX) < POSITION_EPSILON
						&& Math.abs(tile.centerY - slot.centerY) < POSITION_EPSILON
						&& sameRotation(tile.rotation || 0, slot.rotation || 0)) return true;
			return false;
		},
	};
}

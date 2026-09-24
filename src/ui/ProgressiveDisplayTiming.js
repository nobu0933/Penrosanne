// 追加分が少ないときは従来のテンポを保ち、多いときは表示回数も抑える。
export function progressiveDisplayPacing(addedCount, {
	baseIntervalMs = 120,
	maxDurationMs = 1000,
	maxFrames = 48,
} = {}) {
	const count = Math.max(0, Math.floor(addedCount));
	const batchSize = Math.max(1, Math.ceil(count / maxFrames));
	const frameCount = Math.max(1, Math.ceil(count / batchSize));
	return {
		intervalMs: Math.min(baseIntervalMs, maxDurationMs / frameCount),
		batchSize,
	};
}

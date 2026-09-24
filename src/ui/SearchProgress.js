// 探索の判定と、画面へ処理を戻す頻度を分離する。
export function createSearchCheckpoint({ onProgress, yieldToBrowser, now = () => performance.now(), batchSize = 24, maxWorkMs = 60 }) {
	let reportedCount = 0;
	let sliceStarted = now();
	return ({ forcedCount }) => {
		if (forcedCount - reportedCount < batchSize && now() - sliceStarted < maxWorkMs) return;
		reportedCount = forcedCount;
		onProgress(forcedCount);
		return yieldToBrowser().then(() => { sliceStarted = now(); });
	};
}

// rAF内で即座に探索へ戻ると、そのフレームの描画も止めてしまう。
// 次のタスクへ戻すことで、テキスト・カーソルを描画してから探索を再開する。
export function yieldForSearchPaint() {
	return new Promise(resolve => {
		if (document.hidden) setTimeout(resolve, 0);
		else requestAnimationFrame(() => setTimeout(resolve, 0));
	});
}

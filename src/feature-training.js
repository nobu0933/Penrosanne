const el = id => document.getElementById(id);
const state = { worker: null, active: null, dataset: null, policy: null, verification: null };
const download = (payload, prefix) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${prefix}-${stamp}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const table = (headers, rows) => {
  const node = document.createElement('table'); node.className = 'result-table';
  const head = node.createTHead().insertRow();
  for (const label of headers) { const cell = document.createElement('th'); cell.textContent = label; head.append(cell); }
  const body = node.createTBody();
  for (const row of rows) { const tr = body.insertRow(); for (const value of row) { const cell = tr.insertCell(); cell.textContent = String(value); } }
  return node;
};
function setBusy(kind, busy) {
  const ids = { preprocess: ['build-features','stop-features'], train: ['start-learning','stop-learning'], verify: ['start-verification','stop-verification'] }[kind];
  el(ids[0]).disabled = busy; el(ids[1]).disabled = !busy;
  for (const id of ['build-features','start-learning','start-verification']) if (id !== ids[0]) el(id).disabled = busy;
}
function stop() {
  if (!state.worker) return;
  state.worker.terminate(); state.worker = null;
  const kind = state.active; state.active = null; setBusy(kind, false);
  const status = { preprocess:'feature-status',train:'learning-status',verify:'verification-status' }[kind];
  el(status).textContent = '処理を停止しました。';
}
function run(kind, payload, handlers) {
  if (state.worker) throw new Error('先に実行中の処理を停止してください。');
  const worker = new Worker(new URL('./ai/FeatureTrainingWorker.js', import.meta.url), { type: 'module' });
  state.worker = worker; state.active = kind; setBusy(kind, true);
  const finish = () => { worker.terminate(); if (state.worker === worker) { state.worker = null; state.active = null; setBusy(kind, false); } };
  worker.onmessage = ({ data }) => {
    if (data.event === 'error') { finish(); handlers.error(data.detail); }
    else if (data.event === 'complete') { finish(); handlers.complete(data.detail); }
    else handlers.progress?.(data.event, data.detail);
  };
  worker.onerror = event => { finish(); handlers.error(event.message || '処理を開始できませんでした。'); };
  worker.postMessage(payload);
}
async function fileText(input) {
  const file = el(input).files?.[0];
  if (!file) throw new Error('JSONファイルを選択してください。');
  return file.text();
}
const numeric = (id, min, max) => {
  const value = Number(el(id).value);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${id} は ${min}～${max} の整数にしてください。`);
  return value;
};
el('build-features').onclick = async () => {
  try {
    const recordText = await fileText('record-file');
    state.dataset = null; el('download-features').disabled = true; el('feature-progress').value = 0;
    el('feature-status').textContent = '特徴量を生成中…';
    run('preprocess', { action:'preprocess', recordText }, {
      progress: (_, detail) => {
        el('feature-progress').value = detail.total ? 100 * detail.completed / detail.total : 0;
        el('feature-status').textContent = `${detail.completed}/${detail.total} 手番を処理しました。重複統合 ${detail.collapsed} 件。`;
      },
      complete: result => { state.dataset = result; el('feature-progress').value = 100; el('download-features').disabled = false;
        el('feature-status').textContent = `完了：${result.summary.decisions} 手番、${result.summary.rawAssessments} 候補、重複統合 ${result.summary.collapsed} 件。下の学習にそのまま使用できます。`; },
      error: message => { el('feature-status').textContent = `エラー：${message}`; },
    });
  } catch (error) { el('feature-status').textContent = `エラー：${error.message}`; }
};
el('stop-features').onclick = stop;
el('download-features').onclick = () => download(state.dataset, 'penrosanne-features');
el('start-learning').onclick = async () => {
  try {
    const datasetText = el('feature-file').files?.length ? await fileText('feature-file') : state.dataset ? JSON.stringify(state.dataset) : null;
    if (!datasetText) throw new Error('特徴量JSONを生成するか、読み込んでください。');
    const options = { iterations:numeric('iterations',1,200), population:numeric('population',4,32), seed:numeric('learn-seed',0,2147483647) };
    state.policy = null; el('download-policy').disabled = true; el('learning-results').replaceChildren();
    el('learning-status').textContent = '重みを学習中…';
    run('train', { action:'train', datasetText, options }, {
      progress: (_, detail) => { el('learning-status').textContent = `${detail.phase}：${detail.generation}/${detail.iterations} 世代、損失 ${detail.bestLoss.toFixed(4)}`; },
      complete: result => { state.policy = result; el('download-policy').disabled = false;
        el('learning-status').textContent = '完了。CPU JSONを書き出し、下の比較に使用できます。';
        el('learning-results').replaceChildren(table(['段階','学習手番','評価済み比較','損失'], Object.entries(result.phases).map(([phase, item]) => [phase,item.examples,item.informative,item.loss?.toFixed(4) ?? '—']))); },
      error: message => { el('learning-status').textContent = `エラー：${message}`; },
    });
  } catch (error) { el('learning-status').textContent = `エラー：${error.message}`; }
};
el('stop-learning').onclick = stop;
el('download-policy').onclick = () => download(state.policy, 'penrosanne-feature-policy');
el('start-verification').onclick = async () => {
  try {
    const [cpuAText,cpuBText] = await Promise.all([fileText('cpu-a-file'),fileText('cpu-b-file')]);
    const pairs = numeric('verify-pairs',1,5), seed = numeric('verify-seed',0,2147483647 - pairs);
    const cpuAName = el('cpu-a-file').files[0].name, cpuBName = el('cpu-b-file').files[0].name;
    state.verification = null; el('download-verification').disabled = true; el('verification-results').replaceChildren();
    el('verification-status').textContent = '通常盤面で対戦中…';
    const rows = [];
    run('verify', { action:'verify', cpuAText, cpuBText, cpuAName, cpuBName, pairs, seed }, {
      progress: (event, detail) => {
        if (event === 'match') { rows.push([detail.seed,detail.firstPlayer,detail.scores[0],detail.scores[1],detail.turns]);
          el('verification-results').replaceChildren(table(['シード','先手','A得点','B得点','手数'],rows)); }
        else el('verification-status').textContent = `${detail.pair}/${pairs} 組目、${detail.seat}/2 試合目、${detail.turn} 手目…`;
      },
      complete: result => { state.verification = result; el('download-verification').disabled = false;
        el('verification-status').textContent = `完了：A ${result.wins[0]}勝、B ${result.wins[1]}勝、引分 ${result.draws}、Aから見た得点差 ${result.scoreDifference >= 0 ? '+' : ''}${result.scoreDifference}。`; },
      error: message => { el('verification-status').textContent = `エラー：${message}`; },
    });
  } catch (error) { el('verification-status').textContent = `エラー：${error.message}`; }
};
el('stop-verification').onclick = stop;
el('download-verification').onclick = () => download(state.verification, 'penrosanne-feature-verification');

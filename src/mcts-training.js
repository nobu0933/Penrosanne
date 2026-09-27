import { initialMctsPopulation, parseMctsPopulation } from './ai/MctsPopulation.js';
import { language, setLanguage } from './ui/i18n.js';

const $ = selector => document.querySelector(selector);
const sourceInput = $('#source-json'), sourceStatus = $('#source-status'), status = $('#training-status');
let source = initialMctsPopulation(), latest = null, worker = null;

function localize() {
  const locale = language();
  $('#training-language').value = locale;
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-ja][data-en]').forEach(element => { element.textContent = element.dataset[locale]; });
  sourceStatus.textContent = `${locale === 'ja' ? '起点' : 'Source'}: ${source.name || 'MCTS'} ${source.generation}`;
  render();
}

function render() {
  const record = latest || source, locale = language();
  $('#export-population').disabled = !latest;
  $('#generation-summary').textContent = `${record.name || 'MCTS'} ${locale === 'ja' ? '世代' : 'generation'} ${record.generation} — ${locale === 'ja' ? '最優秀個体' : 'Champion'} #${record.championId}`;
  const rows = record.evaluated || record.individuals;
  const keys = Object.keys(record.individuals[0].parameters);
  const table = $('#individual-table');
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const value of ['#', locale === 'ja' ? '勝-分-負' : 'W-D-L', locale === 'ja' ? '得点差' : 'Difference', ...keys]) {
    const cell = document.createElement('th'); cell.textContent = value; head.append(cell);
  }
  for (const item of rows) {
    const row = table.insertRow();
    if (item.id === record.championId) row.className = 'champion';
    for (const value of [item.id, `${item.wins || 0}-${item.draws || 0}-${item.losses || 0}`,
      item.scoreDifference || 0, ...keys.map(key => Number(item.parameters[key]).toFixed(3))]) {
      const cell = row.insertCell(); cell.textContent = value;
    }
  }
  const effects = $('#effect-table'); effects.replaceChildren();
  const effectHead = effects.createTHead().insertRow();
  for (const name of ['Parameter', 'Direction', 'Games']) {
    const cell = document.createElement('th'); cell.textContent = name; effectHead.append(cell);
  }
  for (const [key, item] of Object.entries(record.parameterEffects || {})) {
    const row = effects.insertRow();
    for (const value of [key, Number(item.direction || 0).toFixed(3), item.samples || 0]) row.insertCell().textContent = value;
  }
}

$('#training-language').onchange = event => setLanguage(event.target.value);
window.addEventListener('penrosanne-language-change', localize);
sourceInput.onchange = async () => {
  try {
    source = parseMctsPopulation(JSON.parse(await sourceInput.files[0].text()));
    latest = null; status.textContent = '';
    localize();
  } catch (error) { status.textContent = error.message; sourceInput.value = ''; }
};
$('#start-training').onclick = () => {
  if (worker) return;
  const populationSize = Number($('#population-size').value), generations = Number($('#generation-count').value);
  const mutation = Number($('#mutation-strength').value), simulations = Number($('#simulation-count').value);
  const seed = Number($('#training-seed').value);
  if (!Number.isInteger(populationSize) || populationSize < 2 || populationSize > 8
    || !Number.isInteger(generations) || generations < 1 || generations > 30
    || !(mutation > 0 && mutation <= 1) || !Number.isInteger(simulations) || simulations < 1 || simulations > 50
    || !Number.isSafeInteger(seed) || seed < 0) { status.textContent = language() === 'ja' ? '学習設定を確認してください。' : 'Check training settings.'; return; }
  worker = new Worker(new URL('./ai/MctsTrainingWorker.js', import.meta.url), { type: 'module' });
  $('#start-training').disabled = true; $('#stop-training').disabled = false;
  status.textContent = language() === 'ja' ? '学習を開始しています…' : 'Training started…';
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') status.textContent = `${language() === 'ja' ? '世代' : 'Generation'} ${data.generation} · ${language() === 'ja' ? '対局' : 'Game'} ${data.game} · #${data.candidateId} vs ${data.opponent} · ${data.turns}`;
    if (data.type === 'generation') { latest = parseMctsPopulation(data.record); source = latest; render(); }
    if (['done', 'stopped', 'error'].includes(data.type)) {
      status.textContent = data.type === 'error' ? data.message : data.type === 'done'
        ? (language() === 'ja' ? '学習が完了しました。' : 'Training complete.')
        : (language() === 'ja' ? '停止しました。' : 'Stopped.');
      worker.terminate(); worker = null;
      $('#start-training').disabled = false; $('#stop-training').disabled = true;
    }
  };
  worker.onerror = event => {
    status.textContent = event.message;
    worker.terminate(); worker = null;
    $('#start-training').disabled = false; $('#stop-training').disabled = true;
  };
  worker.postMessage({ type: 'start', source, populationSize, generations, mutation, simulations, seed,
    boardMode: $('#training-board-mode').value,
    name: $('#lineage-name').value.trim() || source.name || 'MCTS' });
};
$('#stop-training').onclick = () => { if (worker) worker.postMessage({ type: 'stop' }); };
$('#export-population').onclick = () => {
  if (!latest) return;
  const { format, generation, name, createdAt, championId, individuals, parameterEffects,
    previousChampion, finalAcceptance } = latest;
  const exported = { format, generation, name, createdAt, championId, individuals,
    parameterEffects, previousChampion, finalAcceptance };
  const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `penrosanne-mcts-${String(latest.name || 'generation').replace(/[^\w-]/g, '-')}-${latest.generation}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
localize();

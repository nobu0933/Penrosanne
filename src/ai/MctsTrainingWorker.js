import { playMctsMatch } from './MctsMatch.js';
import { initialMctsPopulation, parseMctsPopulation, spawnMctsCandidates, summarizeMctsGeneration } from './MctsPopulation.js';
import { deriveSeed, seededRandom } from './SeededRandom.js';

const patternURLs = [1, 2, 3].map(index => new URL(`../../training-patterns/standard-training-v1/pattern-0${index}.json`, import.meta.url));
let stopped = false, running = false;

async function loadPatterns() {
  return Promise.all(patternURLs.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`固定盤面を読み込めません: ${response.status}`);
    return response.json();
  }));
}

function rate(matches, id) {
  const own = matches.filter(match => match.candidateId === id);
  if (!own.length) return -Infinity;
  const weight = match => match.censored ? 0.35 : 1;
  const total = own.reduce((sum, match) => sum + weight(match), 0);
  const points = own.reduce((sum, match) => sum + weight(match) * (match.candidateScore > match.opponentScore ? 1
    : match.candidateScore === match.opponentScore ? 0.5 : 0), 0);
  const difference = own.reduce((sum, match) => sum + weight(match) * (match.candidateScore - match.opponentScore), 0);
  return points / total + difference / (10000 * total);
}

async function train({ source, populationSize, generations, mutation, simulations, seed, name, boardMode = 'fixed' }) {
  if (!['fixed', 'dynamic-fast'].includes(boardMode)) throw new Error('学習盤面の設定が不正です。');
  const patterns = boardMode === 'fixed' ? await loadPatterns() : [];
  let current = source ? parseMctsPopulation(source) : initialMctsPopulation();
  for (let offset = 0; offset < generations && !stopped; offset++) {
    const generation = current.generation + 1;
    const random = seededRandom(deriveSeed(seed, `mcts-generation-${generation}`));
    const candidates = spawnMctsCandidates(current, populationSize, mutation, random);
    const opponents = {
      current: { kind: 'mcts', parameters: current.individuals.find(item => item.id === current.championId).parameters },
      previous: { kind: 'mcts', parameters: current.previousChampion || current.individuals.find(item => item.id === current.championId).parameters },
      random: { kind: 'random' }, aggressive: { kind: 'aggressive' },
    };
    const matches = [];
    let gameNumber = 0;
    async function battle(candidate, opponent, round, swap = null, sharedSeed = null) {
      const matchSeed = sharedSeed ?? deriveSeed(seed, `mcts-${generation}-${round}-${candidate.id}-${opponent}-${gameNumber}`);
      const candidateFirst = swap === null ? random() < 0.5 : swap;
      const policies = candidateFirst ? [{ kind: 'mcts', parameters: candidate.parameters }, opponents[opponent]]
        : [opponents[opponent], { kind: 'mcts', parameters: candidate.parameters }];
      const pattern = boardMode === 'fixed' ? patterns[matchSeed % patterns.length] : null;
      self.postMessage({ type: 'progress', generation, game: ++gameNumber, candidateId: candidate.id,
        opponent, round, turns: 0 });
      const result = await playMctsMatch({ seed: matchSeed, pattern, trainingFastFrontier: boardMode === 'dynamic-fast', seats: policies, simulations,
        isCancelled: () => stopped, allowEarlyStop: round !== 'final',
        maxTurns: round === 'screen' ? 32 : round === 'promotion' ? 48 : Infinity,
        onTurn: ({ turns }) => self.postMessage({ type: 'progress', generation, game: gameNumber,
          candidateId: candidate.id, opponent, round, turns }) });
      if (!result) return null;
      const record = { candidateId: candidate.id, opponent, round, seed: matchSeed,
        candidateFirst, candidateScore: result.scores[candidateFirst ? 0 : 1],
        opponentScore: result.scores[candidateFirst ? 1 : 0], censored: result.censored,
        turns: result.turns, elapsedMs: Math.round(result.elapsedMs), patternSeed: result.patternSeed };
      matches.push(record);
      return record;
    }
    // Cheap broad screen: all challengers face two distinct policies.
    for (const candidate of candidates.slice(1)) {
      if (stopped) break;
      await battle(candidate, 'current', 'screen');
      if (stopped) break;
      await battle(candidate, 'random', 'screen');
    }
    if (stopped) break;
    const shortList = candidates.slice(1).sort((a, b) => rate(matches, b.id) - rate(matches, a.id))
      .slice(0, Math.max(1, Math.ceil((candidates.length - 1) / 2)));
    for (const candidate of shortList) {
      if (stopped) break;
      await battle(candidate, 'previous', 'promotion');
      if (stopped) break;
      await battle(candidate, 'aggressive', 'promotion');
    }
    if (stopped) break;
    shortList.sort((a, b) => rate(matches, b.id) - rate(matches, a.id));
    const finalist = shortList[0];
    // A fresh pair against the incumbent, with seats exchanged.
    const finalSeed = deriveSeed(seed, `mcts-${generation}-final-${finalist.id}`);
    const first = await battle(finalist, 'current', 'final', true, finalSeed);
    if (stopped) break;
    const second = await battle(finalist, 'current', 'final', false, finalSeed);
    if (stopped) break;
    const finalDifference = first.candidateScore - first.opponentScore + second.candidateScore - second.opponentScore;
    const finalPoints = [first, second].reduce((sum, match) => sum + (match.candidateScore > match.opponentScore ? 1
      : match.candidateScore === match.opponentScore ? 0.5 : 0), 0);
    const record = summarizeMctsGeneration({ source: current, candidates, matches,
      survivors: [0, ...shortList.map(item => item.id)], name });
    record.previousChampion = current.individuals.find(item => item.id === current.championId).parameters;
    record.finalAcceptance = { candidateId: finalist.id, points: finalPoints, difference: finalDifference,
      accepted: finalPoints > 1 || finalPoints === 1 && finalDifference > 0 };
    if (!record.finalAcceptance.accepted) record.championId = 0;
    else record.championId = finalist.id;
    self.postMessage({ type: 'generation', record });
    current = record;
  }
  self.postMessage({ type: stopped ? 'stopped' : 'done' });
}

self.onmessage = event => {
  const data = event.data;
  if (data.type === 'stop') { stopped = true; return; }
  if (data.type !== 'start' || running) return;
  running = true; stopped = false;
  train(data).catch(error => self.postMessage({ type: 'error', message: error.message || String(error) }))
    .finally(() => { running = false; });
};

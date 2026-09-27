import { Board } from '../game/Board.js';
import { createFillabilityCache, placementCandidates, structuralPlacementFrontier, updateFillabilityCache } from '../game/Rules.js';
import { isComplete, scoreFeature, vertexIsFullyTiled } from '../game/Scoring.js';
import { createPrototypeDeck, mirrorTile } from '../game/TileSet.js';
import { edgeMatchFor, edgesFor, halfTurnTerrainTile, verticesFor } from '../game/Tile.js';
import { phaseForProgress } from './TrainingEvolution.js';

export const FEATURE_DATASET_FORMAT = 'penrosanne-feature-dataset';
export const FEATURE_DATASET_VERSION = 1;
export const FEATURE_NAMES = Object.freeze([
  'immediate', 'futureCity', 'futureRoad', 'futureMonastery', 'futureField',
  'meepleCost', 'fieldMeepleCost', 'lastMeeple', 'vertex', 'obstruction', 'poach', 'theft',
  'siteMobility', 'completionOpportunity', 'completionDeadEnd', 'terrainVariety',
  'fieldClosure', 'openingCity', 'openingMonastery', 'openingField', 'comeback',
]);
const RATING = new Set(['unreviewed', 'runner-up', 'risky', 'bad', 'confident', 'uncertain', 'guess']);
const SELECTED = new Set(['confident', 'uncertain', 'guess']);
const round = value => Number((Number.isFinite(value) ? value : 0).toFixed(5));
const siteKey = tile => `${tile.shape}:${Math.round(tile.centerX * 1e4)}:${Math.round(tile.centerY * 1e4)}:${Math.round((((tile.rotation || 0) % Math.PI) + Math.PI) % Math.PI * 1e4)}`;
const physicalKind = tile => `${tile.shape}:${tile.idPrefix}`;

function catalogFor(deckType) {
  const catalog = createPrototypeDeck(() => 0, deckType);
  const byKind = new Map();
  for (const tile of catalog) if (!byKind.has(physicalKind(tile))) byKind.set(physicalKind(tile), tile);
  return { catalog, byKind, tileOptions: [...catalog, ...catalog.map(mirrorTile)] };
}

function meaningfulEdges(board, context) {
  const ownedTileIds = new Set(Object.keys(context.meeples || {}).map(ref => ref.split(':')[0]));
  const monasteries = board.tiles.filter(tile => tile.hasMonastery);
  return board.freeEdges().filter(({ tile, edge }) => {
    if (edge.terrain === 'C' || edge.terrain === 'R') return true;
    if (ownedTileIds.has(tile.id)) return true;
    if (board.vertexEntries(edge.a).length >= 2 || board.vertexEntries(edge.b).length >= 2) return true;
    return monasteries.some(monastery => Math.hypot(monastery.centerX - tile.centerX, monastery.centerY - tile.centerY) <= board.side * 2.2);
  });
}

function forcedConflict(candidate, forced, side) {
  for (const placed of forced) {
    if (placed.shape === candidate.shape && Math.hypot(placed.centerX - candidate.centerX, placed.centerY - candidate.centerY) < 1e-4
      && Math.abs(Math.sin((placed.rotation || 0) - (candidate.rotation || 0))) < 1e-4) continue;
    if (Math.hypot(placed.centerX - candidate.centerX, placed.centerY - candidate.centerY) > side * 2) continue;
    const obstacle = new Board(side); obstacle.tiles = [placed];
    if (obstacle.overlaps(candidate)) return true;
  }
  return false;
}

function siteScore(board, tile) {
  const preview = new Board(board.side); preview.tiles = [...board.tiles, tile];
  let ownPotential = 0, completedPoints = 0;
  const seen = new Set();
  for (const type of ['city', 'road']) for (let index = 0; index < (tile.featureGroups[type]?.length || 0); index++) {
    const component = preview.component(tile, type, index), key = `${type}:${component.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const score = scoreFeature(preview, tile, type, index);
    if (isComplete(preview, tile, type, index)) completedPoints += score;
    else ownPotential += score / (1 + component.openEdges.length);
  }
  return { completedPoints, potential: ownPotential };
}

function terrainEquivalentKind(tile) {
  // ルールの合法配置は形状と各辺の地形で決まり、都市・道の内部連結、紋章、
  // 修道院は合法位置を変えない。得点だけは元のタイル種類で別計算する。
  return JSON.stringify([tile.shape, tile.edgeTerrain]);
}

function featureVariant(source, candidate) {
  let result = candidate.terrainPattern === 'halfTurn' ? halfTurnTerrainTile(source) : source;
  if (candidate.mirrored) result = mirrorTile(result);
  return { ...result, id: source.id, centerX: candidate.centerX, centerY: candidate.centerY,
    rotation: candidate.rotation, matchingPattern: candidate.matchingPattern,
    matchingPatternOptions: candidate.matchingPatternOptions };
}

// 1手番に一度だけ実行。全山札順ではなく、公開済みの種類別残数を使用する。
export function buildPositionInformation(context, { deckType = 'standard', catalog = catalogFor(deckType), maxTargets = Infinity,
  previousFrontier = null, previousFillabilityCache = null, changedTile = null } = {}) {
  const board = new Board(120); board.tiles = context.boardTiles;
  const targets = meaningfulEdges(board, context).slice(0, maxTargets);
  const fillabilityCache = previousFillabilityCache && changedTile
    ? updateFillabilityCache(board, changedTile, catalog.tileOptions, previousFillabilityCache)
    : previousFillabilityCache || createFillabilityCache(board, catalog.tileOptions);
  const confirmed = previousFrontier?.forced.find(placed => placed.shape === changedTile?.shape
    && Math.hypot(placed.centerX - changedTile.centerX, placed.centerY - changedTile.centerY) < 1e-4
    && Math.abs(Math.sin((placed.rotation || 0) - (changedTile.rotation || 0))) < 1e-4);
  const previous = previousFrontier && changedTile ? {
    ...previousFrontier,
    forced: previousFrontier.forced.filter(placed => placed !== confirmed),
  } : previousFrontier;
  const frontier = context.rules?.ignoreMatchingRules ? null : structuralPlacementFrontier(board, {
    tileOptions: catalog.tileOptions, fillabilityCache,
    allowVerticalMatchingPattern: context.rules?.allowVerticalMatchingPattern ?? true,
    previous, changedTile, changedTileAlreadyVirtual: Boolean(confirmed),
  });
  const forced = frontier?.forced || [];
  const positions = new Map();
  let attemptedKinds = 0;
  const equivalent = new Map();
  for (const [kind, copies] of Object.entries(context.remainingDeck || {})) {
    if (!Number.isInteger(copies) || copies <= 0) continue;
    const source = catalog.byKind.get(kind);
    if (!source) throw new Error(`山札の種類が現在の定義にありません: ${kind}`);
    attemptedKinds++;
    const key = terrainEquivalentKind(source), group = equivalent.get(key) || [];
    // 山札のテンプレートIDが配置済みタイルIDと偶然一致しても、
    // 仮配置の連結・得点計算で同一タイルと誤認されないようにする。
    group.push({ kind, copies, source: { ...source, id: `__feature-precompute:${kind}` } });
    equivalent.set(key, group);
  }
  for (const group of equivalent.values()) {
    const representative = group[0].source;
    const candidates = placementCandidates(board, representative, {
      targets, tileOptions: catalog.tileOptions, fillabilityCache, ...context.rules,
    }).filter(tile => !forcedConflict(tile, forced, board.side));
    for (const { kind, copies, source } of group) {
      const perSite = new Map();
    for (const tile of candidates) {
      const key = siteKey(tile);
      const item = perSite.get(key) || { patterns: 0, completedPoints: 0, potential: 0 };
      const score = siteScore(board, featureVariant(source, tile));
      item.patterns++;
      item.completedPoints = Math.max(item.completedPoints, score.completedPoints);
      item.potential = Math.max(item.potential, score.potential);
      perSite.set(key, item);
    }
    for (const [key, item] of perSite) {
      const site = positions.get(key) || { key, copies: 0, kinds: 0, patterns: 0, maxCompletedPoints: 0, maxPotential: 0, byKind: {} };
      site.copies += copies; site.kinds++; site.patterns += item.patterns;
      site.maxCompletedPoints = Math.max(site.maxCompletedPoints, item.completedPoints);
      site.maxPotential = Math.max(site.maxPotential, item.potential);
      site.byKind[kind] = copies;
      positions.set(key, site);
    }
    }
  }
  return {
    positions: [...positions.values()].map(item => ({ ...item, maxCompletedPoints: round(item.maxCompletedPoints), maxPotential: round(item.maxPotential) })),
    inspectedEdges: targets.length, attemptedKinds, equivalentGroups: equivalent.size, forcedCount: forced.length,
    // 0件だけでは永久に埋められない証明にならない。現時点の候補なしと区別する。
    noPermanentDeadEndProof: true,
    frontier, fillabilityCache,
  };
}

function resultKey(candidate, assessment) {
  const placement = candidate.placement, features = candidate.features || {};
  const placed = { shape: placement.shape, centerX: placement.x, centerY: placement.y, rotation: placement.rotation,
    matchingPattern: placement.matchingPattern, edgeTerrain: placement.edgeTerrain };
  const worldEdges = edgesFor(placed, 120).map(edge => [
    round((edge.a.x + edge.b.x) / 2), round((edge.a.y + edge.b.y) / 2), edge.terrain, edgeMatchFor(placed, edge.name),
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const terrainState = (features.terrain || []).map(item => [item.type, item.tileCount, item.currentPoints, item.openEdgeCount,
    item.complete, item.owners, item.monasteryCount,
    String(item.key || '').split('|').filter(ref => !ref.startsWith(`${placement.tileId}:`)).sort(),
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  // 世界座標の辺地形・辺記号と接続状態を使う。見かけだけ同じ地形で
  // 記号が違えば後続の合法手が異なるので統合しない。
  return JSON.stringify([
    placement.shape, round(placement.x), round(placement.y), worldEdges, terrainState,
    assessment.meeple?.type, assessment.meeple?.index,
  ]);
}

function vectorFor(context, candidate, assessment, positionData, board, vertexCache) {
  const value = Object.fromEntries(FEATURE_NAMES.map(name => [name, 0]));
  const ownId = context.activePlayerId;
  const other = context.players.find(player => player.id !== ownId);
  const otherId = other?.id;
  const self = context.players.find(player => player.id === ownId);
  const meeple = assessment.meeple || { type: 'skip' };
  const terrain = candidate.features?.terrain || [];
  let variety = new Set();
  for (const item of terrain) {
    const own = (item.owners?.[ownId] || 0) + Number(meeple.type === item.type && (item.key || '').includes(`${candidate.placement.tileId}:${item.type}:${meeple.index}`));
    const enemy = item.owners?.[otherId] || 0;
    const score = Number(item.currentPoints) || 0;
    const openings = Number(item.openEdgeCount) || 0;
    const signed = own > enemy ? 1 : own < enemy ? -1 : own ? 0.5 : 0;
    if (item.complete) value.immediate += signed * score;
    else if (item.type === 'city') value.futureCity += signed * score / (1 + openings * 0.6);
    else if (item.type === 'road') value.futureRoad += signed * score / (1 + openings * 0.6);
    if (enemy && !own) value.obstruction += openings / (1 + score);
    if (own && enemy) {
      if (own === enemy) value.poach += score / (1 + openings);
      else if (own > enemy) value.theft += score / (1 + openings);
    }
    for (const edge of item.openEdges || []) {
      const counts = edge.terrainCompatibleCopiesUpperBound || {};
      if (counts.thin > 0) variety.add('thin');
      if (counts.fat > 0) variety.add('fat');
      // 残存山札にこの地形を持つ辺が一つもない場合だけ、
      // 延伸不能を確実に証明できる。終局時の未完成得点は future 側に残す。
      if (['city', 'road'].includes(item.type) && (counts.thin || 0) + (counts.fat || 0) === 0)
        value.completionDeadEnd = Math.max(value.completionDeadEnd, signed * score);
    }
  }
  value.terrainVariety = variety.size;
  const remaining = assessment.features?.meeple?.remainingMeeplesAfter;
  if (meeple.type !== 'skip') {
    value.meepleCost = 1;
    value.fieldMeepleCost = meeple.type === 'field' ? 1 : 0;
    value.lastMeeple = remaining === 0 ? 1 : 0;
    if (meeple.type === 'field') value.futureField = Number(assessment.features?.meeple?.currentPoints) || 0;
    if (meeple.type === 'monastery') value.futureMonastery = Number(assessment.features?.meeple?.currentPoints) || 0;
  }
  const pointMap = new Map(positionData.positions.map(site => [site.key, site]));
  const candidateX = candidate.placement.x, candidateY = candidate.placement.y;
  const selectedPosition = [...pointMap.values()].filter(site => {
    const [, x, y] = site.key.split(':');
    return Math.hypot(Number(x) / 1e4 - candidateX, Number(y) / 1e4 - candidateY) <= board.side * 1.6;
  });
  value.siteMobility = Math.log1p(Math.max(0, ...selectedPosition.map(site => site.copies)));
  value.completionOpportunity = selectedPosition.length ? Math.max(...selectedPosition.map(site => site.maxCompletedPoints)) : 0;
  // この特徴の0は「証明されなかった」を意味し、完成可能の保証ではない。
  value.openingCity = context.turnNumber <= 10 && meeple.type === 'city' ? 1 : 0;
  value.openingMonastery = context.turnNumber <= 10 && meeple.type === 'monastery' ? 1 : 0;
  value.openingField = context.turnNumber <= 10 && meeple.type === 'field' ? 1 : 0;
  value.comeback = other && self?.score < other.score && (value.theft + value.immediate > 0) ? (other.score - self.score) / 30 : 0;
  if (!vertexCache.has(candidate.id)) {
    const placement = candidate.placement;
    const placed = { ...context.currentTile, id: placement.tileId, shape: placement.shape,
      centerX: placement.x, centerY: placement.y, rotation: placement.rotation };
    const preview = new Board(board.side); preview.tiles = [...board.tiles, placed];
    let count = 0;
    for (const vertex of Object.values(verticesFor(placed, board.side)))
      if (!vertexIsFullyTiled(board, vertex) && vertexIsFullyTiled(preview, vertex)) count++;
    vertexCache.set(candidate.id, count);
  }
  value.vertex = vertexCache.get(candidate.id);
  return FEATURE_NAMES.map(name => round(value[name]));
}

export async function preprocessDecisionRecord(record, { onProgress = () => {}, yieldControl = async () => {}, maxTargets = Infinity } = {}) {
  if (record?.format !== 'penrosanne-decision-record' || record.version !== 2 || !Array.isArray(record.decisions)) throw new Error('判断記録JSONの版2が必要です。');
  if (!['full', 'cpu'].includes(record.origin)) throw new Error('盤面を直接編集した記録は学習・検証に使用しません。');
  if (record.setup?.playerCount !== 2 || record.setup?.deckType !== 'standard' || record.setup?.handMode !== 'single') throw new Error('初版は2人・標準山札・1枚手札の記録のみ対応します。');
  const catalog = catalogFor(record.setup.deckType), decisions = [];
  let excluded = 0, rawAssessments = 0, collapsed = 0;
  let priorBoardIds = null, previousFrontier = null, previousFillabilityCache = null;
  for (const source of record.decisions) {
    if (source.kind !== 'turn') { excluded++; continue; }
    if (!source.chosenId || !source.assessments?.[source.chosenId] || !SELECTED.has(source.assessments[source.chosenId].rating)) throw new Error(`${source.id}: 採用候補が不正です。`);
    const context = source.context;
    if (!context?.boardTiles || !context?.remainingDeck || !Array.isArray(source.candidates)) throw new Error(`${source.id}: 局面情報が不足しています。`);
    const currentIds = new Set(context.boardTiles.map(tile => tile.id));
    const added = priorBoardIds ? context.boardTiles.filter(tile => !priorBoardIds.has(tile.id)) : [];
    const incremental = priorBoardIds && added.length <= 1 && [...priorBoardIds].every(id => currentIds.has(id));
    const positionData = buildPositionInformation(context, { catalog, maxTargets,
      previousFrontier: incremental ? previousFrontier : null,
      previousFillabilityCache: incremental ? previousFillabilityCache : null,
      changedTile: added.length === 1 ? added[0] : null,
    });
    priorBoardIds = currentIds; previousFrontier = positionData.frontier; previousFillabilityCache = positionData.fillabilityCache;
    const board = new Board(120); board.tiles = context.boardTiles;
    const vertexCache = new Map();
    const candidateById = new Map(source.candidates.map(candidate => [candidate.id, candidate]));
    const unique = new Map(), aliases = {}, conflicting = [];
    for (const assessment of Object.values(source.assessments)) {
      if (!RATING.has(assessment.rating)) throw new Error(`${source.id}: 未知の評価 ${assessment.rating}`);
      const candidate = candidateById.get(assessment.tileCandidateId);
      if (!candidate) throw new Error(`${source.id}: 候補参照が壊れています。`);
      rawAssessments++;
      const key = resultKey(candidate, assessment);
      if (!unique.has(key)) unique.set(key, { id: assessment.id, aliases: [], features: vectorFor(context, candidate, assessment, positionData, board, vertexCache), ratings: [], selected: false });
      const group = unique.get(key);
      group.aliases.push(assessment.id); group.ratings.push(assessment.rating);
      group.selected ||= assessment.id === source.chosenId;
      aliases[assessment.id] = group.id;
    }
    for (const group of unique.values()) {
      const reviewed = [...new Set(group.ratings.filter(rating => rating !== 'unreviewed'))];
      if (reviewed.length > 1) conflicting.push(group.id);
      group.rating = reviewed.length === 1 ? reviewed[0] : 'unreviewed';
      delete group.ratings;
    }
    collapsed += Object.keys(source.assessments).length - unique.size;
    const totalTiles = context.boardTiles.length + (context.remainingDeckCount || 0) + 1;
    decisions.push({ id: source.id, turnNumber: context.turnNumber, phase: phaseForProgress(context.boardTiles.length / Math.max(1, totalTiles)),
      selectedId: aliases[source.chosenId], groups: [...unique.values()], aliases, conflicting,
      positions: positionData.positions, positionSummary: { inspectedEdges: positionData.inspectedEdges, attemptedKinds: positionData.attemptedKinds, equivalentGroups: positionData.equivalentGroups, forcedCount: positionData.forcedCount, zeroCopiesMeans: 'currently-unavailable-not-proven-dead' },
    });
    onProgress({ completed: decisions.length, total: record.decisions.length, rawAssessments, collapsed });
    await yieldControl();
  }
  if (!decisions.length) throw new Error('利用可能な手番がありません。');
  return { format: FEATURE_DATASET_FORMAT, version: FEATURE_DATASET_VERSION, createdAt: new Date().toISOString(),
    source: { createdAt: record.createdAt, seed: record.seed, origin: record.origin }, setup: record.setup,
    featureNames: FEATURE_NAMES, decisions, summary: { decisions: decisions.length, excluded, rawAssessments, collapsed } };
}

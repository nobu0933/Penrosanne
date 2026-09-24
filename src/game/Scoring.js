import { SHAPES, verticesFor } from './Tile.js';

const EPSILON = 1e-4;

export function isComplete(board, tile, type, index) {
  if (type === "monastery") return monasteryNeighbors(board,tile).complete;
  const component = board.component(tile,type,index);
  if (component.openEdges.length) return false;
  return type !== "road" || roadHasOnlyValidTerminals(component);
}

function roadHasOnlyValidTerminals(component) {
  return component.features.every(({ tile, index }) => {
    const terminals = tile.roadTerminals?.[index];
    if (!terminals || terminals.length !== 2) return false;
    return terminals.every((terminal) =>
      terminal.kind === "edge" ||
      terminal.kind === "intersection" ||
      (terminal.kind === "city" && tile.featureGroups.city?.[terminal.cityGroup]) ||
      (terminal.kind === "monastery" && tile.hasMonastery),
    );
  });
}

export function monasteryNeighbors(board, tile) {
  const vertices = Object.values((awaitlessVertices(board,tile)));
  const neighbors = new Set(); let complete=true;
  for (const vertex of vertices) {
    const touching=board.vertexTiles(vertex,tile.id);
    if (!vertexIsFullyTiled(board, vertex)) complete=false;
    touching.forEach((other)=>neighbors.add(other.id));
  }
  return { complete, count:neighbors.size };
}

function awaitlessVertices(board,tile) { return Object.fromEntries(board.edges(tile).flatMap((edge)=>[[edge.from,edge.a],[edge.to,edge.b]])); }

// その頂点に集まる全タイルの内角が360度なら、頂点の周囲に隙間はない。
export function vertexIsFullyTiled(board, point) {
  const totalAngle = board.vertexTiles(point).reduce((sum, tile) => sum + tileAngleAt(board, tile, point), 0);
  return Math.abs(totalAngle - Math.PI * 2) < EPSILON;
}

function tileAngleAt(board, tile, point) {
  const vertices = verticesFor(tile, board.side);
  const ids = SHAPES[tile.shape].vertices;
  const index = ids.findIndex((id) => samePoint(vertices[id], point));
  if (index < 0) return 0;
  const center = vertices[ids[index]], before = vertices[ids[(index + 3) % 4]], after = vertices[ids[(index + 1) % 4]];
  const one = { x: before.x - center.x, y: before.y - center.y }, two = { x: after.x - center.x, y: after.y - center.y };
  return Math.acos(Math.max(-1, Math.min(1, (one.x * two.x + one.y * two.y) / (Math.hypot(one.x, one.y) * Math.hypot(two.x, two.y)))));
}

function samePoint(a, b) { return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON; }

export function scoreFeature(board, tile, type, index) {
  // 修道院は周囲のユニークなタイルに加え、修道院タイル自身も1枚として数える。
  // 完成時・終局時の未完成得点はいずれもこの共通の式を使う。
  if (type === "monastery") return monasteryNeighbors(board,tile).count + 1;
  const component=board.component(tile,type,index), uniqueTiles=new Map(component.features.map(({tile:featureTile})=>[featureTile.id,featureTile]));
  if (type === "city") return (uniqueTiles.size + [...uniqueTiles.values()].filter((featureTile)=>featureTile.hasCrest).length) * (isComplete(board,tile,type,index) ? 2 : 1);
  if (type === "road") return uniqueTiles.size;
  return 0;
}

export function scoreField(board, tile, index) {
  const field=board.fieldScoreComponent(tile,index), cities=new Set();
  for (const {tile:fieldTile,index:fieldIndex} of field.features) for (const cityIndex of (fieldTile.fieldScoreCityAdjacency?.[fieldIndex] ?? fieldTile.fieldCityAdjacency?.[fieldIndex] ?? [])) {
    const city=board.component(fieldTile,"city",cityIndex); if (city.openEdges.length===0) cities.add(city.key);
  }
  return cities.size * 3;
}

export const TITLE_POINTS = 10;

// 称号を増やすときはここへ定義を追加する。UIの開始前設定もこの一覧から作る。
export const TITLE_DEFINITIONS = Object.freeze([
  { id: 'vertexKing', metric: (state, player) => player.vertexCompletions },
  { id: 'roadKing', metric: (state, player) => Math.max(0, ...state.scoreEvents
    .filter((event) => event.type === 'road' && event.playerId === player.id)
    .map((event) => event.points)) },
  { id: 'supportKing', metric: (state, player) => player.supportCount },
]);

export function titleAwards(state, enabledTitles = {}) {
  const awards = [];
  for (const { id, metric } of TITLE_DEFINITIONS) {
    if (!enabledTitles[id]) continue;
    const values = state.players.map((player) => ({ playerId: player.id, count: metric(state, player) }));
    const highest = Math.max(0, ...values.map((value) => value.count));
    if (highest === 0) continue;
    for (const value of values) if (value.count === highest)
      awards.push({ playerId: value.playerId, titleId: id, points: TITLE_POINTS, count: highest });
  }
  return awards;
}

// 対局中の表示専用。終局の称号採点は titleAwards の既存基準を維持する。
export function provisionalTitleLeaders(state, enabledTitles = {}) {
  const longestLiveRoad = new Map(state.players.map((player) => [player.id, 0]));
  if (enabledTitles.roadKing && state.board) {
    const visited = new Set();
    for (const tile of state.board.tiles) for (let index = 0; index < (tile.featureGroups.road?.length ?? 0); index++) {
      const ref = state.board.featureRef(tile, 'road', index);
      if (visited.has(ref)) continue;
      const component = state.board.component(tile, 'road', index);
      const counts = new Map();
      const tileIds = new Set();
      for (const feature of component.features) {
        const featureRef = state.board.featureRef(feature.tile, 'road', feature.index);
        visited.add(featureRef);
        tileIds.add(feature.tile.id);
        const owner = state.meeples[featureRef];
        if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
      const highest = Math.max(0, ...counts.values());
      if (!highest) continue;
      for (const [playerId, count] of counts) if (count === highest)
        longestLiveRoad.set(playerId, Math.max(longestLiveRoad.get(playerId) ?? 0, tileIds.size));
    }
  }
  return TITLE_DEFINITIONS.filter(({ id }) => enabledTitles[id]).map(({ id, metric }) => {
    const values = state.players.map((player) => ({
      playerId: player.id,
      count: Math.max(metric(state, player), id === 'roadKing' ? (longestLiveRoad.get(player.id) ?? 0) : 0),
    }));
    const highest = Math.max(0, ...values.map(({ count }) => count));
    return { id, count: highest, playerIds: highest ? values.filter(({ count }) => count === highest).map(({ playerId }) => playerId) : [] };
  });
}

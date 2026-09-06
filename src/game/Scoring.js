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
  if (type === "monastery") return monasteryNeighbors(board,tile).count;
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

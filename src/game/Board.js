import { edgesFor, verticesFor } from "./Tile.js";

const EPSILON = 1e-5;
const pointKey = (point) => `${Math.round(point.x / EPSILON)}:${Math.round(point.y / EPSILON)}`;
const samePoint = (a, b) => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
const edgeKey = (edge) => [pointKey(edge.a), pointKey(edge.b)].sort().join("|");

export class Board {
  constructor(side) { this.side = side; this.tiles = []; this._allEdges = null; }
  add(tile) { this.tiles.push(structuredClone(tile)); this._allEdges = null; return this.getTile(tile.id); }
  getTile(id) { return this.tiles.find((tile) => tile.id === id); }
  edges(tile) { return edgesFor(tile, this.side); }
  allEdges() { return this._allEdges ||= this.tiles.flatMap((tile) => this.edges(tile).map((edge) => ({ tile, edge }))); }
  edgeNeighbors(tile, edge) { const key = edgeKey(edge); return this.allEdges().filter(({ tile: other, edge: otherEdge }) => other.id !== tile.id && edgeKey(otherEdge) === key); }
  freeEdges() {
    const all = this.allEdges(), counts = new Map();
    for (const { edge } of all) { const key = edgeKey(edge); counts.set(key, (counts.get(key) || 0) + 1); }
    return all.filter(({ edge }) => counts.get(edgeKey(edge)) === 1);
  }
  vertexTiles(point, withoutTileId) { return this.tiles.filter((tile) => tile.id !== withoutTileId && Object.values(verticesFor(tile, this.side)).some((vertex) => samePoint(vertex, point))); }
  featureRef(tile, type, index) { return `${tile.id}:${type}:${index}`; }
  featureAtEdge(tile, type, edgeName) { return (tile.featureGroups[type] || []).findIndex((group) => (Array.isArray(group) ? group : group.boundaryEdges || []).includes(edgeName)); }
  component(tile, type, index) {
    const queue = [{ tile, index }], seen = new Set(), features = [], openEdges = [];
    while (queue.length) {
      const item = queue.pop(), key = this.featureRef(item.tile, type, item.index); if (seen.has(key)) continue; seen.add(key); features.push(item);
      const groupDefinition = item.tile.featureGroups[type]?.[item.index] || [];
      const group = Array.isArray(groupDefinition) ? groupDefinition : groupDefinition.boundaryEdges || [];
      for (const edgeName of group) {
        const edge = this.edges(item.tile).find((candidate) => candidate.name === edgeName);
        const neighbors = this.edgeNeighbors(item.tile, edge).filter(({ edge: neighbor }) => neighbor.terrain === edge.terrain);
        if (!neighbors.length) openEdges.push({ tile:item.tile, edge });
        for (const { tile: neighborTile, edge: neighborEdge } of neighbors) {
          const neighborIndex = this.featureAtEdge(neighborTile, type, neighborEdge.name);
          if (neighborIndex >= 0) queue.push({ tile:neighborTile, index:neighborIndex });
        }
      }
    }
    return { features, openEdges, key: [...seen].sort().join("|") };
  }
  // 草原得点は、配置時の featureGroups.field とは別に、各タイルを4小領域で接続する。
  fieldScoreGroups(tile) {
    if (Array.isArray(tile.fieldScoreGroups)) return tile.fieldScoreGroups;
    return tile.featureGroups.field?.length ? [[1, 2, 3, 4]] : [];
  }
  fieldScoreComponent(tile, index) {
    const queue = [{ tile, index }], seen = new Set(), features = [];
    while (queue.length) {
      const item = queue.pop(), key = `${item.tile.id}:score-field:${item.index}`;
      if (seen.has(key)) continue;
      const subregions = this.fieldScoreGroups(item.tile)[item.index];
      if (!subregions?.length) continue;
      seen.add(key); features.push(item);
      for (const edge of this.edges(item.tile)) {
        if (!canTraverseFieldEdge(edge.terrain)) continue;
        for (const point of [edge.a, edge.b]) {
          const sourceSubregion = subregionAtEdgePoint(edge, point);
          if (!subregions.includes(sourceSubregion)) continue;
          for (const { tile: neighborTile, edge: neighborEdge } of this.edgeNeighbors(item.tile, edge)) {
            if (!canTraverseFieldEdge(neighborEdge.terrain)) continue;
            const neighborSubregion = subregionAtEdgePoint(neighborEdge, point);
            const neighborIndex = this.fieldScoreGroups(neighborTile).findIndex((group) => group.includes(neighborSubregion));
            if (neighborIndex >= 0) queue.push({ tile: neighborTile, index: neighborIndex });
          }
        }
      }
    }
    return { features, key: [...seen].sort().join("|") };
  }
  overlaps(candidate) {
    const candidatePoints = Object.values(verticesFor(candidate, this.side));
    return this.tiles.some((tile) => polygonsOverlap(candidatePoints, Object.values(verticesFor(tile, this.side))));
  }
}

function canTraverseFieldEdge(terrain) { return terrain === "F" || terrain === "R"; }
function subregionAtEdgePoint(edge, point) {
  if (samePoint(edge.a, point)) return edge.index + 1;
  if (samePoint(edge.b, point)) return (edge.index + 1) % 4 + 1;
  return 0;
}

function polygonsOverlap(a, b) {
  const axes = [...axesFor(a), ...axesFor(b)];
  return axes.every((axis) => { const one=project(a,axis), two=project(b,axis); return Math.min(one.max,two.max) - Math.max(one.min,two.min) > EPSILON; });
}
function axesFor(points) { return points.map((point,index) => { const next=points[(index+1)%points.length], dx=next.x-point.x,dy=next.y-point.y; const length=Math.hypot(dx,dy); return {x:-dy/length,y:dx/length}; }); }
function project(points, axis) { const values=points.map((point)=>point.x*axis.x+point.y*axis.y); return {min:Math.min(...values),max:Math.max(...values)}; }

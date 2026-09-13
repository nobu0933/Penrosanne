import { edgesFor, verticesFor } from "./Tile.js";

const EPSILON = 1e-5;
const pointKey = (point) => `${Math.round(point.x / EPSILON)}:${Math.round(point.y / EPSILON)}`;
const samePoint = (a, b) => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
const edgeKey = (edge) => [pointKey(edge.a), pointKey(edge.b)].sort().join("|");

// `pointKey()` は丸め境界の両側にある同一点を別キーにする可能性がある。
// 既存の `samePoint()` 判定と同じ結果を保つため、索引参照時は周囲 1 セルも確認する。
function nearbyPointKeys(point) {
  const baseX = Math.round(point.x / EPSILON), baseY = Math.round(point.y / EPSILON), keys = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) keys.push(`${baseX + dx}:${baseY + dy}`);
  return keys;
}

function nearbyEdgeKeys(edge) {
  const keys = new Set();
  for (const a of nearbyPointKeys(edge.a)) for (const b of nearbyPointKeys(edge.b)) keys.add([a, b].sort().join("|"));
  return keys;
}

export class Board {
  constructor(side) {
    this.side = side;
    this.tiles = [];
    this._resetIndexes();
  }

  add(tile) {
    this._ensureIndexes();
    const stored = structuredClone(tile);
    this.tiles.push(stored);
    this._indexTile(stored);
    this._indexedLength = this.tiles.length;
    this._geometrySignature = null;
    return stored;
  }

  getTile(id) {
    this._ensureIndexes();
    return this._tileById.get(id);
  }

  edges(tile) { return edgesFor(tile, this.side); }

  allEdges() {
    this._ensureIndexes();
    return this._allEdges;
  }

  edgeNeighbors(tile, edge) {
    this._ensureIndexes();
    // ここは従来どおり、端点の量子化キーが完全一致する辺だけを隣接辺とする。
    return (this._edgeIndex.get(edgeKey(edge)) || []).filter(({ tile: other }) => other.id !== tile.id);
  }

  // 候補タイルの辺に、端点を逆順で共有する既存辺を返す。
  // 通常の edgeNeighbors と違い、候補タイルはまだ盤面へ追加されていないため、
  // `samePoint` と同じ許容誤差で照合する。
  matchingEdges(edge) {
    this._ensureIndexes();
    const matches = [], seen = new Set();
    for (const key of nearbyEdgeKeys(edge)) for (const entry of this._edgeIndex.get(key) || []) {
      const identity = `${entry.tile.id}:${entry.edge.index}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (samePoint(edge.a, entry.edge.b) && samePoint(edge.b, entry.edge.a)) matches.push(entry);
    }
    return matches;
  }

  freeEdges() {
    this._ensureIndexes();
    const free = [];
    for (const entries of this._edgeIndex.values()) if (entries.length === 1) free.push(entries[0]);
    return free;
  }

  // 指定頂点と `samePoint` で一致する頂点情報。頂点型探索では tile 全走査の代わりに使う。
  vertexEntries(point, withoutTileId) {
    this._ensureIndexes();
    const entries = [], seen = new Set();
    for (const key of nearbyPointKeys(point)) for (const entry of this._vertexIndex.get(key) || []) {
      const identity = `${entry.tile.id}:${entry.vertexId}`;
      if (seen.has(identity) || entry.tile.id === withoutTileId || !samePoint(entry.vertex, point)) continue;
      seen.add(identity);
      entries.push(entry);
    }
    return entries;
  }

  vertexTiles(point, withoutTileId) {
    const matching = new Set(this.vertexEntries(point, withoutTileId).map(({ tile }) => tile));
    // 従来の tiles.filter と同じ盤面順を維持する。
    return this.tiles.filter((tile) => matching.has(tile));
  }

  // 構造探索の完全一致キャッシュ用。地形・ID・表示状態は探索結果へ影響せず、
  // タイル形状と幾何だけが影響するため、それだけを正規化して表す。
  geometrySignature() {
    this._ensureIndexes();
    if (this._geometrySignature !== null) return this._geometrySignature;
    this._geometrySignature = this.tiles
      .map((tile) => {
        const rotation = ((tile.rotation || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        return `${tile.shape}:${Math.round(tile.centerX / EPSILON)}:${Math.round(tile.centerY / EPSILON)}:${Math.round(rotation / EPSILON)}`;
      })
      .sort()
      .join(";");
    return this._geometrySignature;
  }

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
    this._ensureIndexes();
    const candidatePoints = Object.values(verticesFor(candidate, this.side));
    // AABB の同じセルにあるタイルだけを SAT 判定する。セル外のタイルは
    // 多角形が重なり得ないため、結果は全走査と完全に同じである。
    return this._tilesNearPoints(candidatePoints).some((tile) => polygonsOverlap(candidatePoints, Object.values(verticesFor(tile, this.side))));
  }

  _resetIndexes() {
    this._allEdges = [];
    this._edgeIndex = new Map();
    this._vertexIndex = new Map();
    this._spatialIndex = new Map();
    this._tileById = new Map();
    this._indexedTiles = this.tiles;
    this._indexedLength = 0;
    this._geometrySignature = null;
    this._cellSize = Math.max(1, this.side || 1);
  }

  _ensureIndexes() {
    // 既存コードには `board.tiles = [...]` で盤面を復元する箇所があるため、
    // 配列の差し替え・長さ変更時は索引を遅延再構築する。
    if (this._indexedTiles === this.tiles && this._indexedLength === this.tiles.length) return;
    this._resetIndexes();
    for (const tile of this.tiles) this._indexTile(tile);
    this._indexedLength = this.tiles.length;
  }

  _indexTile(tile) {
    if (!this._tileById.has(tile.id)) this._tileById.set(tile.id, tile);
    const vertices = verticesFor(tile, this.side);
    for (const [vertexId, vertex] of Object.entries(vertices)) {
      const key = pointKey(vertex), entries = this._vertexIndex.get(key) || [];
      entries.push({ tile, vertexId, vertex });
      this._vertexIndex.set(key, entries);
    }
    for (const edge of edgesFor(tile, this.side)) {
      const key = edgeKey(edge), entries = this._edgeIndex.get(key) || [], entry = { tile, edge };
      entries.push(entry);
      this._edgeIndex.set(key, entries);
      this._allEdges.push(entry);
    }
    const points = Object.values(vertices);
    const bounds = {
      minX: Math.min(...points.map(({ x }) => x)), maxX: Math.max(...points.map(({ x }) => x)),
      minY: Math.min(...points.map(({ y }) => y)), maxY: Math.max(...points.map(({ y }) => y)),
    };
    for (const key of this._spatialKeysForBounds(bounds)) {
      const entries = this._spatialIndex.get(key) || [];
      entries.push(tile);
      this._spatialIndex.set(key, entries);
    }
  }

  _tilesNearPoints(points) {
    const bounds = {
      minX: Math.min(...points.map(({ x }) => x)), maxX: Math.max(...points.map(({ x }) => x)),
      minY: Math.min(...points.map(({ y }) => y)), maxY: Math.max(...points.map(({ y }) => y)),
    };
    const tiles = new Set();
    for (const key of this._spatialKeysForBounds(bounds)) for (const tile of this._spatialIndex.get(key) || []) tiles.add(tile);
    return [...tiles];
  }

  _spatialKeysForBounds({ minX, maxX, minY, maxY }) {
    const keys = [];
    const fromX = Math.floor(minX / this._cellSize), toX = Math.floor(maxX / this._cellSize);
    const fromY = Math.floor(minY / this._cellSize), toY = Math.floor(maxY / this._cellSize);
    for (let x = fromX; x <= toX; x++) for (let y = fromY; y <= toY; y++) keys.push(`${x}:${y}`);
    return keys;
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

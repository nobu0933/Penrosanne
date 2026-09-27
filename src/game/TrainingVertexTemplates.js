import { Board } from './Board.js';
import { edgeNames, localVertices, verticesFor } from './Tile.js';
import { VERTEX_PATTERNS, structuralPlacementFrontier, structuralPositionKey } from './Rules.js';
import { VERTEX_TEMPLATE_DATA } from './TrainingVertexTemplateData.js';

const TAU = Math.PI * 2;
const vertexWidth = (shape, id) => shape === 'thin'
  ? (id === 'A' || id === 'C' ? Math.PI * 4 / 5 : Math.PI / 5)
  : (id === 'E' || id === 'G' ? Math.PI * 2 / 5 : Math.PI * 3 / 5);
const structuralTile = (shape, id) => ({ id, shape,
  edgeTerrain: Object.fromEntries(edgeNames(shape).map(edge => [edge, 'F'])),
  featureGroups: { city: [], road: [], field: [] },
  matchingPattern: null, isStructural: true });

export function minimalVertexBoard(type, side = 120) {
  const pattern = VERTEX_PATTERNS[type];
  if (!pattern) throw new Error(`未知の頂点型: ${type}`);
  const board = new Board(side);
  let start = 0;
  for (const [index, vertexId] of [...pattern].entries()) {
    const shape = vertexId >= 'E' ? 'fat' : 'thin';
    const local = localVertices(shape, side)[vertexId];
    const rotation = start + vertexWidth(shape, vertexId) / 2 - Math.atan2(-local.y, -local.x);
    const cosine = Math.cos(rotation), sine = Math.sin(rotation);
    const tile = { ...structuralTile(shape, `__template-${type}-${index}`),
      centerX: -local.x * cosine + local.y * sine,
      centerY: -local.x * sine - local.y * cosine,
      rotation: ((rotation % TAU) + TAU) % TAU };
    const vertex = verticesFor(tile, side)[vertexId];
    if (Math.hypot(vertex.x, vertex.y) > 1e-6 || board.overlaps(tile))
      throw new Error(`${type} の最小配置を構築できません。`);
    board.add(tile);
    start += vertexWidth(shape, vertexId);
  }
  if (Math.abs(start - TAU) > 1e-6) throw new Error(`${type} の頂点角が360度ではありません。`);
  return board;
}

export function buildVertexExpansionTemplates(side = 120) {
  return Object.fromEntries(Object.keys(VERTEX_PATTERNS).map(type => {
    const seed = minimalVertexBoard(type, side);
    const frontier = structuralPlacementFrontier(seed);
    const tiles = [...seed.tiles, ...frontier.forced];
    const unique = new Map(tiles.map(tile => [structuralPositionKey(tile), tile]));
    if (unique.size !== tiles.length) throw new Error(`${type} の拡張に重複があります。`);
    return [type, { type, side, seedCount: seed.tiles.length,
      seedVertexIds: [...VERTEX_PATTERNS[type]], tiles, forcedCount: frontier.forced.length }];
  }));
}

const templateCache = new Map();
export function cachedVertexExpansionTemplates(side = 120) {
  if (!templateCache.has(side)) templateCache.set(side, Object.fromEntries(Object.entries(VERTEX_TEMPLATE_DATA).map(([type, compact]) => {
    const scale = side / 120;
    const tiles = compact.tiles.map(([shape, centerX, centerY, rotation], index) => ({
      ...structuralTile(shape, `__template-${type}-${index}`),
      centerX: centerX * scale, centerY: centerY * scale, rotation,
    }));
    return [type, { type, side, seedCount: compact.seedCount, seedVertexIds: compact.seedVertexIds,
      tiles, forcedCount: tiles.length - compact.seedCount }];
  })));
  return templateCache.get(side);
}

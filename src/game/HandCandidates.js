import { structuralPositionKey } from './Rules.js';

// ミラー版にも、元の手札の識別子を保持する。
export function handTileId(tile) {
  return tile?._handTileId || tile?.originalId || tile?.id;
}

export function handTileKind(tile) {
  const prefix=tile.idPrefix?.replace(/-mirror$/, '');
  return prefix
    ? `${tile.shape}:${prefix}`
    : JSON.stringify([tile.shape,tile.edgeTerrain,tile.featureGroups,tile.hasMonastery,tile.hasCrest]);
}

export function candidatesForHandTile(candidates, tile) {
  const id = typeof tile === 'string' ? tile : handTileId(tile);
  return candidates.filter(candidate => handTileId(candidate) === id);
}

export function uniqueCandidatePositions(candidates) {
  const positions=new Map();
  for (const candidate of candidates) if (!positions.has(handPositionKey(candidate))) positions.set(handPositionKey(candidate),candidate);
  return [...positions.values()];
}

export function handPositionKey(tile) {
  // 同じひし形の180度違いも、クリック時には一つの配置場所。
  const rotation=(((tile.rotation || 0) % Math.PI) + Math.PI) % Math.PI;
  return structuralPositionKey({...tile,rotation:Math.min(rotation,Math.PI-rotation)<1e-5?0:rotation});
}

export function handChoicesAtPosition(candidates, position) {
  const key = handPositionKey(position);
  const choices = new Map();
  for (const candidate of candidates) {
    if (handPositionKey(candidate) === key && !choices.has(handTileKind(candidate))) {
      choices.set(handTileKind(candidate), candidate);
    }
  }
  return [...choices.values()];
}

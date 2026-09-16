import { Board } from "./Board.js";
import { createGameState } from "./GameState.js";
import { createPrototypeDeck, mirrorTile } from "./TileSet.js";
import { createFillabilityCache, featureCanReceiveMeeple, isLegalPlacement, placementCandidates, structuralPlacementFrontier, structuralPlacementFrontierProgressively, structuralPositionKey, updateFillabilityCache } from "./Rules.js";
import { isComplete, scoreFeature, scoreField, vertexIsFullyTiled } from "./Scoring.js";
import { verticesFor } from "./Tile.js";
import { createPlayer } from "./Player.js";

import { beginHistoryTurn, captureHistoryMeeples, completeHistoryTurn } from "./TurnHistory.js";

export class GameEngine {
  constructor({ playerCount=2, meeples=7, side=120, random=Math.random, fieldScoring=true, deckType="standard", rules={}, deferCandidateSearch=false }={}) { this.random=random; this.deckType=deckType; this.rules={allowVerticalMatchingPattern:rules.allowVerticalMatchingPattern ?? true,allowTerrainHalfTurn:rules.allowTerrainHalfTurn ?? true,allowTerrainMirror:rules.allowTerrainMirror ?? false}; this.deferCandidateSearch=deferCandidateSearch; this._candidateGroups=null; this._structuralFrontier=null; this._previousStructuralFrontier=null; this._structuralChangedTile=null; this._changedTileAlreadyVirtual=false; const players=Array.from({length:playerCount},(_,index)=>createPlayer({id:`p${index+1}`,name:`Player ${index+1}`,meeples})); const deck=shuffle(createPrototypeDeck(random, deckType),random); this.tileOptions=[...deck.map((tile)=>structuredClone(tile)), ...deck.map((tile)=>mirrorTile(tile))]; this.state=createGameState({players,deck}); this.state.board=new Board(side); this.fillabilityCache=new Map(); this.fieldScoring=fieldScoring; this.start(); }
  start() { const start=this.state.deck.pop(); start.centerX=0;start.centerY=0;start.rotation=0;initializeStartTilePatterns(start,this.rules.allowVerticalMatchingPattern);this.state.board.add(start);this.fillabilityCache=createFillabilityCache(this.state.board,this.tileOptions);this.nextTurn(); }
  get activePlayer() { return this.state.players[this.state.turn]; }
  structuralFrontier() {
    if (this._structuralFrontier) return this._structuralFrontier;
    const frontier = structuralPlacementFrontier(this.state.board, {
      tileOptions:this.tileOptions,
      fillabilityCache:this.fillabilityCache,
      allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,
      previous:this._previousStructuralFrontier,
      changedTile:this._structuralChangedTile,
      changedTileAlreadyVirtual:this._changedTileAlreadyVirtual,
    });
    this._previousStructuralFrontier=null;
    this._structuralChangedTile=null;
    this._changedTileAlreadyVirtual=false;
    return this._structuralFrontier=frontier;
  }
  structuralCandidates() { return this.structuralFrontier().forced; }
  async structuralFrontierProgressively({ onForced, yieldControl } = {}) {
    if (this._structuralFrontier) return this._structuralFrontier;
    const frontier = await structuralPlacementFrontierProgressively(this.state.board, {
      tileOptions:this.tileOptions,
      fillabilityCache:this.fillabilityCache,
      allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,
      previous:this._previousStructuralFrontier,
      changedTile:this._structuralChangedTile,
      changedTileAlreadyVirtual:this._changedTileAlreadyVirtual,
    }, { onForced, yieldControl });
    this._previousStructuralFrontier=null;
    this._structuralChangedTile=null;
    this._changedTileAlreadyVirtual=false;
    return this._structuralFrontier=frontier;
  }
  candidateGroups() {
    if(this.state.phase!=="placeTile") return {regular:[],forced:[],unresolved:[]};
    // 手札はまだ盤面へ置かれていないため、以前の候補探索で狭めたパターンを
    // 持ち越さない。これにより、表示済みの手札でも辺記号だけを180度回転した
    // パターンを必ず再評価する。
	if (resetUnplacedPlacementPatterns(this.state.currentTile, this.rules.allowVerticalMatchingPattern, this.rules.allowTerrainHalfTurn)) this._candidateGroups=null;
    if(this._candidateGroups) return this._candidateGroups;
    const frontier=this.structuralFrontier(), forced=frontier.forced;
	const regular=placementCandidates(this.state.board,this.state.currentTile,{tileOptions:this.tileOptions,fillabilityCache:this.fillabilityCache,allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,allowTerrainHalfTurn:this.rules.allowTerrainHalfTurn,allowTerrainMirror:this.rules.allowTerrainMirror})
      .filter((candidate)=>!conflictsWithForcedPlacement(candidate, forced, this.state.board.side));
    return this._candidateGroups={regular,forced,unresolved:frontier.unresolved};
  }
  candidates() { return this.candidateGroups().regular; }
  async candidateGroupsProgressively({ onForced, yieldControl } = {}) {
    while (this.state.phase === "placeTile" && this.state.currentTile) {
      if (resetUnplacedPlacementPatterns(this.state.currentTile, this.rules.allowVerticalMatchingPattern, this.rules.allowTerrainHalfTurn)) this._candidateGroups=null;
      if (this._candidateGroups) return this._candidateGroups;
      const frontier = await this.structuralFrontierProgressively({ onForced, yieldControl });
      const regular = placementCandidates(this.state.board,this.state.currentTile,{tileOptions:this.tileOptions,fillabilityCache:this.fillabilityCache,allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,allowTerrainHalfTurn:this.rules.allowTerrainHalfTurn,allowTerrainMirror:this.rules.allowTerrainMirror})
        .filter((candidate)=>!conflictsWithForcedPlacement(candidate, frontier.forced, this.state.board.side));
      if (regular.length) return this._candidateGroups={regular,forced:frontier.forced,unresolved:frontier.unresolved};
      this.state.discarded.push(this.state.currentTile);
      this.state.currentTile=null;
      this._candidateGroups=null;
      this.nextTurn();
    }
    return {regular:[],forced:[],unresolved:[]};
  }
  placeTile(tile) { if(this.state.phase!=="placeTile") throw new Error("不正なタイル配置です。"); const regular=this.candidates().some((candidate)=>samePlacement(candidate,tile)); if(!regular) throw new Error("絶対禁則または形状マッチング規則のため配置できません。"); if(!isLegalPlacement(this.state.board,tile,{allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,allowTerrainHalfTurn:this.rules.allowTerrainHalfTurn})) throw new Error("不正なタイル配置です。"); const previous=this._structuralFrontier, confirmed=previous?.forced.find((placement)=>sameGeometry(placement,tile)); applyMatchingPatternDomains(this.state.board,tile); delete tile._inferenceStatus; this.state.currentTile=structuredClone(tile);this.state.board.add(tile);beginHistoryTurn(this.state,tile);this._candidateGroups=null; this._structuralFrontier=null; this._previousStructuralFrontier=previous?carryStructuralFrontier(previous,tile):null; this._structuralChangedTile=tile; this._changedTileAlreadyVirtual=Boolean(confirmed); this.collectVertexChips(tile);this.fillabilityCache=updateFillabilityCache(this.state.board,tile,this.tileOptions,this.fillabilityCache);this.state.phase="placeMeeple";const options=this.meepleOptions();if(!this.activePlayer.meeples||!options.length){this.finishTurn();return [];}return options; }
  meepleOptions() { if(this.state.phase!=="placeMeeple") return []; const tile=this.state.board.getTile(this.state.currentTile.id), options=[]; for(const type of ["city","road","field"]) (tile.featureGroups[type]||[]).forEach((_,index)=>{if(featureCanReceiveMeeple(this.state.board,this.state,tile,type,index))options.push({type,index});});if(tile.hasMonastery&&!this.state.meeples[`${tile.id}:monastery:0`])options.push({type:"monastery",index:0});return options; }
  placeMeeple(option) { if(this.state.phase!=="placeMeeple") throw new Error("ミープル配置フェーズではありません。"); const tile=this.state.board.getTile(this.state.currentTile.id);if(!this.activePlayer.meeples)throw new Error("ミープルが残っていません。");if(option.type!=="monastery"&&!featureCanReceiveMeeple(this.state.board,this.state,tile,option.type,option.index))throw new Error("その領域にはミープルを置けません。");this.state.meeples[option.type==="monastery"?`${tile.id}:monastery:0`:this.state.board.featureRef(tile,option.type,option.index)]=this.activePlayer.id;this.activePlayer.meeples--;this.finishTurn(); }
  skipMeeple() { if(this.state.phase!=="placeMeeple") throw new Error("ミープル配置フェーズではありません。"); this.finishTurn(); }
  redrawCurrentTile() {
    if (this.state.phase !== "placeTile") throw new Error("タイル配置前にだけ引き直せます。");
    const noRegular = !this.candidates().length;
    if (!noRegular && this.activePlayer.redrawUsed) throw new Error("引き直しは各プレイヤー1回までです。");
    const tile = this.state.currentTile;
    if (!tile) throw new Error("引き直すタイルがありません。");
    this.state.deck.push(tile.mirrored ? mirrorTile(tile) : tile);
    this.state.deck = shuffle(this.state.deck, this.random);
    if (!noRegular) this.activePlayer.redrawUsed = true;
    this.state.currentTile = null;
    this.nextTurn();
  }
  mirrorCurrentTile() {
    if (this.state.phase !== "placeTile") throw new Error("タイル配置前にだけ反転できます。");
    if (!this.rules.allowTerrainMirror && this.activePlayer.mirrorUsed) throw new Error("反転は各プレイヤー1回までです。");
    if (!this.state.currentTile) throw new Error("反転するタイルがありません。");
    this.state.currentTile = mirrorTile(this.state.currentTile);
    // 左右反転は地形カードの変換であり、辺記号の通常／180度パターンを
    // 片方へ固定してはならない。手札として再び両方を候補に戻す。
	resetUnplacedPlacementPatterns(this.state.currentTile, this.rules.allowVerticalMatchingPattern, this.rules.allowTerrainHalfTurn);
    this._candidateGroups=null;
    if (!this.rules.allowTerrainMirror) this.activePlayer.mirrorUsed = true;
  }
  collectVertexChips(tile) {
    const player = this.activePlayer;
    for (const [vertexId, point] of Object.entries(verticesFor(tile, this.state.board.side))) {
      const key = `${Math.round(point.x * 10000)}:${Math.round(point.y * 10000)}`;
      if (this.state.claimedVertices.includes(key) || !vertexIsFullyTiled(this.state.board, point)) continue;
      player.vertexChips++;
      this.state.claimedVertices.push(key);
      this.state.vertexChipEvents.push({ playerId: player.id, tileId: tile.id, vertexId });
    }
  }
  finishTurn() { captureHistoryMeeples(this.state); const tile=this.state.board.getTile(this.state.currentTile.id);for(const type of ["city","road"]) (tile.featureGroups[type]||[]).forEach((_,index)=>this.scoreIfComplete(tile,type,index));this.state.board.tiles.filter((candidate)=>candidate.hasMonastery).forEach((monastery)=>this.scoreIfComplete(monastery,"monastery",0));completeHistoryTurn(this.state);if(!this.state.deck.length){this.finishGame();return;}this.state.turn=(this.state.turn+1)%this.state.players.length;this.nextTurn(); }
  scoreIfComplete(tile,type,index) { if(!isComplete(this.state.board,tile,type,index))return;const key=type==="monastery"?`${tile.id}:monastery:0`:this.state.board.component(tile,type,index).key;if(this.state.scored.includes(key))return;this.state.scored.push(key);this.award(tile,type,index,scoreFeature(this.state.board,tile,type,index),{reason:"complete"}); }
  award(tile,type,index,points,{returnMeeples=type!=="field",reason="complete"}={}) { const component=type==="monastery"?null:type==="field"?this.state.board.fieldScoreComponent(tile,index):this.state.board.component(tile,type,index),refs=type==="monastery"?[`${tile.id}:monastery:0`]:component.features.map((item)=>this.state.board.featureRef(item.tile,type,item.index));const owners=refs.map((ref)=>this.state.meeples[ref]).filter(Boolean), counts=Object.fromEntries(this.state.players.map((player)=>[player.id,owners.filter((id)=>id===player.id).length])), highest=Math.max(0,...Object.values(counts));if(highest){this.state.players.filter((player)=>counts[player.id]===highest).forEach((player)=>{player.score+=points;this.state.scoreEvents.push({playerId:player.id,type,points,reason,tileId:tile.id});});if(returnMeeples)refs.forEach((ref)=>{const owner=this.state.meeples[ref];if(owner){this.state.players.find((player)=>player.id===owner).meeples++;delete this.state.meeples[ref];}});} }
  nextTurn() { while(this.state.deck.length){this.state.currentTile=this.state.deck.pop();resetUnplacedPlacementPatterns(this.state.currentTile,this.rules.allowVerticalMatchingPattern,this.rules.allowTerrainHalfTurn);this.state.phase="placeTile";this._candidateGroups=null;if(this.deferCandidateSearch)return;if(this.candidates().length)return;this.state.discarded.push(this.state.currentTile);this.state.currentTile=null;this._candidateGroups=null;}this.finishGame(); }
  finishGame() { if(this.state.finished)return;captureHistoryMeeples(this.state);completeHistoryTurn(this.state);this.state.finalMeeples={...this.state.meeples};this.state.board.tiles.forEach((tile)=>{for(const type of ["city","road"]) (tile.featureGroups[type]||[]).forEach((_,index)=>{const key=this.state.board.component(tile,type,index).key;if(!this.state.scored.includes(key)){this.state.scored.push(key);this.award(tile,type,index,scoreFeature(this.state.board,tile,type,index),{reason:"end"});}});if(tile.hasMonastery){const key=`${tile.id}:monastery:0`;if(!this.state.scored.includes(key)){this.state.scored.push(key);this.award(tile,"monastery",0,scoreFeature(this.state.board,tile,"monastery",0),{reason:"end"});}}if(this.fieldScoring)this.state.board.fieldScoreGroups(tile).forEach((_,index)=>{const key=this.state.board.fieldScoreComponent(tile,index).key;if(!this.state.scored.includes(key)){this.state.scored.push(key);this.award(tile,"field",index,scoreField(this.state.board,tile,index),{returnMeeples:false,reason:"end"});}});});this.state.finished=true;this.state.phase="finished"; }
}

function shuffle(items, random) { const result=[...items]; for(let index=result.length-1;index>0;index--){const swapIndex=Math.floor(random()*(index+1));[result[index],result[swapIndex]]=[result[swapIndex],result[index]];} return result; }
function initializeStartTilePatterns(tile, allowVerticalMatchingPattern) {
  tile.matchingPattern=allowVerticalMatchingPattern?null:"normal";
  tile.matchingPatternOptions=allowVerticalMatchingPattern?["normal","verticalInverse"]:["normal"];
  tile.terrainPattern="normal";
  tile.terrainPatternOptions=["normal"];
  delete tile.resolvedMatchingPatternDomains;
}
function resetUnplacedPlacementPatterns(tile, allowVerticalMatchingPattern, allowTerrainHalfTurn) {
  const matchingPattern=allowVerticalMatchingPattern?null:"normal";
  const matchingPatternOptions=allowVerticalMatchingPattern?["normal","verticalInverse"]:["normal"];
	const terrainPatternOptions=allowTerrainHalfTurn?["normal","halfTurn"]:["normal"];
  const changed=tile.matchingPattern!==matchingPattern
    || !Array.isArray(tile.matchingPatternOptions)
    || tile.matchingPatternOptions.length!==matchingPatternOptions.length
    || tile.matchingPatternOptions.some((pattern,index)=>pattern!==matchingPatternOptions[index])
		|| tile.terrainPattern!=="normal"
		|| !Array.isArray(tile.terrainPatternOptions)
		|| tile.terrainPatternOptions.length!==terrainPatternOptions.length
		|| tile.terrainPatternOptions.some((pattern,index)=>pattern!==terrainPatternOptions[index])
    || Boolean(tile.resolvedMatchingPatternDomains);
  tile.matchingPattern=matchingPattern;
  tile.matchingPatternOptions=matchingPatternOptions;
	tile.terrainPattern="normal";
	tile.terrainPatternOptions=terrainPatternOptions;
  delete tile.resolvedMatchingPatternDomains;
  return changed;
}
function samePlacement(left,right) {
  return sameGeometry(left,right)
    && (left.terrainPattern||"normal")===(right.terrainPattern||"normal")
    && Boolean(left.mirrored)===Boolean(right.mirrored);
}
function sameGeometry(left,right) {
  return left.shape===right.shape
    &&Math.abs(left.centerX-right.centerX)<1e-5
    &&Math.abs(left.centerY-right.centerY)<1e-5
    // 同じ向きでも候補生成経路によって -72° と 288° のように 2π 異なる
    // 表現になり得る。ここで別位置扱いにすると、既存の確定配置を仮想盤面へ
    // 二重追加して頂点型の探索を壊してしまう。
    &&sameRotation(left.rotation,right.rotation);
}
function sameRotation(left=0,right=0) {
  const full=Math.PI*2;
  const difference=((left-right+Math.PI)%full+full)%full-Math.PI;
  return Math.abs(difference)<1e-5;
}
function carryStructuralFrontier(frontier, placedTile) {
  const forced=frontier.forced.filter((placement)=>!sameGeometry(placement,placedTile));
  return {...frontier,forced,all:[...forced,...frontier.unresolved]};
}
function applyMatchingPatternDomains(board, tile) {
  for (const [id, patterns] of Object.entries(tile.resolvedMatchingPatternDomains || {})) {
    const neighbor=board.getTile(id);
    if (!neighbor) continue;
    neighbor.matchingPatternOptions=[...patterns];
    neighbor.matchingPattern=patterns.length===1?patterns[0]:null;
  }
  const patterns=tile.matchingPatternOptions || (tile.matchingPattern?[tile.matchingPattern]:[]);
  if (patterns.length) {
    tile.matchingPatternOptions=[...patterns];
    tile.matchingPattern=patterns.length===1?patterns[0]:null;
  }
  delete tile.resolvedMatchingPatternDomains;
}
function conflictsWithForcedPlacement(candidate, forced, side) {
  return forced.some((placement) => {
    if (structuralPositionKey(candidate) === structuralPositionKey(placement)) return false;
    const obstacle = new Board(side);
    obstacle.tiles = [placement];
    return obstacle.overlaps(candidate);
  });
}

import { Board } from "./Board.js";
import { createGameState } from "./GameState.js";
import { createPrototypeDeck, mirrorTile } from "./TileSet.js";
import { createFillabilityCache, featureCanReceiveMeeple, isLegalPlacement, placementCandidateGroups, placementCandidates, updateFillabilityCache } from "./Rules.js";
import { isComplete, scoreFeature, scoreField, vertexIsFullyTiled } from "./Scoring.js";
import { verticesFor } from "./Tile.js";
import { createPlayer } from "./Player.js";

export class GameEngine {
  constructor({ playerCount=2, meeples=7, side=120, random=Math.random, fieldScoring=true, deckType="standard", allowArrowOverride=true, rules={} }={}) { this.random=random; this.deckType=deckType; this.rules={allowArrowOverride:rules.allowArrowOverride ?? allowArrowOverride}; this._candidateGroups=null; const players=Array.from({length:playerCount},(_,index)=>createPlayer({id:`p${index+1}`,name:`Player ${index+1}`,meeples})); const deck=shuffle(createPrototypeDeck(random, deckType),random); this.tileOptions=[...deck.map((tile)=>structuredClone(tile)), ...deck.map((tile)=>mirrorTile(tile))]; this.state=createGameState({players,deck}); this.state.board=new Board(side); this.fillabilityCache=new Map(); this.fieldScoring=fieldScoring; this.start(); }
  start() { const start=this.state.deck.pop(); start.centerX=0;start.centerY=0;start.rotation=0;start.arrowPattern=null;this.state.board.add(start);this.fillabilityCache=createFillabilityCache(this.state.board,this.tileOptions);this.nextTurn(); }
  get activePlayer() { return this.state.players[this.state.turn]; }
  candidateGroups() { if(this.state.phase!=="placeTile") return {regular:[],relative:[],relativeBlocked:[],arrowOverride:[]}; if(this._candidateGroups) return this._candidateGroups; return this._candidateGroups=placementCandidateGroups(this.state.board,this.state.currentTile,{tileOptions:this.tileOptions,fillabilityCache:this.fillabilityCache,allowRelativePlacement:!this.activePlayer.relativePlacementUsed,allowArrowOverride:this.rules.allowArrowOverride}); }
  candidates() { return this.candidateGroups().regular; }
  relativeCandidates() { return this.candidateGroups().relative; }
  arrowOverrideCandidates() { return this.candidateGroups().arrowOverride; }
  placeTile(tile,{ignoreArrowMatching=false}={}) { if(this.state.phase!=="placeTile") throw new Error("不正なタイル配置です。"); const groups=this.candidateGroups(), regular=groups.regular.some((candidate)=>samePlacement(candidate,tile)), relative=groups.relative.some((candidate)=>samePlacement(candidate,tile)), override=groups.arrowOverride.some((candidate)=>samePlacement(candidate,tile)), permittedOverride=override&&ignoreArrowMatching&&this.rules.allowArrowOverride; if(!regular&&!relative&&!permittedOverride) throw new Error("絶対禁則配置のため配置できません。"); if(!isLegalPlacement(this.state.board,tile,{ignoreArrowMatching:permittedOverride})) throw new Error("不正なタイル配置です。"); if(relative&&!regular)this.activePlayer.relativePlacementUsed=true; for(const [id, pattern] of Object.entries(tile.resolvedArrowPatterns || {})){const neighbor=this.state.board.getTile(id);if(neighbor)neighbor.arrowPattern=pattern;} delete tile.resolvedArrowPatterns; delete tile._ignoresArrowMatching; this.state.currentTile=structuredClone(tile);this.state.board.add(tile);this._candidateGroups=null;this.collectVertexChips(tile);this.fillabilityCache=updateFillabilityCache(this.state.board,tile,this.tileOptions,this.fillabilityCache);this.state.phase="placeMeeple";const options=this.meepleOptions();if(!this.activePlayer.meeples||!options.length){this.finishTurn();return [];}return options; }
  meepleOptions() { if(this.state.phase!=="placeMeeple") return []; const tile=this.state.board.getTile(this.state.currentTile.id), options=[]; for(const type of ["city","road","field"]) (tile.featureGroups[type]||[]).forEach((_,index)=>{if(featureCanReceiveMeeple(this.state.board,this.state,tile,type,index))options.push({type,index});});if(tile.hasMonastery&&!this.state.meeples[`${tile.id}:monastery:0`])options.push({type:"monastery",index:0});return options; }
  placeMeeple(option) { if(this.state.phase!=="placeMeeple") throw new Error("ミープル配置フェーズではありません。"); const tile=this.state.board.getTile(this.state.currentTile.id);if(!this.activePlayer.meeples)throw new Error("ミープルが残っていません。");if(option.type!=="monastery"&&!featureCanReceiveMeeple(this.state.board,this.state,tile,option.type,option.index))throw new Error("その領域にはミープルを置けません。");this.state.meeples[option.type==="monastery"?`${tile.id}:monastery:0`:this.state.board.featureRef(tile,option.type,option.index)]=this.activePlayer.id;this.activePlayer.meeples--;this.finishTurn(); }
  skipMeeple() { if(this.state.phase!=="placeMeeple") throw new Error("ミープル配置フェーズではありません。"); this.finishTurn(); }
  redrawCurrentTile() {
    if (this.state.phase !== "placeTile") throw new Error("タイル配置前にだけ引き直せます。");
    const groups = this.candidateGroups(), noRegular = !groups.regular.length;
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
    if (this.activePlayer.mirrorUsed) throw new Error("反転は各プレイヤー1回までです。");
    if (!this.state.currentTile) throw new Error("反転するタイルがありません。");
    this.state.currentTile = mirrorTile(this.state.currentTile); this._candidateGroups=null;
    this.activePlayer.mirrorUsed = true;
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
  finishTurn() { const tile=this.state.board.getTile(this.state.currentTile.id);for(const type of ["city","road"]) (tile.featureGroups[type]||[]).forEach((_,index)=>this.scoreIfComplete(tile,type,index));this.state.board.tiles.filter((candidate)=>candidate.hasMonastery).forEach((monastery)=>this.scoreIfComplete(monastery,"monastery",0));if(!this.state.deck.length){this.finishGame();return;}this.state.turn=(this.state.turn+1)%this.state.players.length;this.nextTurn(); }
  scoreIfComplete(tile,type,index) { if(!isComplete(this.state.board,tile,type,index))return;const key=type==="monastery"?`${tile.id}:monastery:0`:this.state.board.component(tile,type,index).key;if(this.state.scored.includes(key))return;this.state.scored.push(key);this.award(tile,type,index,scoreFeature(this.state.board,tile,type,index),{reason:"complete"}); }
  award(tile,type,index,points,{returnMeeples=type!=="field",reason="complete"}={}) { const component=type==="monastery"?null:type==="field"?this.state.board.fieldScoreComponent(tile,index):this.state.board.component(tile,type,index),refs=type==="monastery"?[`${tile.id}:monastery:0`]:component.features.map((item)=>this.state.board.featureRef(item.tile,type,item.index));const owners=refs.map((ref)=>this.state.meeples[ref]).filter(Boolean), counts=Object.fromEntries(this.state.players.map((player)=>[player.id,owners.filter((id)=>id===player.id).length])), highest=Math.max(0,...Object.values(counts));if(highest){this.state.players.filter((player)=>counts[player.id]===highest).forEach((player)=>{player.score+=points;this.state.scoreEvents.push({playerId:player.id,type,points,reason,tileId:tile.id});});if(returnMeeples)refs.forEach((ref)=>{const owner=this.state.meeples[ref];if(owner){this.state.players.find((player)=>player.id===owner).meeples++;delete this.state.meeples[ref];}});} }
  nextTurn() { while(this.state.deck.length){this.state.currentTile=this.state.deck.pop();this.state.phase="placeTile";this._candidateGroups=null;const groups=this.candidateGroups();if(groups.regular.length||groups.relative.length||groups.relativeBlocked.length||groups.arrowOverride.length)return;this.state.discarded.push(this.state.currentTile);this.state.currentTile=null;this._candidateGroups=null;}this.finishGame(); }
  finishGame() { if(this.state.finished)return;this.state.board.tiles.forEach((tile)=>{for(const type of ["city","road"]) (tile.featureGroups[type]||[]).forEach((_,index)=>{const key=this.state.board.component(tile,type,index).key;if(!this.state.scored.includes(key)){this.state.scored.push(key);this.award(tile,type,index,scoreFeature(this.state.board,tile,type,index),{reason:"end"});}});if(tile.hasMonastery){const key=`${tile.id}:monastery:0`;if(!this.state.scored.includes(key)){this.state.scored.push(key);this.award(tile,"monastery",0,scoreFeature(this.state.board,tile,"monastery",0),{reason:"end"});}}if(this.fieldScoring)this.state.board.fieldScoreGroups(tile).forEach((_,index)=>{const key=this.state.board.fieldScoreComponent(tile,index).key;if(!this.state.scored.includes(key)){this.state.scored.push(key);this.award(tile,"field",index,scoreField(this.state.board,tile,index),{returnMeeples:false,reason:"end"});}});});this.state.finished=true;this.state.phase="finished"; }
}

function shuffle(items, random) { const result=[...items]; for(let index=result.length-1;index>0;index--){const swapIndex=Math.floor(random()*(index+1));[result[index],result[swapIndex]]=[result[swapIndex],result[index]];} return result; }
function samePlacement(left,right) { return Math.abs(left.centerX-right.centerX)<1e-5&&Math.abs(left.centerY-right.centerY)<1e-5&&Math.abs(left.rotation-right.rotation)<1e-5; }

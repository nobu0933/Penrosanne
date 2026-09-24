import { Board } from "./Board.js";
import { createGameState } from "./GameState.js";
import { createPrototypeDeck, mirrorTile } from "./TileSet.js";
import { createFillabilityCache, featureCanReceiveMeeple, isLegalPlacement, placementCandidates, structuralPlacementFrontier, structuralPlacementFrontierProgressively, structuralPositionKey, updateFillabilityCache } from "./Rules.js";
import { isComplete, scoreFeature, scoreField, titleAwards, TITLE_DEFINITIONS, vertexIsFullyTiled } from "./Scoring.js";
import { verticesFor } from "./Tile.js";
import { createPlayer } from "./Player.js";
import { handTileId, candidatesForHandTile } from './HandCandidates.js';

import { beginHistoryTurn, captureHistoryMeeples, completeHistoryTurn } from "./TurnHistory.js";

export class GameEngine {
  constructor({ playerCount=2, meeples=7, side=120, random=Math.random, fieldScoring=true, deckType="standard", rules={}, titles={}, deferCandidateSearch=false, handMode='single' }={}) {
    this.random=random;
    this.deckType=deckType;
    this.rules={allowVerticalMatchingPattern:rules.allowVerticalMatchingPattern ?? true,allowTerrainHalfTurn:rules.allowTerrainHalfTurn ?? true,allowTerrainMirror:rules.allowTerrainMirror ?? false,ignoreMatchingRules:rules.ignoreMatchingRules ?? false};
    this.titleRules=Object.fromEntries(TITLE_DEFINITIONS.map(({id})=>[id,Boolean(titles[id])]));
    this.deferCandidateSearch=deferCandidateSearch;
    this._handCandidateCache=new Map();
    this._candidateGroups=null; this._structuralFrontier=null; this._previousStructuralFrontier=null; this._structuralChangedTile=null; this._changedTileAlreadyVirtual=false;
    const players=Array.from({length:playerCount},(_,index)=>createPlayer({id:`p${index+1}`,name:`Player ${index+1}`,meeples}));
    const deck=shuffle(createPrototypeDeck(random, deckType),random);
    this.tileOptions=[...deck.map((tile)=>structuredClone(tile)), ...deck.map((tile)=>mirrorTile(tile))];
    this.state=createGameState({players,deck,handMode:handMode==='private-city-planning'?handMode:'single'});
    this.state.board=new Board(side);
    this.fillabilityCache=new Map();
    this.fieldScoring=fieldScoring;
    this.start();
  }
  start() {
    const start=this.state.deck.pop(); start.centerX=0;start.centerY=0;start.rotation=0;
    initializeStartTilePatterns(start,this.rules.allowVerticalMatchingPattern);
    this.state.board.add(start);
    this.fillabilityCache=createFillabilityCache(this.state.board,this.tileOptions);
    if (this.privatePlanning) for(let round=0;round<3;round++) for(const player of this.state.players) this.drawIntoHand(player.id);
    this.nextTurn();
  }
  get activePlayer() { return this.state.players[this.state.turn]; }
  get privatePlanning() { return this.state.handMode==='private-city-planning'; }
  handForPlayer(playerId=this.activePlayer.id) { return this.state.hands[playerId] || []; }
  drawIntoHand(playerId) {
    const tile=this.state.deck.pop();
    if (!tile) return null;
    resetUnplacedPlacementPatterns(tile,this.rules.allowVerticalMatchingPattern,this.rules.allowTerrainHalfTurn);
    this.state.hands[playerId].push(tile);
    return tile;
  }
  selectHandTile(tileId) {
    if (!this.privatePlanning || this.state.phase!=='placeTile') throw new Error('手札を選択できません。');
    const tile=this.handForPlayer().find(tile=>tile.id===tileId);
    if (!tile) throw new Error('自分の手札から選んでください。');
    this.state.currentTile=tile;
    return tile;
  }
  candidatesForTile(tileId) { return candidatesForHandTile(this.candidates(),tileId); }
  handCandidates(tile, frontier) {
    if (resetUnplacedPlacementPatterns(tile,this.rules.allowVerticalMatchingPattern,this.rules.allowTerrainHalfTurn)) this._handCandidateCache.delete(tile.id);
    if (this._handCandidateCache.has(tile.id)) return this._handCandidateCache.get(tile.id);
    const regular=placementCandidates(this.state.board,tile,{tileOptions:this.tileOptions,fillabilityCache:this.fillabilityCache,...this.rules})
      .filter(candidate=>this.rules.ignoreMatchingRules || !conflictsWithForcedPlacement(candidate,frontier.forced,this.state.board.side))
      .map(candidate=>({...candidate,_handTileId:tile.id}));
    this._handCandidateCache.set(tile.id,regular);
    return regular;
  }
  privateCandidateGroups(frontier=this.structuralFrontier()) {
    if (this._candidateGroups) return this._candidateGroups;
    const regular=this.handForPlayer().flatMap(tile=>this.handCandidates(tile,frontier));
    return this._candidateGroups={regular,forced:frontier.forced,unresolved:frontier.unresolved};
  }
  structuralFrontier() {
    if (this.rules.ignoreMatchingRules) return this._structuralFrontier = { forced:[], unresolved:[], all:[], domainCache:new Map(), truncated:false };
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
    if (this.rules.ignoreMatchingRules) return this._structuralFrontier = { forced:[], unresolved:[], all:[], domainCache:new Map(), truncated:false };
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
    if(this.privatePlanning) return this.privateCandidateGroups();
    // 手札はまだ盤面へ置かれていないため、以前の候補探索で狭めたパターンを
    // 持ち越さない。これにより、表示済みの手札でも辺記号だけを180度回転した
    // パターンを必ず再評価する。
	if (resetUnplacedPlacementPatterns(this.state.currentTile, this.rules.allowVerticalMatchingPattern, this.rules.allowTerrainHalfTurn)) this._candidateGroups=null;
    if(this._candidateGroups) return this._candidateGroups;
	if (this.rules.ignoreMatchingRules) {
		const regular=placementCandidates(this.state.board,this.state.currentTile,{tileOptions:this.tileOptions,fillabilityCache:this.fillabilityCache,allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,allowTerrainHalfTurn:this.rules.allowTerrainHalfTurn,allowTerrainMirror:this.rules.allowTerrainMirror,ignoreMatchingRules:true});
		return this._candidateGroups={regular,forced:[],unresolved:[]};
	}
    const frontier=this.structuralFrontier(), forced=frontier.forced;
	const regular=placementCandidates(this.state.board,this.state.currentTile,{tileOptions:this.tileOptions,fillabilityCache:this.fillabilityCache,allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,allowTerrainHalfTurn:this.rules.allowTerrainHalfTurn,allowTerrainMirror:this.rules.allowTerrainMirror})
      .filter((candidate)=>!conflictsWithForcedPlacement(candidate, forced, this.state.board.side));
    return this._candidateGroups={regular,forced,unresolved:frontier.unresolved};
  }
  candidates() { return this.candidateGroups().regular; }
  async candidateGroupsProgressively({ onForced, yieldControl } = {}) {
    if (this.privatePlanning) {
      let forcedCount=0;
      while (this.state.phase==='placeTile') {
        const frontier=await this.structuralFrontierProgressively({onForced:tile=>{forcedCount++;onForced?.(tile);},yieldControl});
        if (!this._candidateGroups) {
          const regular=[];
          for (const tile of this.handForPlayer()) {
            regular.push(...this.handCandidates(tile,frontier));
            await yieldControl?.({forcedCount});
          }
          this._candidateGroups={regular,forced:frontier.forced,unresolved:frontier.unresolved};
        }
        if (this._candidateGroups.regular.length || this.state.deck.length) return this._candidateGroups;
        this.passTurn();
      }
      return {regular:[],forced:[],unresolved:[]};
    }
    while (this.state.phase === "placeTile" && this.state.currentTile) {
      if (resetUnplacedPlacementPatterns(this.state.currentTile, this.rules.allowVerticalMatchingPattern, this.rules.allowTerrainHalfTurn)) this._candidateGroups=null;
      if (this._candidateGroups) return this._candidateGroups;
      const frontier = await this.structuralFrontierProgressively({ onForced, yieldControl });
      if (this.rules.ignoreMatchingRules) {
		const groups=this.candidateGroups();
		if (groups.regular.length) return groups;
		this.state.discarded.push(this.state.currentTile); this.state.currentTile=null; this._candidateGroups=null; this.nextTurn();
		continue;
	  }
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
  placeTile(tile) {
    if(this.state.phase!=="placeTile") throw new Error("不正なタイル配置です。");
    const sourceId=handTileId(tile);
    const regular=this.candidates().find(candidate=>samePlacement(candidate,tile) && (!this.privatePlanning || handTileId(candidate)===sourceId));
    if(!regular) throw new Error("絶対禁則または形状マッチング規則のため配置できません。");
    // 選んだ手札の検証済み候補を使い、別の手札や任意の地形で確定させない。
    if(this.privatePlanning) {
      if(!this.handForPlayer().some(item=>item.id===sourceId)) throw new Error('自分の手札から選んでください。');
      tile=structuredClone(regular);
    }
    if(!isLegalPlacement(this.state.board,tile,{allowVerticalMatchingPattern:this.rules.allowVerticalMatchingPattern,allowTerrainHalfTurn:this.rules.allowTerrainHalfTurn,ignoreMatchingRules:this.rules.ignoreMatchingRules})) throw new Error("不正なタイル配置です。");
    const previous=this.rules.ignoreMatchingRules?null:this._structuralFrontier, confirmed=previous?.forced.find(placement=>sameGeometry(placement,tile));
    if(!this.rules.ignoreMatchingRules)applyMatchingPatternDomains(this.state.board,tile);
    if(this.privatePlanning) {
      this.state.hands[this.activePlayer.id]=this.handForPlayer().filter(item=>item.id!==sourceId);
      this.state.consecutivePasses=0;
    }
    delete tile._inferenceStatus; delete tile._handTileId;
    this.state.currentTile=structuredClone(tile);this.state.board.add(tile);beginHistoryTurn(this.state,tile);
    this._candidateGroups=null;this._handCandidateCache.clear();this._structuralFrontier=null;
    this._previousStructuralFrontier=previous?carryStructuralFrontier(previous,tile):null;
    this._structuralChangedTile=tile;this._changedTileAlreadyVirtual=Boolean(confirmed);
    this.collectVertexChips(tile);this.fillabilityCache=updateFillabilityCache(this.state.board,tile,this.tileOptions,this.fillabilityCache);
    this.state.phase="placeMeeple";
    const options=this.meepleOptions();
    if(!this.activePlayer.meeples||!options.length){this.finishTurn();return [];}
    return options;
  }
  meepleOptions() { if(this.state.phase!=="placeMeeple") return []; const tile=this.state.board.getTile(this.state.currentTile.id), options=[]; for(const type of (this.fieldScoring?["city","road","field"]:["city","road"])) (tile.featureGroups[type]||[]).forEach((_,index)=>{if(featureCanReceiveMeeple(this.state.board,this.state,tile,type,index))options.push({type,index});});if(tile.hasMonastery&&!this.state.meeples[`${tile.id}:monastery:0`])options.push({type:"monastery",index:0});return options; }
  placeMeeple(option) { if(this.state.phase!=="placeMeeple") throw new Error("ミープル配置フェーズではありません。"); const tile=this.state.board.getTile(this.state.currentTile.id);if(!this.activePlayer.meeples)throw new Error("ミープルが残っていません。");if(option.type==="field"&&!this.fieldScoring)throw new Error("この対局では草原にミープルを置けません。");if(option.type!=="monastery"&&!featureCanReceiveMeeple(this.state.board,this.state,tile,option.type,option.index))throw new Error("その領域にはミープルを置けません。");this.state.meeples[option.type==="monastery"?`${tile.id}:monastery:0`:this.state.board.featureRef(tile,option.type,option.index)]=this.activePlayer.id;this.activePlayer.meeples--;this.finishTurn(); }
  skipMeeple() { if(this.state.phase!=="placeMeeple") throw new Error("ミープル配置フェーズではありません。"); this.finishTurn(); }
  redrawCurrentTile(tileId=this.state.currentTile?.id) {
    if (this.state.phase !== "placeTile") throw new Error("タイル配置前にだけ引き直せます。");
    const tile = this.privatePlanning ? this.handForPlayer().find(tile=>tile.id===tileId) : this.state.currentTile;
    if (!tile) throw new Error("引き直すタイルがありません。");
    if (!this.state.deck.length) throw new Error("山札が空のため引き直せません。");
    const noRegular = !this.candidates().length;
    if (!noRegular && this.activePlayer.redrawUsed) throw new Error("引き直しは各プレイヤー1回までです。");
    this.state.events.push({type:'redraw',playerId:this.activePlayer.id,turnNumber:this.state.turnHistory.length+1,tileId:tile.id});
    this.state.discarded.push(tile);
    if (!noRegular) this.activePlayer.redrawUsed = true;
    if (this.privatePlanning) {
      const hand=this.handForPlayer(), index=hand.indexOf(tile);
      const replacement=this.state.deck.pop();
      resetUnplacedPlacementPatterns(replacement,this.rules.allowVerticalMatchingPattern,this.rules.allowTerrainHalfTurn);
      hand[index]=replacement;
      this._handCandidateCache.delete(tile.id);
      this._candidateGroups=null;
      this.state.currentTile=replacement;
      return;
    }
    this.state.currentTile = null;
    this.nextTurn();
  }
  collectVertexChips(tile) {
    const player = this.activePlayer;
    for (const [vertexId, point] of Object.entries(verticesFor(tile, this.state.board.side))) {
      const key = `${Math.round(point.x * 10000)}:${Math.round(point.y * 10000)}`;
      if (this.state.countedVertices.includes(key) || !vertexIsFullyTiled(this.state.board, point)) continue;
      player.vertexCompletions++;
      this.state.countedVertices.push(key);
      this.state.vertexCompletionEvents.push({ playerId: player.id, tileId: tile.id, vertexId });
    }
  }
  finishTurn() {
    captureHistoryMeeples(this.state);
    const tile=this.state.board.getTile(this.state.currentTile.id);
    for(const type of ["city","road"]) (tile.featureGroups[type]||[]).forEach((_,index)=>this.scoreIfComplete(tile,type,index));
    this.state.board.tiles.filter(candidate=>candidate.hasMonastery).forEach(monastery=>this.scoreIfComplete(monastery,"monastery",0));
    completeHistoryTurn(this.state);
    if(this.privatePlanning) this.drawIntoHand(this.activePlayer.id);
    else if(!this.state.deck.length){this.finishGame();return;}
    this.state.turn=(this.state.turn+1)%this.state.players.length;
    this.nextTurn();
  }
  scoreIfComplete(tile,type,index) {
    if (!isComplete(this.state.board,tile,type,index)) return;
    const key=type==="monastery"?`${tile.id}:monastery:0`:this.state.board.component(tile,type,index).key;
    if (this.state.scored.includes(key)) return;
    this.state.scored.push(key);
    const winners=this.award(tile,type,index,scoreFeature(this.state.board,tile,type,index),{reason:"complete"});
    // 完成させた本人が得点せず、他プレイヤーが得点した地形だけを支援と数える。
    if (winners.length && !winners.includes(this.activePlayer.id)) this.activePlayer.supportCount++;
  }
  award(tile,type,index,points,{returnMeeples=type!=="field",reason="complete"}={}) {
    const component=type==="monastery"?null:type==="field"?this.state.board.fieldScoreComponent(tile,index):this.state.board.component(tile,type,index);
    const refs=type==="monastery"?[`${tile.id}:monastery:0`]:component.features.map((item)=>this.state.board.featureRef(item.tile,type,item.index));
    const owners=refs.map((ref)=>this.state.meeples[ref]).filter(Boolean);
    const counts=Object.fromEntries(this.state.players.map((player)=>[player.id,owners.filter((id)=>id===player.id).length]));
    const highest=Math.max(0,...Object.values(counts));
    if (!highest) return [];
    const winners=this.state.players.filter((player)=>counts[player.id]===highest);
    for (const player of winners) {
      player.score+=points;
      this.state.scoreEvents.push({playerId:player.id,type,points,reason,tileId:tile.id});
    }
    if (returnMeeples) for (const ref of refs) {
      const owner=this.state.meeples[ref];
      if (!owner) continue;
      this.state.players.find((player)=>player.id===owner).meeples++;
      delete this.state.meeples[ref];
    }
    return winners.map((player)=>player.id);
  }
  nextTurn() {
    if (this.privatePlanning) {
      this.beginHandTurn();
      if (!this.deferCandidateSearch) while(this.state.phase==='placeTile' && !this.state.deck.length && !this.candidates().length) this.passTurn();
      return;
    }
    while(this.state.deck.length){this.state.currentTile=this.state.deck.pop();resetUnplacedPlacementPatterns(this.state.currentTile,this.rules.allowVerticalMatchingPattern,this.rules.allowTerrainHalfTurn);this.state.phase="placeTile";this._candidateGroups=null;if(this.deferCandidateSearch)return;if(this.candidates().length)return;this.state.discarded.push(this.state.currentTile);this.state.currentTile=null;this._candidateGroups=null;}
    this.finishGame();
  }
  beginHandTurn() {
    this._candidateGroups=null;
    this.state.currentTile=this.handForPlayer()[0] || null;
    if(!this.state.deck.length && this.state.players.every(player=>!this.handForPlayer(player.id).length)) { this.finishGame(); return; }
    this.state.phase='placeTile';
  }
  passTurn() {
    if(!this.privatePlanning || this.state.phase!=='placeTile' || this.state.deck.length || this.candidates().length) throw new Error('この手番はパスできません。');
    this.state.events.push({type:'pass',playerId:this.activePlayer.id,turnNumber:this.state.turnHistory.length+1});
    this.state.consecutivePasses++;
    if(this.state.consecutivePasses>=this.state.players.length) { this.finishGame(); return; }
    this.state.turn=(this.state.turn+1)%this.state.players.length;
    this.beginHandTurn();
  }
  finishGame() {
    if (this.state.finished) return;
    captureHistoryMeeples(this.state);
    completeHistoryTurn(this.state);
    this.state.finalMeeples={...this.state.meeples};
    this.state.board.tiles.forEach((tile)=>{
      for (const type of ["city","road"]) (tile.featureGroups[type]||[]).forEach((_,index)=>{
        const key=this.state.board.component(tile,type,index).key;
        if (this.state.scored.includes(key)) return;
        this.state.scored.push(key);
        this.award(tile,type,index,scoreFeature(this.state.board,tile,type,index),{returnMeeples:false,reason:"end"});
      });
      if (tile.hasMonastery) {
        const key=`${tile.id}:monastery:0`;
        if (!this.state.scored.includes(key)) {
          this.state.scored.push(key);
          this.award(tile,"monastery",0,scoreFeature(this.state.board,tile,"monastery",0),{returnMeeples:false,reason:"end"});
        }
      }
      if (this.fieldScoring) this.state.board.fieldScoreGroups(tile).forEach((_,index)=>{
        const key=this.state.board.fieldScoreComponent(tile,index).key;
        if (this.state.scored.includes(key)) return;
        this.state.scored.push(key);
        this.award(tile,"field",index,scoreField(this.state.board,tile,index),{returnMeeples:false,reason:"end"});
      });
    });
    this.state.titleAwards=titleAwards(this.state,this.titleRules);
    for (const award of this.state.titleAwards) {
      this.state.players.find((player)=>player.id===award.playerId).score+=award.points;
      this.state.scoreEvents.push({playerId:award.playerId,type:'title',titleId:award.titleId,points:award.points,reason:'title'});
    }
    this.state.finished=true;
    this.state.phase="finished";
  }
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

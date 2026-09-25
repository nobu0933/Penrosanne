import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { Board } from '../src/game/Board.js';
import { createTile, edgeNames } from '../src/game/Tile.js';
import { createPrototypeDeck } from '../src/game/TileSet.js';
import { isLegalPlacement } from '../src/game/Rules.js';
import { handTileId, candidatesForHandTile, uniqueCandidatePositions, handChoicesAtPosition } from '../src/game/HandCandidates.js';

const random=()=>.42;
function terrainTile(id, terrains=['F','F','F','F']) {
  const names=edgeNames('fat'), byType=type=>names.filter((_,i)=>terrains[i]===type);
  return createTile({shape:'fat',edgeTerrain:Object.fromEntries(names.map((name,i)=>[name,terrains[i]])),featureGroups:{city:byType('C').length?[byType('C')]:[],road:[],field:byType('F').length?[byType('F')]:[]}},id);
}
function fixture(hands,deck=[]) {
  const game=new GameEngine({random,playerCount:hands.length,handMode:'private-city-planning',deferCandidateSearch:true,rules:{ignoreMatchingRules:true,allowTerrainHalfTurn:true,allowTerrainMirror:true}});
  game.state.board=new Board(120); game.state.board.add(terrainTile('start'));
  game.state.deck=deck; game.state.discarded=[];
  game.state.hands=Object.fromEntries(game.state.players.map((p,i)=>[p.id,hands[i]]));
  game._structuralFrontier=null; game._candidateGroups=null; game._handCandidateCache.clear();
  game.nextTurn();
  return game;
}
function finishPlacement(game,candidate) {
  game.placeTile(candidate);
  if(game.state.phase==='placeMeeple') game.skipMeeple();
}

test('設定したプレイヤー名を開始時のプレイヤーへ反映し、最大10文字に制限する',()=>{
  const game=new GameEngine({random,playerCount:3,playerNames:['あいうえおか','abcdefghijk',''],deferCandidateSearch:true});
  assert.deepEqual(game.state.players.map(player=>player.name),['あいうえおか','abcdefghij','Player 3']);
});

test('2〜4人に3枚ずつ配り、手札と山札と開始タイルの合計が元のデッキと一致する',()=>{
  for(const count of [2,3,4]) {
    const game=new GameEngine({random,playerCount:count,handMode:'private-city-planning',deferCandidateSearch:true});
    assert.deepEqual(Object.values(game.state.hands).map(hand=>hand.length),Array(count).fill(3));
    const tiles=[...game.state.deck,...Object.values(game.state.hands).flat(),...game.state.board.tiles];
    assert.equal(tiles.length,createPrototypeDeck(random).length);
    assert.equal(new Set(tiles.map(tile=>tile.id)).size,tiles.length);
    assert.equal(game.state.currentTile,game.handForPlayer()[0]);
  }
});

test('3枚の候補は既存の1枚用判定の和集合になり、通常の辺・地形ルールを守る',async()=>{
  const options={random,deferCandidateSearch:true,rules:{allowTerrainMirror:true,allowTerrainHalfTurn:true}};
  const game=new GameEngine({...options,handMode:'private-city-planning'}), single=new GameEngine(options);
  const groups=await game.candidateGroupsProgressively();
  const key=t=>JSON.stringify([t.centerX,t.centerY,t.rotation,t.terrainPattern,t.mirrored||false,t.edgeTerrain]);
  for(const tile of game.handForPlayer()) {
    single.state.currentTile=structuredClone(tile); single._candidateGroups=null;
    const actual=game.candidatesForTile(tile.id);
    assert.deepEqual(actual.map(key).sort(),single.candidates().map(key).sort());
    assert.ok(actual.every(candidate=>isLegalPlacement(game.state.board,candidate)));
  }
  assert.equal(groups.regular.length,game.handForPlayer().reduce((n,t)=>n+game.candidatesForTile(t.id).length,0));
});

test('選択した手札だけを配置し、ミープル処理後に1枚補充して次の手番へ進む',()=>{
  const game=fixture([[terrainTile('one'),terrainTile('two'),terrainTile('three')],[terrainTile('other')]], [terrainTile('refill')]);
  game.selectHandTile('two');
  assert.throws(()=>game.selectHandTile('other'),/自分の手札/);
  const candidate=game.candidatesForTile('two').find(t=>t.mirrored && t.terrainPattern==='halfTurn');
  assert.ok(candidate,'反転と地形回転の組合せも候補に含める');
  assert.throws(()=>game.placeTile({...candidate,_handTileId:'other'}),/配置できません/);
  game.placeTile(candidate);
  assert.deepEqual(game.handForPlayer('p1').map(t=>t.id),['one','three']);
  assert.equal(game.state.deck.length,1);
  assert.equal(game.state.phase,'placeMeeple');
  game.skipMeeple();
  assert.deepEqual(game.handForPlayer('p1').map(t=>t.id),['one','three','refill']);
  assert.equal(game.state.turn,1);
  assert.equal(game.state.finished,false);
  assert.equal(game.state.turnHistory.length,1);
  assert.equal(game.state.turnHistory[0].tileId,'two-mirror');
});

test('引き直しは任意の1枚だけを破棄し、手札を3枚に保ち、手番を進めない',()=>{
  const game=fixture([[terrainTile('one'),terrainTile('two'),terrainTile('three')],[terrainTile('other')]], [terrainTile('later'),terrainTile('replacement')]);
  game.redrawCurrentTile('two');
  assert.deepEqual(game.handForPlayer().map(t=>t.id),['one','replacement','three']);
  assert.deepEqual(game.state.discarded.map(t=>t.id),['two']);
  assert.deepEqual(game.state.deck.map(t=>t.id),['later']);
  assert.equal(game.activePlayer.redrawUsed,true);
  assert.equal(game.state.turn,0);
  assert.throws(()=>game.redrawCurrentTile('one'),/1回まで/);
});

test('置けない手札は自動破棄せず、全手札を置けない間だけ何度でも無料引き直しできる',async()=>{
  const city=id=>terrainTile(id,['C','C','C','C']);
  const game=fixture([[city('one'),city('two'),city('three')],[terrainTile('other')]], [terrainTile('playable'),city('replacement')]);
  assert.equal((await game.candidateGroupsProgressively()).regular.length,0);
  assert.deepEqual(game.handForPlayer().map(t=>t.id),['one','two','three']);
  assert.equal(game.state.discarded.length,0);
  assert.throws(()=>game.passTurn(),/パスできません/);
  game.redrawCurrentTile('two');
  assert.equal(game.activePlayer.redrawUsed,false);
  assert.equal(game.candidates().length,0);
  game.activePlayer.redrawUsed=true;
  game.redrawCurrentTile('replacement');
  assert.ok(game.candidates().length>0);
  assert.deepEqual(game.handForPlayer().map(t=>t.id),['one','playable','three']);
  assert.deepEqual(game.state.discarded.map(t=>t.id),['two','replacement']);
  assert.equal(game.activePlayer.redrawUsed,true);
  assert.throws(()=>game.redrawCurrentTile('one'),/山札が空/);
});

test('1枚でも置ける手札があれば置けない別の手札の引き直しにも権利を使う',()=>{
  const game=fixture([[terrainTile('playable'),terrainTile('blocked',['C','C','C','C'])],[terrainTile('other')]], [terrainTile('replacement')]);
  assert.equal(game.candidatesForTile('blocked').length,0);
  game.redrawCurrentTile('blocked');
  assert.equal(game.activePlayer.redrawUsed,true);
});

test('山札が空で置けないプレイヤーはパスし、他プレイヤーの配置後は再び置ける',async()=>{
  const game=fixture([[terrainTile('city',['C','C','C','C'])],[terrainTile('bridge',['C','F','F','F'])]]);
  const groups=await game.candidateGroupsProgressively();
  assert.equal(game.state.turn,1);
  assert.equal(game.state.consecutivePasses,1);
  assert.equal(game.handForPlayer('p1')[0].id,'city');
  finishPlacement(game,groups.regular[0]);
  assert.equal(game.state.turn,0);
  assert.equal(game.state.consecutivePasses,0);
  assert.ok((await game.candidateGroupsProgressively()).regular.length>0);
  finishPlacement(game,game.candidates()[0]);
  assert.equal(game.state.finished,true);
  assert.equal(game.state.turnHistory.length,2);
});

test('山札が空でも手札があれば続行し、手札が空のプレイヤーはパスする',async()=>{
  const game=fixture([[],[terrainTile('last')]]);
  const groups=await game.candidateGroupsProgressively();
  assert.equal(game.state.turn,1); assert.equal(game.state.finished,false);
  assert.equal(game.state.events[0].type,'pass');
  finishPlacement(game,groups.regular[0]);
  assert.equal(game.state.finished,true);
});

test('全員連続パスで終了し、残った手札を破棄しない',async()=>{
  const game=fixture(Array.from({length:4},(_,i)=>[terrainTile(`blocked${i}`,['C','C','C','C'])]));
  assert.equal((await game.candidateGroupsProgressively()).regular.length,0);
  assert.equal(game.state.consecutivePasses,4);
  assert.equal(game.state.finished,true);
  assert.equal(game.state.events.filter(e=>e.type==='pass').length,4);
  assert.equal(Object.values(game.state.hands).flat().length,4);
  assert.equal(game.state.discarded.length,0);
});

test('候補表示は同じ場所を統合し、選択肢と回転・反転は手札の識別を維持する',()=>{
	const base={shape:'fat',idPrefix:'kind-a',centerX:0,centerY:10,rotation:0,id:'one',_handTileId:'one'};
	const variants=[base,{...base,id:'one-mirror',idPrefix:'kind-a-mirror',mirrored:true},{...base,id:'two',idPrefix:'kind-b',_handTileId:'two',rotation:Math.PI},{...base,id:'three',idPrefix:'kind-b',_handTileId:'three'}];
	assert.equal(uniqueCandidatePositions(variants).length,1);
	assert.deepEqual(handChoicesAtPosition(variants,base).map(handTileId),['one','two']);
	assert.equal(candidatesForHandTile(variants,base).length,2);
	assert.deepEqual(handChoicesAtPosition(variants.slice(2),base).map(handTileId),['two']);
});

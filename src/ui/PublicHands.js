import { handDisplayTile, handTileLayout } from './HandTileLayout.js';
import { handTileId } from '../game/HandCandidates.js';
import { t } from './i18n.js';

export function drawHandTile(canvas, tile, view) {
  const rect=canvas.getBoundingClientRect(), dpr=devicePixelRatio || 1;
  canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr);
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (!tile || !rect.width || !rect.height) return;
  const display=handDisplayTile(tile), layout=handTileLayout(display,rect.width,rect.height);
  view.drawTileAtScreen(ctx,display,layout.x,layout.y,layout.side);
}

export class PublicHands {
  constructor({ onDrag, onRedraw }) {
    this.onDrag=onDrag; this.onRedraw=onRedraw;
    this.rows=new Map();
  }
  render({engine,view,scoreboard,blocked,provisional,heldTile,hidden}) {
    if(!engine.privatePlanning) { this.rows.clear(); return; }
    const boxes=[...scoreboard.querySelectorAll('.player-box')];
    engine.state.players.forEach((player,index)=>{
      let row=this.rows.get(player.id);
      if(!row) {
        row=document.createElement('div'); row.className='public-hand-tiles';
        row.slots=Array.from({length:3},(_,slotIndex)=>{
          const slot=document.createElement('div'), canvas=document.createElement('canvas'), actions=document.createElement('div'), button=document.createElement('button');
          slot.className='public-hand-slot'; canvas.className='public-hand-tile';
          actions.className='hand-actions'; button.type='button';
          slot.onpointerdown=event=>{if(event.target===slot && slot.classList.contains('hand-interactive') && slot.tile) this.onDrag(event,slot.tile,canvas);};
          button.onclick=()=>{if(slot.tile)this.onRedraw(slot.tile.id);};
          actions.append(button); slot.append(canvas,actions); row.append(slot);
          return {slot,canvas,button,slotIndex};
        });
        this.rows.set(player.id,row);
      }
      boxes[index].append(row);
      row.classList.toggle('hidden',hidden);
      const hand=engine.handForPlayer(player.id), active=index===engine.state.turn && engine.state.phase==='placeTile';
      row.slots.forEach(({slot,canvas,button,slotIndex})=>{
        const tile=hand[slotIndex]; slot.tile=tile;
        slot.classList.toggle('hidden',!tile);
        if(!tile || hidden) return;
        slot.dataset.tileId=tile.id;
        canvas.setAttribute('aria-label',t('hand.tile',{player:t('game.player',{number:index+1}),number:slotIndex+1}));
        const moved=handTileId(provisional)===tile.id || handTileId(heldTile)===tile.id;
        canvas.style.visibility=moved?'hidden':'';
        canvas.inert=!active || blocked;
        slot.classList.toggle('hand-interactive',active && !blocked && !moved);
        button.textContent=t('ui.redraw');
        button.disabled=!active || blocked || Boolean(provisional) || !engine.state.deck.length || (engine.activePlayer.redrawUsed && engine.candidates().length>0);
        button.title=t('tile.redraw');
        drawHandTile(canvas,tile,view);
      });
    });
    scoreboard.classList.toggle('public-hands-scroll',scoreboard.scrollHeight>scoreboard.clientHeight+1);
  }
}

import {createGame} from './game.js';
import {createChessScene} from './scene.js';

const $=id=>document.getElementById(id);
let sceneView=null,lastColor='w';
for(const id of ['newGame','humanColor','skillLevel','resetView']) $(id).disabled=true;
const promotion=$('promotionModal');
let previousFocus=null;
function formatEval(engine){if(!engine.eval)return engine.thinking?'Motoren vurderer stillingen…':'Vurderingen vises efter computerens træk.';const value=Number(engine.eval.value);const depth=engine.depth?` · dybde ${engine.depth}`:'';if(engine.eval.type==='mate')return `${value>=0?'Hvid':'Sort'} har mat i ${Math.abs(value)}${depth}`;return `Vurdering (hvid): ${value>0?'+':''}${value.toFixed(2)}${depth}`;}
function statusFor(s){if(s.result==='checkmate')return `Skakmat · ${s.turn==='w'?'sort':'hvid'} vinder`;if(s.result==='stalemate')return 'Remis · pat';if(s.pendingPromotion)return 'Vælg bondens nye brik';if(s.turn===s.engineColor){if(s.engine.failed)return 'Motoren kunne ikke svare';return `Stockfish tænker${s.inCheck?' · skak':''}…`;}return `Din tur · ${s.humanColor==='w'?'hvid':'sort'}${s.inCheck?' · skak':''}`;}
function showState(s){
  sceneView?.update(s);
  if(s.humanColor!==lastColor){sceneView?.resetView(s.humanColor);lastColor=s.humanColor;}
  $('statusText').textContent=statusFor(s);$('status').dataset.error=String(s.engine.failed);
  $('undo').disabled=!sceneView||!s.canUndo;$('humanColor').value=s.humanColor;$('skillLevel').value=String(s.engine.targetDepth);
  $('engineBadge').textContent=`DYBDE ${s.engine.targetDepth}`;
  $('engineState').textContent=s.engine.failed?'Forbindelsen lykkedes ikke. Prøv igen for at fortsætte.':s.engine.thinking?'Finder computerens næste træk…':s.engine.loading?'Gør motoren klar…':s.engine.hasResponded?'Forbundet via Chess-API.com':'Klar til at spille · kræver internet';
  $('engineState').title=s.engine.failed?s.engine.error:'';
  $('engineEval').textContent=formatEval(s.engine);$('retryEngine').hidden=!s.engine.failed;
  $('moveCount').textContent=s.moveLog.length+' '+(s.moveLog.length===1?'træk':'træk');
  const moves=$('moves');moves.replaceChildren();
  if(!s.moveLog.length){const p=document.createElement('p');p.className='empty-history';p.textContent='Ingen træk endnu. Hvid lægger ud.';moves.append(p);}
  else for(let i=0;i<s.moveLog.length;i+=2){const row=document.createElement('div');row.className='move-row';const no=document.createElement('span');no.className='move-no';no.textContent=`${i/2+1}.`;const w=document.createElement('span'),b=document.createElement('span');w.textContent=s.moveLog[i]?.text||'';b.textContent=s.moveLog[i+1]?.text||'';row.append(no,w,b);moves.append(row);}
  moves.scrollTop=moves.scrollHeight;
  if(s.pendingPromotion&&!promotion.open){previousFocus=document.activeElement;promotion.showModal();promotion.querySelector('[data-promote]').focus();}
  else if(!s.pendingPromotion&&promotion.open){promotion.close();previousFocus?.focus();}
}
const game=createGame({onChange:showState});
$('newGame').addEventListener('click',()=>{game.newGame();sceneView?.resetView(game.getState().humanColor);});
$('undo').addEventListener('click',()=>game.undo());
$('humanColor').addEventListener('change',e=>game.newGame({humanColor:e.target.value}));
$('skillLevel').addEventListener('change',e=>game.setDepth(e.target.value));
$('resetView').addEventListener('click',()=>sceneView?.resetView(game.getState().humanColor));
$('retryEngine').addEventListener('click',()=>game.retryEngine());
$('reloadScene').addEventListener('click',()=>location.reload());
promotion.querySelectorAll('[data-promote]').forEach(button=>button.addEventListener('click',()=>game.promote(button.dataset.promote)));
promotion.addEventListener('cancel',e=>{e.preventDefault();game.cancelPromotion();});
promotion.addEventListener('close',()=>{if(game.getState().pendingPromotion)game.cancelPromotion();previousFocus?.focus();});
function sceneError(error){console.error('3D scene:',error);$('loading').hidden=false;$('loading').setAttribute('role','alert');$('loadingText').textContent='3D-brættet kunne ikke indlæses. Kontrollér forbindelsen, og prøv igen. Din browser skal understøtte WebGL.';$('reloadScene').hidden=false;$('statusText').textContent='3D-visningen er ikke tilgængelig';for(const id of ['newGame','undo','humanColor','skillLevel','resetView','retryEngine']) $(id).disabled=true;}
showState(game.getState());
try{
  sceneView=await createChessScene({canvas:$('boardCanvas'),onSquare:(r,c)=>r<0?game.clearSelection():game.selectSquare(r,c),onReady:()=>{$('loading').hidden=true;},onError:sceneError,onCameraChange:color=>{$('viewSide').textContent=color==='w'?'HVIDS SIDE':'SORTS SIDE';},onSquareFocus:text=>{$('squareAnnouncement').textContent=text;}});
  for(const id of ['newGame','humanColor','skillLevel','resetView']) $(id).disabled=false;
  sceneView.update(game.getState());
  await game.start();
}catch(error){sceneError(error);}

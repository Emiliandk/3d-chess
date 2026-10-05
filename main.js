import {createGame} from './game.js';
import {createChessScene} from './scene.js';
import {createGameStorage} from './game-storage.js';
import {createBackupText,parseBackupText,MAX_BACKUP_BYTES} from './game-backup.js';

const $=id=>document.getElementById(id);
const storage=createGameStorage();
const saved=storage.load();
let savedGame=saved?.game||null;
let awaitingResume=Boolean(savedGame?.moves.length);
let saveEnabled=false;
let sceneView=null,sceneReady=false,lastColor='w';
let droneState={running:false,reducedMotion:false};
let viewMode=['play','room'].includes(saved?.viewMode)?saved.viewMode:window.matchMedia('(max-width: 900px)').matches?'play':'room';
const promotion=$('promotionModal'),resetModal=$('resetModal'),drawModal=$('drawModal');
const importModal=$('importModal');
let pendingImport=null,importReading=false,importFocus=null;
const drawLabels={'threefold':'tredje gentagelse','fifty-move':'50-træksreglen','fivefold':'femte gentagelse','seventy-five-move':'75-træksreglen','insufficient-material':'utilstrækkeligt materiale'};
let previousFocus=null,resetFocus=null,resetOptions=null;

function persist(){
  if(!saveEnabled||awaitingResume)return;
  $('saveMessage').textContent=storage.save(game.exportGame(),viewMode)
    ?'Dit parti gemmes automatisk i denne browser.'
    :'Denne browser kunne ikke gemme partiet. Du kan stadig spille, så længe siden er åben.';
}
function showViewMode(mode){viewMode=mode;$('viewPlay').setAttribute('aria-pressed',String(mode==='play'));$('viewRoom').setAttribute('aria-pressed',String(mode==='room'));persist();}
function showDroneState(state){
  droneState=state;
  $('droneToggle').setAttribute('aria-pressed',String(state.running));
  $('droneLabel').textContent=state.reducedMotion?'Drone slået fra':state.running?'Pause drone':'Start drone · 360°';
  $('droneMessage').textContent=state.reducedMotion?'Droneflyvning er slået fra ved reduceret bevægelse.':state.running?'Droneflyvning rundt om brættet er startet.':'Droneflyvningen er sat på pause.';
  syncControls(game.getState());
}
function syncControls(s){
  const playable=sceneReady&&!awaitingResume;
  for(const id of ['newGame','humanColor','skillLevel','retryEngine','claimDraw'])$(id).disabled=!playable;
  for(const id of ['resetView','viewPlay','viewRoom','resumeButton','freshButton'])$(id).disabled=!sceneReady;
  $('droneToggle').disabled=!sceneReady||droneState.reducedMotion;
  $('undo').disabled=$('mobileUndo').disabled=!playable||!s.canUndo;
  $('exportGame').disabled=$('exportBeforeImport').disabled=!(sceneReady||savedGame);
  $('importGame').disabled=!sceneReady||importReading||Boolean(pendingImport);
}
function formatEval(engine){if(!engine.eval)return engine.thinking?'Motoren vurderer stillingen…':'Vurderingen vises efter computerens træk.';const value=Number(engine.eval.value);const depth=engine.depth?` · dybde ${engine.depth}`:'';if(engine.eval.type==='mate')return `${value>=0?'Hvid':'Sort'} har mat i ${Math.abs(value)}${depth}`;return `Vurdering (hvid): ${value>0?'+':''}${value.toFixed(2)}${depth}`;}
function statusFor(s){if(s.result==='checkmate')return `Skakmat · ${s.turn==='w'?'sort':'hvid'} vinder`;if(s.result==='stalemate')return 'Remis · pat';if(s.result==='draw')return `Remis · ${drawLabels[s.drawReason]||'partiet er afsluttet'}`;if(s.pendingPromotion)return 'Vælg bondens nye brik';if(s.turn===s.engineColor){if(s.engine.failed)return 'Motoren kunne ikke svare';return `Stockfish tænker${s.inCheck?' · skak':''}…`;}return `Din tur · ${s.humanColor==='w'?'hvid':'sort'}${s.inCheck?' · skak':''}`;}
function showState(s){
  sceneView?.update(s);
  if(sceneView&&s.humanColor!==lastColor){sceneView.resetView(s.humanColor);lastColor=s.humanColor;}
  const status=awaitingResume?'Et gemt parti er klar til at fortsætte.':statusFor(s);
  $('statusText').textContent=$('mobileStatus').textContent=status;
  $('status').dataset.error=String(s.engine.failed);
  syncControls(s);
  const canClaim=s.turn===s.humanColor&&!s.gameOver&&!awaitingResume&&Boolean(s.drawClaims?.current.length||s.drawClaims?.intended.length);
  $('claimDraw').hidden=!canClaim;
  if(!canClaim&&drawModal.open)drawModal.close();
  $('humanColor').value=s.humanColor;$('skillLevel').value=String(s.engine.targetDepth);
  $('engineBadge').textContent=`DYBDE ${s.engine.targetDepth}`;
  $('engineState').textContent=s.gameOver?'Partiet er afsluttet.':s.engine.failed?'Forbindelsen lykkedes ikke. Prøv igen for at fortsætte.':s.engine.thinking?'Finder computerens næste træk…':s.engine.loading?'Gør motoren klar…':s.engine.hasResponded?'Forbundet via Chess-API.com':'Klar til at spille · kræver internet';
  $('engineState').title=s.engine.failed?s.engine.error:'';
  $('engineEval').textContent=s.gameOver?statusFor(s):formatEval(s.engine);$('retryEngine').hidden=!s.engine.failed||s.gameOver;
  $('moveCount').textContent=s.moveLog.length+' træk';
  const moves=$('moves');moves.replaceChildren();
  if(!s.moveLog.length){const p=document.createElement('p');p.className='empty-history';p.textContent='Ingen træk endnu. Hvid lægger ud.';moves.append(p);}
  else for(let i=0;i<s.moveLog.length;i+=2){const row=document.createElement('div');row.className='move-row';const no=document.createElement('span');no.className='move-no';no.textContent=`${i/2+1}.`;const w=document.createElement('span'),b=document.createElement('span');w.textContent=s.moveLog[i]?.text||'';b.textContent=s.moveLog[i+1]?.text||'';row.append(no,w,b);moves.append(row);}
  moves.scrollTop=moves.scrollHeight;
  if(s.pendingPromotion&&!promotion.open){previousFocus=document.activeElement;promotion.showModal();promotion.querySelector('[data-promote]').focus();}
  else if(!s.pendingPromotion&&promotion.open){promotion.close();previousFocus?.focus();}
  persist();
}
const game=createGame({onChange:showState});
function finishResumeChoice(){awaitingResume=false;savedGame=null;saveEnabled=true;$('resumeGame').hidden=true;showState(game.getState());}
async function startFresh(options={}){finishResumeChoice();game.newGame(options);sceneView?.resetView(game.getState().humanColor);await game.start();}
function requestNewGame(options={}){
  $('humanColor').value=game.getState().humanColor;
  if(game.getState().moveLog.length||savedGame?.moves.length){resetOptions=options;resetFocus=document.activeElement;resetModal.returnValue='';resetModal.showModal();}
  else void startFresh(options);
}
$('newGame').addEventListener('click',()=>requestNewGame());
$('freshButton').addEventListener('click',()=>requestNewGame());
$('resumeButton').addEventListener('click',async()=>{
  if(!savedGame||!game.restoreGame(savedGame)){
    finishResumeChoice();
    $('saveMessage').textContent='Det gemte parti kunne ikke gendannes. Et nyt parti er klar.';
  }else finishResumeChoice();
  await game.start();
});
resetModal.addEventListener('close',()=>{const options=resetOptions;resetOptions=null;resetFocus?.focus();if(resetModal.returnValue==='confirm'&&options)void startFresh(options);});
$('undo').addEventListener('click',()=>game.undo());
$('mobileUndo').addEventListener('click',()=>game.undo());
$('claimDraw').addEventListener('click',()=>{
  const claims=game.getState().drawClaims;
  if(claims.current.length){game.claimDraw();return;}
  const select=$('drawMove');select.replaceChildren();
  for(const move of claims.intended){const option=document.createElement('option');option.value=move.uci;option.textContent=`${move.uci.slice(0,2)} → ${move.uci.slice(2,4)}${move.uci[4]?' (forvandling til '+({q:'dronning',r:'tårn',b:'løber',n:'springer'}[move.uci[4]])+')':''} · ${move.reasons.map(reason=>drawLabels[reason]).join(' / ')}`;select.append(option);}
  if(select.options.length){drawModal.returnValue='';drawModal.showModal();}
});
$('confirmDraw').addEventListener('click',e=>{e.preventDefault();const move=$('drawMove').value;drawModal.close();game.claimDraw(move);$('boardCanvas').focus();});
$('viewPlay').addEventListener('click',()=>sceneView?.setViewMode('play'));
$('viewRoom').addEventListener('click',()=>sceneView?.setViewMode('room'));
$('droneToggle').addEventListener('click',()=>sceneView?.toggleDrone());
$('humanColor').addEventListener('change',e=>requestNewGame({humanColor:e.target.value}));
$('skillLevel').addEventListener('change',e=>game.setDepth(e.target.value));
$('resetView').addEventListener('click',()=>sceneView?.resetView(game.getState().humanColor));
$('retryEngine').addEventListener('click',()=>game.retryEngine());
$('reloadScene').addEventListener('click',()=>location.reload());
function downloadBackup(){
  try{
    const record=awaitingResume?{game:savedGame,viewMode:saved.viewMode}: {game:game.exportGame(),viewMode};
    const now=new Date();
    const text=createBackupText(record.game,record.viewMode,now);
    const blob=new window.Blob([text],{type:'application/json'});
    const url=window.URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=`chess-parti-${now.toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.append(link);link.click();link.remove();
    window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);
    $('backupMessage').textContent='Backupfilen er klar til at blive gemt. Behold den et sikkert sted.';
  }catch(error){$('backupMessage').textContent=error.message||'Backupfilen kunne ikke oprettes. Prøv igen.';}
}
$('exportGame').addEventListener('click',downloadBackup);
$('exportBeforeImport').addEventListener('click',downloadBackup);
$('importGame').addEventListener('click',()=>{$('backupFile').click();});
$('backupFile').addEventListener('change',async()=>{
  const file=$('backupFile').files?.[0];$('backupFile').value='';
  if(!file||importReading||pendingImport)return;
  importFocus=document.activeElement;importReading=true;syncControls(game.getState());
  try{
    if(file.size>MAX_BACKUP_BYTES)throw new Error('Backupfilen er for stor. Vælg en Chess-backup på højst 100 KB.');
    const record=parseBackupText(await file.text());
    pendingImport=record;
    $('importDescription').textContent=`Filen indeholder ${record.game.moves.length} træk, og du spiller som ${record.game.humanColor==='w'?'hvid':'sort'}. Gendannelse erstatter dit nuværende og lokalt gemte parti.`;
    importModal.returnValue='';importModal.showModal();
    $('backupMessage').textContent='Backupfilen er kontrolleret. Bekræft gendannelsen, eller behold dit parti.';
  }catch(error){pendingImport=null;$('backupMessage').textContent=error.message||'Backupfilen kunne ikke læses. Dit parti er bevaret.';}
  finally{importReading=false;syncControls(game.getState());}
});
importModal.addEventListener('close',async()=>{
  const record=pendingImport;pendingImport=null;syncControls(game.getState());importFocus?.focus();
  if(importModal.returnValue!=='confirm'||!record){$('backupMessage').textContent='Gendannelsen er annulleret. Dit parti er bevaret.';return;}
  // Suppress autosave until the complete validated position and view are ready.
  const wasSaveEnabled=saveEnabled;saveEnabled=false;
  if(!game.restoreGame(record.game)){saveEnabled=wasSaveEnabled;$('backupMessage').textContent='Partiet kunne ikke gendannes. Dit nuværende parti er bevaret.';return;}
  sceneView?.setViewMode(record.viewMode);
  finishResumeChoice();
  $('backupMessage').textContent='Partiet er gendannet. Behold backupfilen som en ekstra kopi.';
  await game.start();
});
promotion.querySelectorAll('[data-promote]').forEach(button=>button.addEventListener('click',()=>game.promote(button.dataset.promote)));
promotion.addEventListener('cancel',e=>{e.preventDefault();game.cancelPromotion();});
promotion.addEventListener('close',()=>{if(game.getState().pendingPromotion)game.cancelPromotion();previousFocus?.focus();});
function sceneError(error){console.error('3D scene:',error);sceneReady=false;$('loading').hidden=false;$('loading').setAttribute('role','alert');$('loadingText').textContent='3D-brættet kunne ikke indlæses. Kontrollér forbindelsen, og prøv igen. Din browser skal understøtte WebGL.';$('reloadScene').hidden=false;$('statusText').textContent=$('mobileStatus').textContent='3D-visningen er ikke tilgængelig';syncControls(game.getState());}
if(savedGame&&!awaitingResume){game.restoreGame(savedGame);savedGame=null;}
$('resumeGame').hidden=!awaitingResume;
showViewMode(viewMode);showState(game.getState());
try{
  sceneView=await createChessScene({canvas:$('boardCanvas'),viewMode,onViewModeChange:showViewMode,onDroneChange:showDroneState,onSquare:(r,c)=>{if(!awaitingResume){if(r<0)game.clearSelection();else game.selectSquare(r,c);}},onReady:()=>{$('loading').hidden=true;},onError:sceneError,onCameraChange:color=>{$('viewSide').textContent=color==='w'?'HVIDS SIDE':'SORTS SIDE';},onSquareFocus:text=>{$('squareAnnouncement').textContent=text;}});
  sceneReady=true;
  showState(game.getState());
  sceneView.startDrone();
  if(!awaitingResume){saveEnabled=true;persist();await game.start();}
}catch(error){sceneError(error);}

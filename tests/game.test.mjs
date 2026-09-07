import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../game.js', import.meta.url), 'utf8');
const { createGame } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const nativeFetch = globalThis.fetch;
const games = [];
afterEach(() => {
  for (const game of games.splice(0)) game.newGame({ humanColor: 'w' });
  globalThis.fetch = nativeFetch;
});
const game = (options) => { const value=createGame(options); games.push(value); return value; };
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function waitFor(predicate, label='condition') {
  for (let i=0;i<100;i++) { if (predicate()) return; await pause(5); }
  assert.fail(`Timed out waiting for ${label}`);
}
function play(g, from, to) {
  const square = name => [8-Number(name[1]),name.charCodeAt(0)-97];
  g.selectSquare(...square(from)); g.selectSquare(...square(to));
}
function fixtureEngine(moves) {
  const requests=[];
  globalThis.fetch=async (url,options) => {
    const request={url,body:JSON.parse(options.body),signal:options.signal};
    requests.push(request);
    assert.equal(url,'https://chess-api.com/v1');
    assert.equal(options.method,'POST');
    const move=moves.shift();
    assert.ok(move,'The test must declare every engine response');
    return {ok:true,json:async()=>typeof move==='string' ? {move,eval:0.25,depth:18} : move};
  };
  return requests;
}
async function fullTurn(g,from,to) {
  const count=g.getState().moveLog.length;
  play(g,from,to);
  await waitFor(()=>g.getState().moveLog.length===count+2,'engine fixture move');
}

test('initial legal moves and detached board/state snapshots', () => {
  const g=game();
  let count=0;
  for(let r=6;r<8;r++) for(let c=0;c<8;c++) {
    g.selectSquare(r,c); count+=g.getState().legalTargets.length;
  }
  assert.equal(count,20);
  const state=g.getState();
  state.board[7][4].type='q';
  state.legalTargets.push({r:0,c:0});
  state.engine.targetDepth=1;
  assert.equal(g.getState().board[7][4].type,'k');
  assert.equal(g.getState().engine.targetDepth,18);
  assert.equal(g.getState().fen,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.doesNotThrow(()=>g.selectSquare(-1,10));
});

test('clearSelection emits empty selection without changing the position', () => {
  const changes=[];
  const g=game({onChange:state=>changes.push(state)});
  g.selectSquare(6,4);
  const before=g.getState();
  assert.equal(before.legalTargets.length,2);
  g.clearSelection();
  assert.equal(g.getState().selected,null);
  assert.deepEqual(g.getState().legalTargets,[]);
  assert.equal(g.getState().fen,before.fen);
  assert.deepEqual(changes.at(-1).legalTargets,[]);
});

test('real integration contract sends valid FEN/depth and applies only legal engine reply', async () => {
  const requests=fixtureEngine([{move:'e7e5',eval:null,centipawns:37,depth:12}]);
  const g=game();
  g.setDepth(12);
  await g.start();
  assert.equal(requests.length,0,'start does not claim a server health check');
  assert.equal(g.getState().engine.hasResponded,false);
  await fullTurn(g,'e2','e4');
  assert.equal(requests[0].body.fen,'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  assert.equal(requests[0].body.depth,12);
  assert.equal(requests[0].body.variants,1);
  assert.deepEqual(g.getState().engine.eval,{type:'pawns',value:0.37});
  assert.deepEqual(g.getState().moveLog.map(move=>move.text),['e4','e5']);
  assert.equal(g.getState().engine.hasResponded,true);
  g.undo();
  assert.equal(g.getState().moveLog.length,0);
  assert.equal(g.getState().canUndo,false);
  assert.equal(g.getState().board[6][4].type,'p');
});

test('undo cancels an in-flight request and ignores late success', async () => {
  let finish;
  let signal;
  globalThis.fetch=(_url,options)=>{
    signal=options.signal;
    return new Promise(resolve=>{finish=resolve;});
  };
  const g=game(); await g.start();
  play(g,'e2','e4');
  await waitFor(()=>Boolean(finish));
  g.undo();
  assert.equal(signal.aborted,true);
  finish({ok:true,json:async()=>({move:'e7e5'})});
  await pause(10);
  assert.equal(g.getState().moveLog.length,0);
  assert.equal(g.getState().board[1][4].type,'p');
  assert.equal(g.getState().engine.thinking,false);
});

test('new game/color change invalidates old response; computer opens when human chooses black', async () => {
  let finishOld;
  let oldSignal;
  globalThis.fetch=(_url,options)=>{
    oldSignal=options.signal;
    return new Promise(resolve=>{finishOld=resolve;});
  };
  const g=game(); await g.start(); play(g,'e2','e4');
  await waitFor(()=>Boolean(finishOld));
  const requests=fixtureEngine(['d2d4']);
  g.newGame({humanColor:'b',depth:9});
  assert.equal(oldSignal.aborted,true);
  finishOld({ok:true,json:async()=>({move:'e7e5'})});
  await waitFor(()=>g.getState().moveLog.length===1);
  assert.equal(requests[0].body.depth,9);
  assert.equal(g.getState().turn,'b');
  assert.equal(g.getState().humanColor,'b');
  assert.equal(g.getState().engineColor,'w');
  assert.equal(g.getState().board[4][3].color,'w');
  assert.equal(g.getState().board[1][4].color,'b');
  assert.equal(g.getState().canUndo,false);
});

test('changing depth cancels search and late failures cannot replace current success', async () => {
  let rejectOld;
  let oldSignal;
  globalThis.fetch=(_url,options)=>{
    oldSignal=options.signal;
    return new Promise((_resolve,reject)=>{rejectOld=reject;});
  };
  const g=game(); await g.start(); play(g,'e2','e4');
  await waitFor(()=>Boolean(rejectOld));
  const requests=fixtureEngine(['e7e5']);
  g.setDepth(9);
  assert.equal(oldSignal.aborted,true);
  await waitFor(()=>g.getState().moveLog.length===2);
  rejectOld(new Error('stale HTTP failure'));
  await pause(10);
  assert.equal(requests[0].body.depth,9);
  assert.equal(g.getState().engine.failed,false);
  assert.equal(g.getState().engine.error,'');
});

test('illegal API move is exposed as failure; retry keeps position and applies valid response', async () => {
  fixtureEngine(['e7e4']);
  const g=game(); await g.start(); play(g,'e2','e4');
  await waitFor(()=>g.getState().engine.failed);
  assert.match(g.getState().engine.error,/ulovligt træk/);
  assert.equal(g.getState().moveLog.length,1);
  assert.equal(g.getState().board[1][4].type,'p');
  fixtureEngine(['e7e5']);
  await g.retryEngine();
  await waitFor(()=>g.getState().moveLog.length===2);
  assert.equal(g.getState().engine.failed,false);
});

test('HTTP/API failure remains visible and does not substitute a fabricated move', async () => {
  globalThis.fetch=async()=>({ok:false,status:429,json:async()=>({error:'For mange forespørgsler'})});
  const g=game(); await g.start(); play(g,'e2','e4');
  await waitFor(()=>g.getState().engine.failed);
  assert.equal(g.getState().engine.error,'For mange forespørgsler');
  assert.equal(g.getState().moveLog.length,1);
  assert.equal(g.getState().engine.hasResponded,false);
});

test('existing kingside castling rules move both pieces and restore on undo', async () => {
  fixtureEngine(['e7e5','b8c6','f8c5','g8f6']);
  const g=game(); await g.start();
  await fullTurn(g,'e2','e4');
  await fullTurn(g,'g1','f3');
  await fullTurn(g,'f1','c4');
  g.selectSquare(7,4);
  assert.ok(g.getState().legalTargets.some(move=>move.castle==='k'));
  await fullTurn(g,'e1','g1');
  assert.equal(g.getState().board[7][6].type,'k');
  assert.equal(g.getState().board[7][5].type,'r');
  assert.equal(g.getState().moveLog[6].text,'O-O');
  g.undo();
  assert.equal(g.getState().board[7][4].type,'k');
  assert.equal(g.getState().board[7][7].type,'r');
});

test('en-passant target is included only for a legal capture and capture removes passed pawn', async () => {
  fixtureEngine(['a7a6','d7d5','a6a5']);
  const g=game(); await g.start();
  await fullTurn(g,'e2','e4');
  await fullTurn(g,'e4','e5');
  assert.equal(g.getState().fen.split(' ')[3],'d6');
  await fullTurn(g,'e5','d6');
  assert.equal(g.getState().board[2][3].color,'w');
  assert.equal(g.getState().board[3][3],null);
  assert.equal(g.getState().moveLog[4].text,'exd6');
});

test('promotion waits for a choice, supports cancellation and underpromotion', async () => {
  const notifications=[];
  fixtureEngine(['h7h5','h5h4','h4h3','h3g2']);
  const g=game({onPromotion:p=>notifications.push(p)}); await g.start();
  await fullTurn(g,'a2','a4');
  await fullTurn(g,'a4','a5');
  await fullTurn(g,'a5','a6');
  await fullTurn(g,'a6','b7');
  play(g,'b7','a8');
  assert.equal(g.getState().pendingPromotion.color,'w');
  assert.equal(g.getState().moveLog.length,8);
  const pending=g.getState().pendingPromotion;
  g.clearSelection();
  assert.deepEqual(g.getState().pendingPromotion,pending);
  assert.equal(g.promote('k'),false);
  g.cancelPromotion();
  assert.equal(g.getState().pendingPromotion,null);
  assert.equal(g.getState().board[1][1].type,'p');
  play(g,'b7','a8');
  assert.equal(g.promote('n'),true);
  assert.equal(notifications.length,2);
  assert.equal(g.getState().board[0][0].type,'n');
  assert.equal(g.getState().moveLog[8].text,'bxa8=N');
  g.newGame(); // cancel the engine's next scheduled turn
});

test('checkmate locks further moves and undo restores a playable position', async () => {
  fixtureEngine(['e7e5',{move:'d8h4',mate:-1,depth:18}]);
  const g=game(); await g.start();
  await fullTurn(g,'f2','f3');
  await fullTurn(g,'g2','g4');
  assert.equal(g.getState().gameOver,true);
  assert.equal(g.getState().result,'checkmate');
  assert.equal(g.getState().inCheck,true);
  assert.deepEqual(g.getState().checkSquare,{r:7,c:4});
  assert.equal(g.getState().moveLog[3].text,'Qh4#');
  play(g,'e2','e4');
  assert.equal(g.getState().moveLog.length,4);
  g.undo();
  assert.equal(g.getState().gameOver,false);
  assert.equal(g.getState().moveLog.length,2);
});

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.js';

const originalFetch=globalThis.fetch;
const games=[];
const game=options=>{const g=createGame(options); games.push(g); return g;};
const record=(moves,options={})=>({version:1,humanColor:'w',targetDepth:12,moves,...options});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate) {
  for (let i=0;i<100;i++) { if (predicate()) return; await pause(5); }
  assert.fail('Timed out waiting for engine request');
}
afterEach(()=>{
  for (const g of games.splice(0)) g.dispose();
  globalThis.fetch=originalFetch;
});

test('a JSON round trip preserves castling rights, transcript and usable undo history', () => {
  globalThis.fetch=()=>assert.fail('Replay must never contact the engine');
  const changes=[];
  const g=game({onChange:state=>changes.push(state)});
  const opening=['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','e1g1','g8f6'];
  assert.equal(g.restoreGame(record(opening)),true);
  assert.equal(changes.length,1);
  assert.equal(g.getState().board[7][6].type,'k');
  assert.equal(g.getState().board[7][5].type,'r');
  assert.equal(g.getState().fen.split(' ')[2],'kq');
  assert.equal(g.getState().moveLog[6].text,'O-O');
  assert.deepEqual(g.exportGame(),record(opening));
  const saved=JSON.parse(JSON.stringify(g.exportGame()));
  const copy=game();
  assert.equal(copy.restoreGame(saved),true);
  assert.deepEqual(copy.getState(),g.getState());
  saved.moves.length=0;
  assert.equal(copy.getState().moveLog.length,8,'Caller cannot mutate restored history');
  copy.undo();
  assert.equal(copy.getState().board[7][4].type,'k');
  assert.equal(copy.getState().board[7][7].type,'r');
  assert.equal(copy.getState().fen.split(' ')[2],'KQkq');
  assert.deepEqual(copy.exportGame().moves,opening.slice(0,6));
});

test('restoring en passant preserves the capture and undo restores the passed pawn', () => {
  const g=game();
  const opening=['e2e4','a7a6','e4e5','d7d5'];
  assert.equal(g.restoreGame(record(opening)),true);
  assert.equal(g.getState().fen.split(' ')[3],'d6');
  g.selectSquare(3,4);
  assert.ok(g.getState().legalTargets.some(move=>move.enPassant && move.r===2 && move.c===3));
  g.selectSquare(2,3);
  assert.equal(g.getState().board[3][3],null);
  assert.equal(g.getState().board[2][3].type,'p');
  assert.equal(g.exportGame().moves.at(-1),'e5d6');
  const restored=game();
  assert.equal(restored.restoreGame(g.exportGame()),true);
  assert.equal(restored.getState().board[3][3],null);
  restored.undo();
  assert.equal(restored.getState().board[3][3].color,'b');
  assert.equal(restored.getState().fen.split(' ')[3],'d6');
});

test('underpromotion and checkmate are reconstructed while post-game moves are rejected', () => {
  const g=game();
  const promotion=['a2a4','h7h5','a4a5','h5h4','a5a6','h4h3','a6b7','h3g2','b7a8n'];
  assert.equal(g.restoreGame(record(promotion)),true);
  assert.equal(g.getState().board[0][0].type,'n');
  assert.equal(g.getState().moveLog.at(-1).text,'bxa8=N');
  assert.equal(g.getState().pendingPromotion,null);
  assert.equal(g.restoreGame(record([...promotion.slice(0,-1),'b7a8'])),false);
  assert.equal(g.restoreGame(record(['f2f3','e7e5','g2g4','d8h4'])),true);
  assert.equal(g.getState().result,'checkmate');
  const before=g.getState();
  assert.equal(g.restoreGame(record(['f2f3','e7e5','g2g4','d8h4','e2e4'])),false);
  assert.deepEqual(g.getState(),before);
  g.undo();
  assert.equal(g.getState().gameOver,false);
  assert.equal(g.getState().moveLog.length,2);
});

test('malformed, oversized and illegal saves leave the live selection and callbacks untouched', () => {
  const changes=[];
  const g=game({onChange:state=>changes.push(state)});
  g.selectSquare(6,4);
  const before=g.getState();
  const count=changes.length;
  const bad=[null,[],{},record([],{version:2}),record([],{humanColor:'x'}),
    record([],{targetDepth:19}),record([],{targetDepth:1.5}),record(['e2e4q']),
    record(['E2E4']),record(['e7e5']),record(['e2e4','e7e4']),record(new Array(1)),
    record(Array(1001).fill('e2e4')),record([],{moves:'e2e4'})];
  for (const value of bad) {
    assert.equal(g.restoreGame(value),false);
    assert.deepEqual(g.getState(),before);
    assert.equal(changes.length,count);
  }
});

test('invalid restore leaves an active search alive; valid restore cancels it and awaits start', async () => {
  let finish;
  let signal;
  let requests=0;
  globalThis.fetch=(_url,options)=>{
    requests++;
    signal=options.signal;
    return new Promise(resolve=>{finish=resolve;});
  };
  const changes=[];
  const g=game({onChange:state=>changes.push(state)});
  await g.start();
  g.selectSquare(6,4); g.selectSquare(4,4);
  await waitFor(()=>Boolean(finish));
  const before=g.getState();
  assert.equal(g.restoreGame(record(['d2d4','d7d4'])),false);
  assert.equal(signal.aborted,false);
  assert.deepEqual(g.getState(),before);
  const count=changes.length;
  assert.equal(g.restoreGame(record(['d2d4'])),true);
  assert.equal(changes.length,count+1);
  assert.equal(signal.aborted,true);
  assert.equal(g.getState().engine.thinking,false);
  finish({ok:true,json:async()=>({move:'e7e5'})});
  await pause(60);
  assert.equal(requests,1,'Restoring does not schedule a search');
  assert.deepEqual(g.exportGame().moves,['d2d4']);
  globalThis.fetch=async()=>{requests++; return {ok:true,json:async()=>({move:'d7d5'})};};
  await g.start();
  await waitFor(()=>g.getState().moveLog.length===2);
  assert.equal(requests,2);
  assert.deepEqual(g.exportGame().moves,['d2d4','d7d5']);
});

test('a stale asynchronous engine startup cannot restart a restored game', async () => {
  let requests=0;
  globalThis.fetch=()=>{requests++; assert.fail('The restored game has not been started');};
  const g=game();
  g.newGame({humanColor:'b'});
  const starting=g.start();
  assert.equal(g.restoreGame(record([],{humanColor:'b'})),true);
  await starting;
  await pause(60);
  assert.equal(requests,0);
  assert.equal(g.getState().engine.ready,false);
  assert.equal(g.getState().engine.loading,false);
});

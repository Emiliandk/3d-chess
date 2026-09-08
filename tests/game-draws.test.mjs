import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,hasInsufficientMaterial,adjudicatePosition} from '../game.js';

const nativeFetch=globalThis.fetch;
const games=[];
const game=options=>{const g=createGame(options); games.push(g); return g;};
const record=(moves,options={})=>({version:1,humanColor:'w',targetDepth:12,moves,...options});
const square=name=>[8-Number(name[1]),name.charCodeAt(0)-97];
const play=(g,uci)=>{g.selectSquare(...square(uci.slice(0,2)));g.selectSquare(...square(uci.slice(2,4)));if(uci[4])g.promote(uci[4]);};
const cycle=['g1f3','g8f6','f3g1','f6g8'];
const repeat=(moves,count)=>Array.from({length:count},()=>moves).flat();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate) {
  for(let i=0;i<100;i++){if(predicate())return;await pause(5);}
  assert.fail('Timed out waiting for engine fixture');
}
afterEach(()=>{for(const g of games.splice(0))g.dispose();globalThis.fetch=nativeFetch;});

// A fixed legal transcript from the starting position: no pawn move, capture or
// fifth occurrence interrupts the 150 halfmoves. This exercises real replay,
// move execution and persisted counters rather than injecting a saved clock.
const quiet150=`g1h3 g8h6 h3f4 h6f5 b1c3 h8g8 h1g1 f5h6 f4d3 h6f5 d3b4 b8a6 c3a4 g8h8 g1h1 f5h6 b4d3 h6f5 d3f4 a8b8 h1g1 f5d6 a1b1 d6f5 f4h3 a6c5 a4c3 f5h6 b1a1 b8a8 c3b1 h8g8 h3f4 c5e6 b1a3 e6g5 f4d3 h6f5 a1b1 a8b8 d3f4 f5d6 g1h1 b8a8 f4h3 d6b5 h1g1 g8h8 g1h1 g5e6 b1a1 e6c5 h3g1 c5a6 g1h3 a6b8 a3b1 b5d6 h1g1 b8a6 g1h1 a6c5 h1g1 h8g8 b1a3 d6b5 a3c4 b5d6 g1h1 g8h8 h3g1 d6b5 g1f3 c5e6 c4a3 b5d6 a3b1 d6b5 b1a3 b5d6 f3h4 h8g8 a3b1 d6f5 b1c3 g8h8 a1b1 e6g5 c3a4 a8b8 h4f3 b8a8 a4c3 g5e6 f3d4 e6c5 b1a1 h8g8 c3b1 g8h8 d4f3 c5a6 f3g1 a6c5 g1h3 f5d6 b1c3 h8g8 h1g1 c5a6 c3e4 d6b5 h3f4 g8h8 a1b1 a6c5 e4g3 c5a6 f4h3 h8g8 h3f4 g8h8 f4h3 h8g8 h3f4 a8b8 g3e4 g8h8 b1a1 b8a8 e4g3 h8g8 f4d3 b5d6 d3f4 d6f5 f4d3 a8b8 d3b4 f5d6 a1b1 d6f5 g3h1 f5d6 b1a1 d6f5 a1b1 b8a8 h1g3 a6b8`.split(' ');

function boardFromPlacement(placement) {
  return placement.split('/').map(row=>{
    const result=[];
    for(const ch of row) {
      if(/[1-8]/.test(ch))result.push(...Array(Number(ch)).fill(null));
      else result.push({type:ch.toLowerCase(),color:ch===ch.toUpperCase()?'w':'b',moved:true});
    }
    assert.equal(result.length,8);
    return result;
  });
}

test('third occurrence can be claimed without changing the board; claims and histories are detached',()=>{
  const g=game();
  assert.equal(g.restoreGame(record(repeat(cycle,2))),true);
  const state=g.getState();
  assert.equal(state.result,null);
  assert.deepEqual(state.drawClaims.current,['threefold']);
  assert.equal(state.halfmoveClock,8);
  state.drawClaims.current.length=0;state.drawClaims.intended.length=0;
  assert.deepEqual(g.getState().drawClaims.current,['threefold']);
  assert.equal(g.claimDraw(),true);
  assert.equal(g.getState().result,'draw');
  assert.equal(g.getState().drawReason,'threefold');
  assert.equal(g.getState().fen,state.fen);
  assert.equal(g.getState().moveLog.length,8);
  assert.deepEqual(g.getState().drawClaims,{current:[],intended:[]});
  assert.deepEqual(g.exportGame().drawClaim,{claimant:'w',reason:'threefold',intendedUci:null});
  play(g,'e2e4');assert.equal(g.getState().moveLog.length,8);
});

test('intended repetition claim validates the move and leaves all preview state untouched',()=>{
  const changes=[];
  const g=game({onChange:s=>changes.push(s)});
  assert.equal(g.restoreGame(record(repeat(cycle,2).slice(0,7),{humanColor:'b'})),true);
  const before=g.exportGame();
  const state=g.getState();
  const count=changes.length;
  assert.deepEqual(state.drawClaims.current,[]);
  assert.ok(state.drawClaims.intended.some(move=>move.uci==='f6g8' && move.reasons.includes('threefold')));
  g.getState();g.getState();
  assert.equal(changes.length,count);
  assert.deepEqual(g.exportGame(),before);
  for(const bad of ['f6g7','g8f6','f6g8q','F6G8',{},''])assert.equal(g.claimDraw(bad),false);
  assert.deepEqual(g.getState(),state);
  assert.equal(changes.length,count);
  assert.equal(g.claimDraw('f6g8'),true);
  assert.equal(g.getState().fen,state.fen,'The indicated move has not been played');
  assert.deepEqual(g.exportGame().drawClaim,{claimant:'b',reason:'threefold',intendedUci:'f6g8'});
});

test('fifth occurrence ends automatically; undo removes discarded future occurrences',()=>{
  const g=game();
  assert.equal(g.restoreGame(record(repeat(cycle,4))),true);
  assert.equal(g.getState().result,'draw');
  assert.equal(g.getState().drawReason,'fivefold');
  assert.equal(g.exportGame().drawClaim,undefined);
  const saved=g.exportGame();
  const copy=game();assert.equal(copy.restoreGame(saved),true);
  assert.equal(copy.getState().drawReason,'fivefold');
  g.undo();
  assert.equal(g.getState().gameOver,false);
  assert.equal(g.getState().moveLog.length,14);
  assert.equal(g.getState().halfmoveClock,14);
  play(g,'e2e4');
  assert.deepEqual(g.getState().drawClaims.current,[]);
  assert.equal(g.getState().halfmoveClock,0);
  assert.equal(g.getState().result,null);
  assert.equal(g.restoreGame(record([...saved.moves,'e2e4'])),false);
  g.newGame();
  assert.equal(g.getState().halfmoveClock,0);
  assert.deepEqual(g.getState().drawClaims,{current:[],intended:[]});
});

test('lost king and rook castling rights distinguish otherwise repeated placements',()=>{
  const fixtures=[
    {opening:['h2h4','a7a5'],loop:['h1h3','a8a6','h3h1','a6a8'],rights:'Qk'},
    {opening:['e2e4','e7e5'],loop:['e1e2','e8e7','e2e1','e7e8'],rights:'-'}
  ];
  const g=game();
  for(const {opening,loop,rights} of fixtures) {
    assert.equal(g.restoreGame(record([...opening,...repeat(loop,2)])),true);
    assert.equal(g.getState().fen.split(' ')[2],rights);
    assert.deepEqual(g.getState().drawClaims.current,[],'The original castling rights are a distinct position');
    assert.equal(g.restoreGame(record([...opening,...repeat(loop,3)])),true);
    assert.deepEqual(g.getState().drawClaims.current,['threefold']);
  }
});

test('legal en passant distinguishes repetition; pinned and irrelevant en passant do not',()=>{
  const g=game();
  const opening=['e2e4','a7a6','e4e5','d7d5'];
  const loop=['g1f3','b8c6','f3g1','c6b8'];
  assert.equal(g.restoreGame(record(opening)),true);
  assert.equal(g.getState().fen.split(' ')[3],'d6');
  assert.equal(g.restoreGame(record([...opening,...repeat(loop,2)])),true);
  assert.deepEqual(g.getState().drawClaims.current,[]);
  assert.equal(g.restoreGame(record([...opening,...repeat(loop,3)])),true);
  assert.deepEqual(g.getState().drawClaims.current,['threefold']);

  const pinned=['e2e4','e7e6','e4e5','g8f6','d2d4','f8b4','c2c3','e8g8','f2f4','a7a6','f4f5','e6f5','g1f3','f8e8','a2a3','d7d5'];
  assert.equal(g.restoreGame(record(pinned)),true);
  assert.equal(g.getState().fen.split(' ')[3],'-','The e5 pawn is pinned to the e1 king by Re8');
  g.selectSquare(3,4);
  assert.ok(!g.getState().legalTargets.some(move=>move.enPassant));
  assert.equal(g.restoreGame(record([...pinned,...repeat(['f3g1','b8c6','g1f3','c6b8'],2)])),true);
  assert.deepEqual(g.getState().drawClaims.current,['threefold']);
  assert.equal(g.restoreGame(record(['e2e4','e7e5',...repeat(cycle,2)])),true);
  assert.deepEqual(g.getState().drawClaims.current,['threefold'],'Uncapturable EP targets do not split position identities');
});

test('50-move claims survive reload at halfmove 99 and distinguish current from intended claims',()=>{
  const g=game();
  assert.equal(g.restoreGame(record(quiet150.slice(0,99),{humanColor:'b'})),true);
  assert.equal(g.getState().halfmoveClock,99);
  assert.ok(!g.getState().drawClaims.current.includes('fifty-move'));
  assert.ok(g.getState().drawClaims.intended.some(move=>move.uci===quiet150[99] && move.reasons.includes('fifty-move')));
  const copy=game();assert.equal(copy.restoreGame(JSON.parse(JSON.stringify(g.exportGame()))),true);
  assert.equal(copy.getState().fen.split(' ')[4],'99');
  const before=copy.getState().fen;
  assert.equal(copy.claimDraw(quiet150[99]),true);
  assert.equal(copy.getState().drawReason,'fifty-move');
  assert.equal(copy.getState().fen,before);
  assert.equal(g.restoreGame(record(quiet150.slice(0,100))),true);
  assert.ok(g.getState().drawClaims.current.includes('fifty-move'));
  assert.equal(g.getState().gameOver,false);
  assert.equal(g.claimDraw(),true);
  assert.equal(g.getState().drawReason,'fifty-move');
});

test('75 moves end automatically at 150 halfmoves and preserve the true FEN counter on undo',()=>{
  const g=game();
  assert.equal(g.restoreGame(record(quiet150.slice(0,149),{humanColor:'b'})),true);
  assert.equal(g.getState().result,null);
  assert.equal(g.getState().halfmoveClock,149);
  play(g,quiet150[149]);
  assert.equal(g.getState().result,'draw');
  assert.equal(g.getState().drawReason,'seventy-five-move');
  assert.equal(g.getState().fen.split(' ')[4],'150');
  const copy=game();assert.equal(copy.restoreGame(g.exportGame()),true);
  assert.equal(copy.getState().drawReason,'seventy-five-move');
  copy.undo();
  assert.equal(copy.getState().gameOver,false);
  assert.equal(copy.getState().halfmoveClock,149);
});

test('pawn moves, captures, en passant and promotion reset the clock while castling increments it',()=>{
  const g=game();
  const examples=[
    {moves:[...cycle,'e2e4'],clock:0},
    {moves:['e2e4','d7d5','g1f3','b8c6','e4d5'],clock:0},
    {moves:['e2e4','a7a6','e4e5','d7d5','e5d6'],clock:0},
    {moves:['a2a4','h7h5','a4a5','h5h4','a5a6','h4h3','a6b7','h3g2','b7a8n'],clock:0},
    {moves:['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','e1g1'],clock:5}
  ];
  for(const {moves,clock} of examples){assert.equal(g.restoreGame(record(moves)),true);assert.equal(g.getState().halfmoveClock,clock);assert.equal(g.getState().fen.split(' ')[4],String(clock));}
});

test('material-only detection recognizes safe classes without declaring possible mates drawn',()=>{
  const dead=[
    '4k3/8/8/8/8/8/8/4K3',
    '4k3/8/8/8/8/8/8/2B1K3',
    '4k3/8/8/8/8/8/8/1N2K3',
    '4kb2/8/8/8/8/8/8/2B1K3',
    '4kb2/8/8/8/8/4B3/8/2B1K3'
  ];
  const live=[
    '4k3/8/8/8/8/8/8/1N2K1N1',
    '1n2k3/8/8/8/8/8/8/1N2K3',
    '2b1k3/8/8/8/8/8/8/2B1K3',
    '4kb2/8/8/8/8/8/8/1N2K3',
    '4k3/8/8/8/8/8/P7/4K3',
    '4k3/8/8/8/8/8/8/R3K3'
  ];
  for(const placement of dead)assert.equal(hasInsufficientMaterial(boardFromPlacement(placement)),true,placement);
  for(const placement of live)assert.equal(hasInsufficientMaterial(boardFromPlacement(placement)),false,placement);
  const board=boardFromPlacement(live.at(-1));
  assert.deepEqual(adjudicatePosition({board,inCheck:true,hasLegalMove:false,repetitions:1,halfmoveClock:150}),{result:'checkmate',drawReason:null});
  assert.deepEqual(adjudicatePosition({board,inCheck:true,hasLegalMove:true,repetitions:1,halfmoveClock:150}),{result:'draw',drawReason:'seventy-five-move'});
  assert.deepEqual(adjudicatePosition({board:boardFromPlacement(dead[0]),inCheck:false,hasLegalMove:true,repetitions:1,halfmoveClock:0}),{result:'draw',drawReason:'insufficient-material'});
});

test('claimed draw records validate atomically and reload without resuming an ended game',async()=>{
  const g=game();
  assert.equal(g.restoreGame(record(repeat(cycle,2))),true);
  assert.equal(g.claimDraw(),true);
  const saved=g.exportGame();
  const copy=game();assert.equal(copy.restoreGame(JSON.parse(JSON.stringify(saved))),true);
  assert.equal(copy.getState().drawReason,'threefold');
  globalThis.fetch=()=>assert.fail('A restored drawn game must not request a move');
  await copy.start();
  copy.undo();
  assert.equal(copy.getState().gameOver,false);
  assert.equal(copy.exportGame().drawClaim,undefined);
  assert.equal(copy.getState().halfmoveClock,6);
  assert.deepEqual(copy.getState().drawClaims.current,[]);

  const intended=game();
  assert.equal(intended.restoreGame(record(repeat(cycle,2).slice(0,7),{humanColor:'b'})),true);
  assert.equal(intended.claimDraw('f6g8'),true);
  assert.equal(copy.restoreGame(intended.exportGame()),true);
  assert.equal(copy.getState().moveLog.length,7);
  assert.equal(copy.getState().drawReason,'threefold');
  const before=copy.getState();
  const invalidClaims=[null,{},[],{claimant:'b',reason:'threefold',intendedUci:null},
    {claimant:'w',reason:'fifty-move',intendedUci:null},{claimant:'w',reason:'fivefold',intendedUci:null},
    {claimant:'w',reason:'threefold',intendedUci:'e2e4'}];
  for(const drawClaim of invalidClaims){assert.equal(copy.restoreGame({...saved,drawClaim}),false);assert.deepEqual(copy.getState(),before);}
  assert.equal(copy.restoreGame(record([],{drawClaim:saved.drawClaim})),false);
  assert.deepEqual(copy.getState(),before);
});

test('computer claims a current or intended repetition before requesting any engine move',async()=>{
  globalThis.fetch=()=>assert.fail('A known claim must not contact the engine');
  for(const [moves,humanColor,intendedUci] of [[repeat(cycle,2),'b',null],[repeat(cycle,2).slice(0,7),'w','f6g8']]){
    const g=game();
    assert.equal(g.restoreGame(record(moves,{humanColor})),true);
    assert.equal(g.getState().gameOver,false,'Replay does not claim on the computer’s behalf');
    assert.equal(g.claimDraw(),false,'Human cannot claim on the computer’s turn');
    await g.start();
    assert.equal(g.getState().drawReason,'threefold');
    assert.equal(g.exportGame().drawClaim.intendedUci,intendedUci);
    assert.equal(g.getState().moveLog.length,moves.length);
  }
});

test('bad saved claims leave an active search alive; valid claimed restore rejects its late reply',async()=>{
  let finish,signal;
  globalThis.fetch=(_url,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});};
  const changes=[];
  const g=game({onChange:s=>changes.push(s)});await g.start();play(g,'e2e4');
  await waitFor(()=>Boolean(finish));
  const before=g.getState();const count=changes.length;
  const drawClaim={claimant:'w',reason:'threefold',intendedUci:null};
  assert.equal(g.restoreGame(record([],{drawClaim})),false);
  assert.deepEqual(g.getState(),before);assert.equal(changes.length,count);assert.equal(signal.aborted,false);
  assert.equal(g.restoreGame(record(repeat(cycle,2),{drawClaim})),true);
  assert.equal(signal.aborted,true);
  finish({ok:true,json:async()=>({move:'e7e5'})});await pause(10);
  assert.equal(g.getState().drawReason,'threefold');
  assert.equal(g.getState().moveLog.length,8);
  assert.equal(g.getState().engine.thinking,false);
});

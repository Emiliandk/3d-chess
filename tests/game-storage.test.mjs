import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameStorage} from '../game-storage.js';

test('storage retains a transcript and view mode without rewriting unchanged games',()=>{
  const entries=new Map();let writes=0;
  const backend={getItem:key=>entries.get(key),setItem:(key,value)=>{writes++;entries.set(key,value);}};
  const storage=createGameStorage(()=>backend);
  const game={version:1,moves:['e2e4'],humanColor:'w',targetDepth:9};
  assert.equal(storage.load(),null);
  assert.equal(storage.save(game,'play'),true);
  assert.equal(storage.save(game,'play'),true);
  assert.equal(writes,1);
  assert.deepEqual(createGameStorage(()=>backend).load(),{version:1,game,viewMode:'play'});
  assert.equal(storage.save(game,'room'),true);
  assert.equal(writes,2);
});

test('blocked storage, quota exhaustion and corrupt records never stop play',()=>{
  const blocked=createGameStorage(()=>{throw new Error('blocked');});
  assert.equal(blocked.load(),null);
  assert.equal(blocked.save({moves:[]},'play'),false);
  const full=createGameStorage(()=>({getItem:()=>'{broken',setItem:()=>{throw new Error('quota');}}));
  assert.equal(full.load(),null);
  assert.equal(full.save({moves:[]},'play'),false);
  const oversized=createGameStorage(()=>({getItem:()=>' '.repeat(100001)}));
  assert.equal(oversized.load(),null);
});

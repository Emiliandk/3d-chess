import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,MOUSE,PerspectiveCamera,Raycaster,Spherical,Vector2,Vector3} from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {BOARD_SURFACE_Y,createBoard} from '../board.js';
import {fitChessView} from '../camera.js';
import {pickChessSquare} from '../picking.js';
import {createPieceDrag,projectDragPointer,squareAtPosition} from '../piece-drag.js';
import {createGame} from '../game.js';

// Real camera, raycasting, OrbitControls and chess rules; a small DOM event
// surface and box piece stand-ins keep this independent of WebGL/browser QA.
class Surface{
  listeners=[];captures=new Set();dataset={};style={};hidden=false;clientWidth=1200;clientHeight=800;
  addEventListener(type,handler,options){this.listeners.push({type,handler,capture:options===true||Boolean(options?.capture)});}
  removeEventListener(type,handler,options){const capture=options===true||Boolean(options?.capture);this.listeners=this.listeners.filter(item=>!(item.type===type&&item.handler===handler&&item.capture===capture));}
  getBoundingClientRect(){return {left:40,top:20,width:this.clientWidth,height:this.clientHeight};}
  getRootNode(){return this.root;}
  setPointerCapture(id){this.captures.add(id);}
  hasPointerCapture(id){return this.captures.has(id);}
  releasePointerCapture(id){this.captures.delete(id);this.emit('lostpointercapture',{pointerId:id});}
  focus(){this.emit('focus');}
  emit(type,details={}){
    const event={type,pointerId:1,pointerType:'mouse',button:0,buttons:1,isPrimary:true,
      ctrlKey:false,shiftKey:false,metaKey:false,defaultPrevented:false,stopped:false,
      preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...details};
    for(const listener of [...this.listeners].filter(item=>item.type===type).sort((a,b)=>Number(b.capture)-Number(a.capture))){listener.handler(event);if(event.stopped)break;}
    return event;
  }
}
const apps=[];
afterEach(()=>{for(const app of apps.splice(0)){app.drag.dispose();app.controls.dispose();app.game.dispose();}});
const square=name=>({r:8-Number(name[1]),c:name.charCodeAt(0)-97});
function setup({azimuth=.28,polar=.84,moves=[],allowed=true,humanColor='w'}={}){
  const canvas=new Surface(),windowTarget=new Surface(),documentTarget=new Surface();canvas.root=documentTarget;
  const camera=new PerspectiveCamera(38,canvas.clientWidth/canvas.clientHeight,.1,150);
  const controls=new OrbitControls(camera,canvas);controls.target.set(0,.25,0);controls.enableDamping=true;controls.enablePan=false;
  controls.mouseButtons={LEFT:MOUSE.ROTATE,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.ROTATE};
  fitChessView(camera,controls.target,{azimuth,polar,viewMode:'play'});controls.update();
  let drag;
  const game=createGame({onChange:()=>drag?.reconcile()});
  if(moves.length||humanColor==='b')assert.equal(game.restoreGame({version:1,humanColor,targetDepth:3,moves}),true);
  const pieces=new Group(),meshes=new Map(),material=new MeshBasicMaterial();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(game.getState().board[r][c]){
    const piece=new Group();piece.position.set(c-3.5,BOARD_SURFACE_Y,r-3.5);piece.userData.square={r,c};
    const mesh=new Mesh(new BoxGeometry(.5,1,.5),material);mesh.position.y=.5;piece.add(mesh);pieces.add(piece);meshes.set(`${r},${c}`,piece);
  }
  const board=createBoard({walnut:material,brass:material,darkTrim:material,lightTile:material,darkTile:material});
  board.group.updateMatrixWorld(true);pieces.updateMatrixWorld(true);
  const screen=point=>{const projected=point.clone().project(camera),rect=canvas.getBoundingClientRect();return {clientX:rect.left+(projected.x+1)*rect.width/2,clientY:rect.top+(1-projected.y)*rect.height/2};};
  const pointer=new Vector2(),raycaster=new Raycaster(),clicks=[],drops=[];
  const app={canvas,camera,controls,game,meshes,windowTarget,documentTarget,allowed,screen,clicks,drops};
  drag=createPieceDrag({canvas,camera,controls,windowTarget,documentTarget,
    getState:game.getState,canMove:()=>app.allowed,getPiece:from=>meshes.get(`${from.r},${from.c}`),
    pick:event=>{const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);return pickChessSquare({raycaster,pointer,camera,squares:board.squares,pieces:pieces.children,width:rect.width,height:rect.height});},
    select:from=>{game.clearSelection();game.selectSquare(from.r,from.c);},
    click:from=>{clicks.push(from);game.selectSquare(from.r,from.c);},
    drop:(from,to)=>{drops.push({from,to});game.selectSquare(to.r,to.c);}});
  app.drag=drag;
  app.press=name=>{
    const from=square(name),piece=meshes.get(`${from.r},${from.c}`),origin=piece.position.clone();
    const event=screen(origin.clone().add(new Vector3(0,.8,0)));
    projectDragPointer({event,canvas,camera,height:BOARD_SURFACE_Y,raycaster});
    const hit=raycaster.intersectObject(piece,true)[0];assert.ok(hit);
    const grabbed=hit.point.clone().sub(origin);
    const down=canvas.emit('pointerdown',event);
    return {piece,origin,event,grabbed,down};
  };
  app.destination=(press,name)=>{const to=square(name);return screen(new Vector3(to.c-3.5,BOARD_SURFACE_Y+.14,to.r-3.5).add(press.grabbed));};
  app.release=(press,name)=>{const event=app.destination(press,name);canvas.emit('pointermove',event);canvas.emit('pointerup',{...event,buttons:0});};
  apps.push(app);return app;
}

test('drag projection and board bounds remain correct through a full orbit and desktop aspect ratios',()=>{
  for(const aspect of [1,1.5,2.4])for(const polar of [.3,.84,1.28])for(let angle=0;angle<8;angle++){
    const camera=new PerspectiveCamera(38,aspect,.1,150),target=new Vector3(0,.25,0),canvas=new Surface();
    camera.position.copy(target).add(new Vector3().setFromSpherical(new Spherical(22,polar,angle*Math.PI/4)));camera.lookAt(target);camera.updateMatrixWorld();
    for(const point of [new Vector3(-3.5,1,3.5),new Vector3(2.5,1,-2.5)]){
      const p=point.clone().project(camera),rect=canvas.getBoundingClientRect();
      const actual=projectDragPointer({event:{clientX:rect.left+(p.x+1)*rect.width/2,clientY:rect.top+(1-p.y)*rect.height/2},canvas,camera,height:1});
      assert.ok(actual.distanceTo(point)<1e-10);
    }
  }
  assert.deepEqual(squareAtPosition({x:-4,z:-4}),{r:0,c:0});
  assert.deepEqual(squareAtPosition({x:3.999,z:3.999}),{r:7,c:7});
  for(const point of [{x:4,z:0},{x:0,z:-4.001},{x:NaN,z:0}])assert.equal(squareAtPosition(point),null);
});

test('grabbing and moving a pawn from eight camera angles commits only its legal destination and freezes the camera',()=>{
  for(let angle=0;angle<8;angle++){
    const app=setup({azimuth:angle*Math.PI/4}),press=app.press('e2'),cameraBefore=app.camera.position.clone();
    assert.equal(app.controls.enabled,false);assert.equal(app.canvas.hasPointerCapture(1),true);
    const event=app.destination(press,'e4');app.canvas.emit('pointermove',event);
    assert.deepEqual(app.drag.getTarget(),square('e4'));
    assert.ok(Math.abs(press.piece.position.x-.5)<1e-10);assert.ok(Math.abs(press.piece.position.z-.5)<1e-10);
    assert.ok(app.camera.position.distanceTo(cameraBefore)<1e-10);
    assert.equal(app.game.getState().moveLog.length,0,'holding the piece does not change the game');
    app.canvas.emit('pointerup',{...event,buttons:0});
    assert.deepEqual(app.game.exportGame().moves,['e2e4']);assert.equal(app.drops.length,1);assert.equal(app.clicks.length,0);
    assert.ok(press.piece.position.equals(press.origin));assert.equal(app.controls.enabled,true);assert.equal(app.controls.enableDamping,true);
    assert.equal(app.canvas.hasPointerCapture(1),false);
  }
});

test('a short press preserves click selection while dragging an empty area or right-clicking still rotates the camera',()=>{
  const app=setup(),press=app.press('e2');
  app.canvas.emit('pointerup',{...press.event,clientX:press.event.clientX+2,buttons:0});
  assert.deepEqual(app.game.getState().selected,square('e2'));assert.equal(app.clicks.length,1);assert.equal(app.drops.length,0);
  for(const [point,button] of [[new Vector3(-2,BOARD_SURFACE_Y,0),0],[new Vector3(.5,1,2.5),2]]){
    const event=app.screen(point),before=app.camera.position.clone();
    assert.equal(app.canvas.emit('pointerdown',{...event,button}).stopped,false);
    app.canvas.emit('pointermove',{...event,button,clientX:event.clientX+60});
    app.canvas.emit('pointerup',{...event,button,buttons:0});
    assert.ok(app.camera.position.distanceTo(before)>.1);
    assert.equal(app.controls.enabled,true);
  }
});

test('illegal, occupied, off-board and outside-canvas drops restore the piece without moves',()=>{
  for(const destination of ['e5','d2','off-board','outside-canvas']){
    const app=setup(),press=app.press('e2');
    const event=destination==='off-board'?app.screen(new Vector3(5,1,0)):destination==='outside-canvas'?{clientX:0,clientY:0}:app.destination(press,destination);
    app.canvas.emit('pointermove',event);assert.equal(app.drag.getTarget(),null);
    app.canvas.emit('pointerup',{...event,buttons:0});
    assert.equal(app.game.getState().moveLog.length,0);assert.equal(app.drops.length,0);
    assert.ok(press.piece.position.equals(press.origin));assert.equal(app.controls.enabled,true);
  }
});

test('cancel, lost capture, Escape, blur, hidden tabs and disposal restore position and camera ownership',()=>{
  for(const reason of ['pointercancel','lostpointercapture','keydown','blur','window-blur','hidden','dispose','cancel','buttons']){
    const app=setup(),press=app.press('e2'),event=app.destination(press,'e4');app.canvas.emit('pointermove',event);
    if(reason==='window-blur')app.windowTarget.emit('blur');
    else if(reason==='hidden'){app.documentTarget.hidden=true;app.documentTarget.emit('visibilitychange');}
    else if(reason==='dispose')app.drag.dispose();
    else if(reason==='cancel')app.drag.cancel();
    else if(reason==='buttons')app.canvas.emit('pointermove',{...event,buttons:0});
    else app.canvas.emit(reason,{key:'Escape'});
    assert.ok(press.piece.position.equals(press.origin),reason);assert.equal(app.controls.enabled,true,reason);
    assert.equal(app.game.getState().moveLog.length,0);assert.equal(app.drag.getTarget(),null);
    assert.equal(app.canvas.hasPointerCapture(1),false);
  }
});

test('unconfirmed games, opponent pieces, computer turns and ended games cannot be grabbed',()=>{
  const blocked=setup({allowed:false});assert.equal(blocked.press('e2').down.stopped,false);assert.equal(blocked.controls.enabled,true);
  const opponent=setup();opponent.press('e7');assert.equal(opponent.controls.enabled,true);
  const computer=setup({moves:['e2e4']});computer.press('d2');assert.equal(computer.controls.enabled,true);
  const ended=setup({moves:['f2f3','e7e5','g2g4','d8h4']});ended.press('e2');assert.equal(ended.controls.enabled,true);
});

test('a new position or cleared selection cancels an in-progress drag before a stale drop',()=>{
  for(const change of ['newGame','clearSelection']){
    const app=setup(),press=app.press('e2'),event=app.destination(press,'e4');app.canvas.emit('pointermove',event);
    // A same-color reset can have an identical FEN; clearing its selection is
    // also part of invalidating ownership of a drag.
    if(change==='newGame')app.game.newGame();else app.game.clearSelection();
    assert.ok(press.piece.position.equals(press.origin));assert.equal(app.controls.enabled,true);
    app.canvas.emit('pointerup',{...event,buttons:0});assert.equal(app.game.getState().moveLog.length,0);
  }
});

test('dragging captures, castles and takes en passant through the existing chess rules',()=>{
  const cases=[
    {moves:['e2e4','d7d5'],from:'e4',to:'d5',check:state=>assert.equal(state.board[3][3].color,'w')},
    {moves:['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6'],from:'e1',to:'g1',check:state=>assert.equal(state.board[7][5].type,'r')},
    {moves:['e2e4','a7a6','e4e5','d7d5'],from:'e5',to:'d6',check:state=>assert.equal(state.board[3][3],null)}
  ];
  for(const fixture of cases){
    const app=setup(fixture),press=app.press(fixture.from);app.release(press,fixture.to);
    assert.equal(app.game.exportGame().moves.at(-1),fixture.from+fixture.to);fixture.check(app.game.getState());
    app.game.undo();assert.deepEqual(app.game.exportGame().moves,fixture.moves);
  }
});

test('a dragged promotion waits for the chosen piece and supports underpromotion',()=>{
  const moves=['a2a4','h7h5','a4a5','h5h4','a5a6','h4h3','a6b7','h3g2'];
  const app=setup({moves}),press=app.press('b7');app.release(press,'a8');
  assert.deepEqual(app.game.getState().pendingPromotion.from,square('b7'));
  assert.deepEqual(app.game.exportGame().moves,moves);
  assert.ok(press.piece.position.equals(press.origin));assert.equal(app.controls.enabled,true);
  app.game.promote('n');assert.equal(app.game.getState().board[0][0].type,'n');assert.equal(app.game.exportGame().moves.at(-1),'b7a8n');
});

test('a legal black pawn is draggable on the human black turn',()=>{
  const app=setup({moves:['e2e4'],humanColor:'b',azimuth:Math.PI+.28}),press=app.press('e7');app.release(press,'e5');
  assert.deepEqual(app.game.exportGame().moves,['e2e4','e7e5']);
});

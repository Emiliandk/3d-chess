import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {BOARD_SURFACE_Y,createBoard} from '../board.js';
import {fitChessView} from '../camera.js';
import {pickChessSquare} from '../picking.js';

const pieceNames={p:'pawn',r:'rook',n:'knight',b:'bishop',q:'queen',k:'king'};
const loader=new GLTFLoader();
const templates=Object.fromEntries(await Promise.all(Object.entries(pieceNames).map(async([type,name])=>{
  const data=await readFile(new URL(`../assets/${name}.glb`,import.meta.url));
  const gltf=await loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  return [type,gltf.scene];
})));

// This is the actual board geometry and full opening position, with the same
// model transforms/collars as scene.js. Lighting and browser events are outside
// this numeric raycast fixture; the GLB silhouettes are not approximated.
function fixture({width=1400,height=1000,azimuth=.28,polar=.62}={}) {
  const material=new THREE.MeshBasicMaterial();
  const world=new THREE.Scene();
  const board=createBoard({walnut:material,brass:material,darkTrim:material,lightTile:material,darkTile:material});
  world.add(board.group);
  const pieceRoot=new THREE.Group();
  world.add(pieceRoot);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++) {
    const type=r===0||r===7?'rnbqkbnr'[c]:r===1||r===6?'p':null;
    if(!type)continue;
    const group=templates[type].clone(true);
    group.scale.set(1.208,1,1.208);
    group.position.set(c-3.5,BOARD_SURFACE_Y,r-3.5);
    if(r<2)group.rotation.y=Math.PI;
    group.userData.square={r,c};
    group.traverse(node=>{if(node.isMesh)node.material=material;});
    const collar=new THREE.Mesh(new THREE.CylinderGeometry(type==='n'?.173:.205,type==='n'?.185:.21,.035,48),material);
    collar.position.y=type==='n'?.384:.055;
    group.add(collar);
    pieceRoot.add(group);
  }
  world.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(38,width/height,.1,150);
  fitChessView(camera,new THREE.Vector3(0,.25,0),{viewMode:'play',azimuth,polar});
  const raycaster=new THREE.Raycaster();
  const findPiece=(r,c)=>pieceRoot.children.find(piece=>piece.userData.square.r===r&&piece.userData.square.c===c);
  function project(point) {
    const p=point.clone().project(camera);
    return new THREE.Vector2(p.x,p.y);
  }
  function onPiece(piece,x=0,y=1,z=0) {
    return project(new THREE.Vector3(x,y,z).applyMatrix4(piece.matrixWorld));
  }
  function exact(pointer) {
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects([...board.squares,...pieceRoot.children],true)[0];
    let node=hit?.object;
    while(node&&!node.userData.square)node=node.parent;
    return node?.userData.square||null;
  }
  function pick(pointer,options={}) {
    return pickChessSquare({raycaster,pointer,camera,squares:board.squares,pieces:pieceRoot.children,width,height,...options});
  }
  return {world,pieceRoot,camera,findPiece,project,onPiece,exact,pick,width,height};
}

const b1={r:7,c:1},b2={r:6,c:1};

test('a click less than three CSS pixels from the knight head selects b1 instead of the b2 tile behind it',()=>{
  for(const [width,height] of [[1400,1000],[1088,499],[980,700],[420,700]]) {
    const f=fixture({width,height});
    const pointer=f.onPiece(f.findPiece(7,1),0,1.16,-.15);
    assert.deepEqual(f.exact(pointer),b2,`${width}×${height}: the original picking must reproduce the reported background-square selection`);
    // This independently proves that actual knight triangles are within the
    // promised tolerance. It does not depend on the helper's sampling pattern.
    const inside=pointer.clone();
    inside.y-=2*2.8/height;
    assert.deepEqual(f.exact(inside),b1,`${width}×${height}: a real knight surface must be less than 3 CSS pixels away`);
    assert.deepEqual(f.pick(pointer),b1,`${width}×${height}: the edge click should select the knight`);
    assert.deepEqual(f.pick(pointer,{tolerance:0}),b2,`${width}×${height}: disabling tolerance should preserve exact picking`);
  }
});

test('direct hits on knight heads and other pawns keep their own square after rotation',()=>{
  for(const [azimuth,polar,row,pawnRow] of [[.28,.62,7,6],[1.0,.84,7,6],[Math.PI+.28,.62,0,1],[Math.PI+1,.84,0,1]]) {
    const f=fixture({azimuth,polar});
    const knightPoint=f.onPiece(f.findPiece(row,1),0,1,0);
    assert.deepEqual(f.exact(knightPoint),{r:row,c:1});
    assert.deepEqual(f.pick(knightPoint),{r:row,c:1});
    const pawnPoint=f.onPiece(f.findPiece(pawnRow,1),0,.76,0);
    assert.deepEqual(f.exact(pawnPoint),{r:pawnRow,c:1});
    assert.deepEqual(f.pick(pawnPoint),{r:pawnRow,c:1});
  }
});

test('an exact pawn hit takes precedence even with a large nearby-knight allowance',()=>{
  const f=fixture();
  const pointer=f.onPiece(f.findPiece(6,1),0,.76,0);
  assert.deepEqual(f.exact(pointer),b2);
  assert.deepEqual(f.pick(pointer,{tolerance:40}),b2);
});

test('empty board squares and space beyond the board remain usable',()=>{
  for(const [width,height] of [[1400,1000],[420,700]]) {
    const f=fixture({width,height});
    const pointer=f.project(new THREE.Vector3(.5,BOARD_SURFACE_Y,.5));
    assert.deepEqual(f.exact(pointer),{r:4,c:4});
    assert.deepEqual(f.pick(pointer),{r:4,c:4});
    assert.equal(f.pick(new THREE.Vector2(.98,.98)),null);
  }
});

test('moving and removing a knight updates the square used by head and silhouette clicks',()=>{
  const f=fixture();
  const knight=f.findPiece(7,1);
  const originalEdge=f.onPiece(knight,0,1.16,-.15);
  assert.deepEqual(f.pick(originalEdge),b1);
  knight.position.set(-1.5,BOARD_SURFACE_Y,1.5);
  knight.userData.square={r:5,c:2};
  f.world.updateMatrixWorld(true);
  const movedHead=f.onPiece(knight,0,1,0);
  assert.deepEqual(f.pick(movedHead),{r:5,c:2});
  assert.notDeepEqual(f.pick(originalEdge),b1,'the original silhouette must not retain the moved knight');
  f.pieceRoot.remove(knight);
  f.world.updateMatrixWorld(true);
  const exposedSquare=f.exact(movedHead);
  assert.notDeepEqual(exposedSquare,{r:5,c:2},'the head projection must expose a different board square after removal');
  assert.deepEqual(f.pick(movedHead),exposedSquare,'a removed knight must not remain a picking target');
});

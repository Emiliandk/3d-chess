import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,MeshBasicMaterial,Raycaster,Vector3} from '../vendor/three.module.js';
import {BOARD_SURFACE_Y,createBoard} from '../board.js';

function boardFixture() {
  const materials={
    walnut:new MeshBasicMaterial({color:0x543521}),
    brass:new MeshBasicMaterial({color:0xb99753}),
    darkTrim:new MeshBasicMaterial({color:0x17130f}),
    lightTile:new MeshBasicMaterial({color:0xe9c688}),
    darkTile:new MeshBasicMaterial({color:0x211c18})
  };
  const board=createBoard(materials);
  board.group.updateMatrixWorld(true);
  return {...board,materials};
}

test('all 64 squares are the visible surface from above and throughout camera rotation',()=>{
  const {group,squares}=boardFixture();
  const raycaster=new Raycaster();
  const directions=[new Vector3(0,1,0)];
  for(const polar of [.65,1.28])for(let step=0;step<8;step++) {
    const azimuth=step*Math.PI/4;
    directions.push(new Vector3(Math.sin(polar)*Math.sin(azimuth),Math.cos(polar),Math.sin(polar)*Math.cos(azimuth)));
  }
  for(const square of squares)for(const view of directions) {
    const target=new Vector3(square.position.x,BOARD_SURFACE_Y,square.position.z);
    raycaster.set(target.clone().addScaledVector(view,20),view.clone().negate());
    // Include the entire frame: picking only tiles would miss the original occlusion bug.
    const hit=raycaster.intersectObject(group,true)[0];
    assert.equal(hit?.object,square,`${square.name} is hidden from ${view.toArray()}`);
    assert.ok(Math.abs(hit.point.y-BOARD_SURFACE_Y)<1e-7);
  }
});

test('the playing area has full 8 by 8 coverage and correct alternating square colours',()=>{
  const {group,squares,materials}=boardFixture();
  assert.equal(squares.length,64);
  assert.equal(new Set(squares.map(square=>`${square.userData.square.r},${square.userData.square.c}`)).size,64);
  const bounds=new Box3();
  let totalArea=0;
  const raycaster=new Raycaster();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++) {
    const square=squares.find(tile=>tile.userData.square.r===r&&tile.userData.square.c===c);
    assert.ok(square,`missing ${'abcdefgh'[c]}${8-r}`);
    assert.equal(square.material,(r+c)%2===0?materials.lightTile:materials.darkTile);
    const tileBounds=new Box3().setFromObject(square);
    bounds.union(tileBounds);
    totalArea+=(tileBounds.max.x-tileBounds.min.x)*(tileBounds.max.z-tileBounds.min.z);
    // Probe close to every corner as well as the centre, catching gaps and frame intrusion.
    for(const dx of [-.499,0,.499])for(const dz of [-.499,0,.499]) {
      raycaster.set(new Vector3(c-3.5+dx,5,r-3.5+dz),new Vector3(0,-1,0));
      const hit=raycaster.intersectObject(group,true)[0];
      assert.equal(hit?.object,square,`uncovered area on ${square.name}`);
    }
  }
  assert.equal(bounds.min.x,-4);
  assert.equal(bounds.max.x,4);
  assert.equal(bounds.min.z,-4);
  assert.equal(bounds.max.z,4);
  assert.equal(totalArea,64);
  assert.equal(squares.find(square=>square.name==='square-a8').material,materials.lightTile);
  assert.equal(squares.find(square=>square.name==='square-a1').material,materials.darkTile);
});

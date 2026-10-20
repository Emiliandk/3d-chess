import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,MeshStandardMaterial,PerspectiveCamera,Spherical,Texture,Vector3} from '../vendor/three.module.js';
import {createTablePedestal} from '../table-pedestal.js';
import {createCognacProps} from '../cognac-props.js';
import {fitChessOrbit,fitChessView} from '../camera.js';

function setup(){
  const wood=new Texture(),brass=new MeshStandardMaterial();
  return {wood,brass,pedestal:createTablePedestal({woodTexture:wood,brass})};
}

test('solid support meets the existing tabletop without entering the board or picking targets',()=>{
  const {pedestal,wood,brass}=setup();
  const bounds=new Box3().setFromObject(pedestal.group);
  assert.ok(Math.abs(bounds.max.y+.91)<1e-5,'the apron must touch the existing tabletop underside');
  assert.ok(bounds.min.y< -9&&bounds.max.x<8&&bounds.max.z<7);
  for(const mesh of pedestal.group.children){
    for(const attribute of Object.values(mesh.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
    const hits=[];mesh.raycast({},hits);assert.equal(hits.length,0);
  }
  let woodDisposed=false,brassDisposed=false;
  wood.addEventListener('dispose',()=>woodDisposed=true);brass.addEventListener('dispose',()=>brassDisposed=true);
  pedestal.dispose();
  assert.equal(woodDisposed,false);assert.equal(brassDisposed,false);
});

test('desktop room framing fits the tabletop, pedestal and chess props through a complete orbit',()=>{
  const {pedestal}=setup(),props=createCognacProps({bottleTexture:new Texture()});
  const framingPoints=[...props.framingPoints,...pedestal.framingPoints];
  const target=new Vector3(0,.25,0);
  for(const [w,h] of [[800,666],[1100,700],[1512,900],[1920,1080]]){
    const camera=new PerspectiveCamera(38,w/h,.1,150);
    for(const polar of [.84,1.12,1.28]){
      const radius=fitChessOrbit(camera,target,{viewMode:'room',polar,framingPoints});
      assert.ok(radius<=56,'the support must remain within the existing zoom limit');
      for(let i=0;i<128;i++){
        camera.position.copy(target).add(new Vector3().setFromSpherical(new Spherical(radius,polar,i*Math.PI/64)));
        camera.lookAt(target);camera.updateMatrixWorld();
        for(const point of framingPoints){
          const p=point.clone().project(camera);
          assert.ok(Math.abs(p.x)<.94&&Math.abs(p.y)<.94&&p.z<1,`furniture clipped at ${w} × ${h}`);
        }
      }
    }
    const play=new PerspectiveCamera(38,w/h,.1,150),unchanged=play.clone();
    fitChessView(play,target,{viewMode:'play',framingPoints});
    fitChessView(unchanged,target,{viewMode:'play'});
    assert.ok(play.position.distanceTo(unchanged.position)<1e-12,'support must not shrink the play view');
  }
  props.dispose();pedestal.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Texture,Vector3} from '../vendor/three.module.js';
import {fitBoardCamera,fitChessView} from '../camera.js';
import {createCognacProps} from '../cognac-props.js';
test('full 3D frame and tallest pieces fit at phone, tablet and desktop aspect ratios',()=>{
 for(const [w,h] of [[898,666],[750,620],[430,620],[354,440],[284,440],[1350,800]])for(const azimuth of [.28,Math.PI+.28]){
  const camera=new PerspectiveCamera(38,w/h,.1,150);
  fitBoardCamera(camera,new Vector3(0,.25,0),{azimuth});
  for(const x of [-4.84,4.84])for(const y of [-.51,1.60])for(const z of [-4.84,4.84]){
   const p=new Vector3(x,y,z).project(camera);
   assert.ok(Math.abs(p.x)<=.881&&Math.abs(p.y)<=.881,`clipped at ${w} × ${h}`);
  }
 }
});

test('play view fits the frame and tallest pieces at orbit angles on narrow screens',()=>{
 const target=new Vector3(0,.25,0);
 for(const [w,h] of [[282,440],[354,440],[430,620],[750,620]]){
  for(const polar of [.12,.62,.84,1.28])for(let azimuth=0;azimuth<2*Math.PI;azimuth+=Math.PI/8){
   const camera=new PerspectiveCamera(38,w/h,.1,150);
   const distance=fitChessView(camera,target,{viewMode:'play',azimuth,polar});
   assert.ok(distance>=10&&distance<=56,'play view must fit within the available orbit zoom');
   for(const x of [-4.84,4.84])for(const y of [-.51,1.60])for(const z of [-4.84,4.84]){
    const point=new Vector3(x,y,z).project(camera);
    assert.ok(Math.abs(point.x)<=.921&&Math.abs(point.y)<=.921&&point.z<1,
     `play view clipped at ${w} × ${h}, azimuth ${azimuth}, polar ${polar}`);
   }
  }
 }
});

test('play view gives the playable squares materially more screen area than room view on mobile',()=>{
 const props=createCognacProps({bottleTexture:new Texture()});
 const target=new Vector3(0,.25,0);
 function boardArea(camera){
  const points=[[-4,-4],[4,-4],[4,4],[-4,4]].map(([x,z])=>new Vector3(x,.1,z).project(camera));
  return Math.abs(points.reduce((sum,point,index)=>{
   const next=points[(index+1)%points.length];
   return sum+point.x*next.y-next.x*point.y;
  },0))/2;
 }
 for(const [w,h] of [[282,440],[354,440],[430,620],[750,620]])for(const azimuth of [.28,Math.PI+.28]){
  const play=new PerspectiveCamera(38,w/h,.1,150),room=play.clone();
  for(const [camera,viewMode] of [[play,'play'],[room,'room']]){
   fitChessView(camera,target,{viewMode,azimuth,framingPoints:props.framingPoints});
  }
  assert.ok(boardArea(play)>boardArea(room)*1.5,`play view should enlarge squares noticeably at ${w} × ${h}`);
 }
 props.dispose();
});

test('view fitting retains a chosen orbit angle across portrait, landscape and fullscreen sizes',()=>{
 const target=new Vector3(0,.25,0);
 const props=createCognacProps({bottleTexture:new Texture()});
 for(const viewMode of ['play','room'])for(const [azimuth,polar] of [[-.7,.38],[2.4,1.1]]){
  const expected=new Vector3(Math.sin(azimuth)*Math.sin(polar),Math.cos(polar),Math.cos(azimuth)*Math.sin(polar));
  const camera=new PerspectiveCamera(38,1,.1,150);
  for(const [w,h] of [[354,440],[800,430],[1350,800]]){
   camera.aspect=w/h;camera.updateProjectionMatrix();
   fitChessView(camera,target,{viewMode,azimuth,polar,framingPoints:props.framingPoints});
   const actual=camera.position.clone().sub(target).normalize();
   assert.ok(actual.distanceTo(expected)<1e-12,'resizing must not change the player’s chosen angle');
  }
 }
 props.dispose();
});

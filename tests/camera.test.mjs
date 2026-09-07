import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from '../vendor/three.module.js';
import {fitBoardCamera} from '../camera.js';
test('full 3D frame and tallest pieces fit at phone, tablet and desktop aspect ratios',()=>{
 for(const [w,h] of [[898,666],[750,620],[430,620],[354,440],[284,440],[1350,800]])for(const azimuth of [.28,Math.PI+.28]){
  const camera=new PerspectiveCamera(38,w/h,.1,150);
  fitBoardCamera(camera,new Vector3(0,.25,0),{azimuth});
  for(const x of [-4.84,4.84])for(const y of [-.51,1.58])for(const z of [-4.84,4.84]){
   const p=new Vector3(x,y,z).project(camera);
   assert.ok(Math.abs(p.x)<=.881&&Math.abs(p.y)<=.881,`clipped at ${w} × ${h}`);
  }
 }
});

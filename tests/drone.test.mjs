import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Spherical,Texture,Vector3} from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {fitChessView,fitChessOrbit} from '../camera.js';
import {createCognacProps} from '../cognac-props.js';
import {createDroneFlight,DRONE_ORBIT_SECONDS} from '../drone.js';

function setup(){
  const camera=new PerspectiveCamera(38,898/666,.1,150);
  const controls=new OrbitControls(camera,null);
  controls.target.set(0,.25,0);controls.enableDamping=true;
  fitChessView(camera,controls.target);controls.update();
  const changes=[];
  const drone=createDroneFlight({camera,controls,
    fitOrbit:angles=>fitChessOrbit(camera,controls.target,angles),
    onChange:state=>changes.push(state)});
  return {camera,controls,drone,changes};
}
const angle=({camera,controls})=>new Spherical().setFromVector3(camera.position.clone().sub(controls.target));

test('drone completes 360 degrees in 90 seconds at a constant radius and height, looking at the board',()=>{
  const app=setup(),{camera,controls,drone}=app;
  assert.equal(DRONE_ORBIT_SECONDS,90);
  drone.start();const origin=camera.position.clone(),initial=angle(app);
  drone.update(0);let swept=0,previous=initial.theta;
  for(let time=100;time<=90000;time+=100){
    assert.equal(drone.update(time),true);
    const pose=angle(app);
    swept+=Math.atan2(Math.sin(pose.theta-previous),Math.cos(pose.theta-previous));previous=pose.theta;
    assert.ok(Math.abs(pose.radius-initial.radius)<1e-10);
    assert.ok(Math.abs(camera.position.y-origin.y)<1e-10);
    const towardBoard=controls.target.clone().sub(camera.position).normalize();
    assert.ok(camera.getWorldDirection(new Vector3()).distanceTo(towardBoard)<1e-10);
  }
  assert.ok(Math.abs(swept-2*Math.PI)<1e-9);
  assert.ok(camera.position.distanceTo(origin)<1e-9);
});

test('pause, hidden tabs and resuming preserve angle without advancing through suspended time',()=>{
  const app=setup(),{camera,controls,drone}=app;
  drone.start();drone.update(0);drone.update(100);
  drone.pause();const paused=camera.position.clone();
  assert.equal(controls.enableDamping,true);
  drone.update(60000);assert.ok(camera.position.equals(paused));
  drone.start();drone.update(120000);assert.ok(camera.position.distanceTo(paused)<1e-10);
  drone.update(120100);const visible=camera.position.clone();
  drone.update(121000,{hidden:true});drone.update(900000,{hidden:true});
  assert.ok(camera.position.equals(visible));
  drone.update(900100);assert.ok(camera.position.equals(visible));
  drone.update(900200);const beforeSlow=angle(app).theta;
  drone.update(990000);const afterSlow=angle(app).theta;
  assert.ok(Math.abs(afterSlow-beforeSlow-2*Math.PI/900)<1e-10,'slow frames are capped to a small step');
});

test('reduced motion blocks startup, stops an active orbit, and does not restart automatically',()=>{
  const {camera,drone,changes}=setup();
  drone.setReducedMotion(true);assert.equal(drone.start(),false);
  assert.deepEqual(drone.getState(),{running:false,reducedMotion:true});
  drone.setReducedMotion(false);assert.equal(drone.getState().running,false);
  drone.start();drone.update(0);drone.update(100);
  drone.setReducedMotion(true);const position=camera.position.clone();
  drone.update(200);assert.ok(camera.position.equals(position));
  assert.deepEqual(changes.at(-1),{running:false,reducedMotion:true});
});

test('the slow orbit limits redraws while preserving elapsed time between frames',()=>{
  const app=setup(),{drone}=app;
  drone.start();const initial=angle(app).theta;
  assert.equal(drone.update(0),false);
  for(const time of [10,20,30])assert.equal(drone.update(time),false);
  assert.equal(drone.update(40),true);
  assert.ok(Math.abs(angle(app).theta-initial-2*Math.PI/90*.04)<1e-10);
});

test('desktop orbit keeps the complete board and room props in frame through every angle',()=>{
  const props=createCognacProps({bottleTexture:new Texture()});
  const corners=[];
  for(const x of [-4.84,4.84])for(const y of [-.51,1.60])for(const z of [-4.84,4.84])corners.push(new Vector3(x,y,z));
  const target=new Vector3(0,.25,0);
  for(const [width,height] of [[600,620],[898,666],[1350,800],[500,700]]){
    for(const viewMode of ['play','room'])for(const polar of [.62,.84,1.28]){
      const camera=new PerspectiveCamera(38,width/height,.1,150);
      const distance=fitChessOrbit(camera,target,{viewMode,polar,framingPoints:props.framingPoints});
      assert.ok(distance<=56,'route must remain within OrbitControls distance limits');
      const points=[...corners,...(viewMode==='room'?props.framingPoints:[])];
      // Use finer angles than the fit samples, including halfway between them.
      for(let step=0;step<128;step++){
        camera.position.copy(target).add(new Vector3().setFromSpherical(new Spherical(distance,polar,step*Math.PI/64)));
        camera.lookAt(target);camera.updateMatrixWorld();
        for(const point of points){
          const projected=point.clone().project(camera);
          assert.ok(Math.abs(projected.x)<.94&&Math.abs(projected.y)<.94&&projected.z<1,
            `clipped at ${width}x${height}, ${viewMode}, angle ${step}`);
        }
      }
    }
  }
  props.dispose();
});

test('refitting during a flight preserves its angle and elevation across desktop resizing',()=>{
  const app=setup(),{camera,drone}=app;
  drone.start();drone.update(0);drone.update(100);const initial=angle(app);
  camera.aspect=600/620;camera.updateProjectionMatrix();drone.refit();
  const fitted=angle(app);
  assert.ok(Math.abs(fitted.theta-initial.theta)<1e-12);
  assert.ok(Math.abs(fitted.phi-initial.phi)<1e-12);
  drone.update(200);assert.ok(Math.abs(angle(app).radius-fitted.radius)<1e-10);
});

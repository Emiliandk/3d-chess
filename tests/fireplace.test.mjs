import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createFireplace,panoramaDirection} from '../fireplace.js';

// These tests exercise real geometry, camera matrices and animation scheduling.
// Shader compilation, colour matching, feathering and document visibility are
// verified in the browser rather than simulated by this fixture.
const panoramaSize={width:1774,height:887};
const region={left:574,right:676,top:493,bottom:567};
const rotation=1.5;
const center=panoramaDirection(625/panoramaSize.width,530/panoramaSize.height)
  .applyAxisAngle(new THREE.Vector3(0,1,0),rotation);

function assertVector(actual,expected,message,tolerance=1e-6) {
  assert.ok(actual.distanceTo(expected)<tolerance,`${message}: ${actual.toArray()} vs ${expected.toArray()}`);
}

function fixture() {
  // A PMREM texture has three cube faces across and four down. No WebGL or
  // texture upload is needed to test the geometry and frame scheduling.
  const environment=new THREE.Texture({width:768,height:1024});
  const fire=createFireplace({environment,rotation});
  const world=new THREE.Scene();
  world.add(fire.mesh);
  const camera=new THREE.PerspectiveCamera(38,1.6,.1,150);
  function look(position,direction=center) {
    camera.position.copy(position);
    camera.lookAt(position.clone().add(direction));
    camera.updateMatrixWorld(true);
  }
  look(new THREE.Vector3(3,5,12));
  return {fire,world,camera,environment,look};
}

test('panorama coordinates use the expected cardinal directions and image top/bottom',()=>{
  for(const [u,v,expected] of [
    [.5,.5,[1,0,0]],[.75,.5,[0,0,1]],[.25,.5,[0,0,-1]],
    [0,.5,[-1,0,0]],[.5,0,[0,1,0]],[.5,1,[0,-1,0]]
  ])assertVector(panoramaDirection(u,v),new THREE.Vector3(...expected),`panorama (${u},${v})`);
});

test('every patch vertex aligns with its original panorama pixel after background rotation',()=>{
  const {fire}=fixture();
  try {
    const geometry=fire.mesh.geometry;
    const positions=geometry.getAttribute('position'),uvs=geometry.getAttribute('uv');
    const observed={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
    for(let i=0;i<positions.count;i++) {
      const worldDirection=new THREE.Vector3().fromBufferAttribute(positions,i);
      assert.ok(Math.abs(worldDirection.length()-80)<1e-5,'patch must stay inside the 150-unit camera far plane');
      // Three samples a yaw-rotated background using the inverse rotation.
      const sourceDirection=worldDirection.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),-rotation);
      const sourceU=Math.atan2(sourceDirection.z,sourceDirection.x)/(2*Math.PI)+.5;
      const sourceV=Math.acos(sourceDirection.y)/Math.PI;
      assert.ok(Math.abs(sourceU-uvs.getX(i))<1e-6,'horizontal source registration');
      assert.ok(Math.abs(sourceV-uvs.getY(i))<1e-6,'vertical source registration');
      const x=sourceU*panoramaSize.width,y=sourceV*panoramaSize.height;
      observed.left=Math.min(observed.left,x);observed.right=Math.max(observed.right,x);
      observed.top=Math.min(observed.top,y);observed.bottom=Math.max(observed.bottom,y);
      assert.ok(x>=region.left-.001&&x<=region.right+.001&&y>=region.top-.001&&y<=region.bottom+.001,
        'animation geometry must stay inside the accepted firebox region');
    }
    for(const side of Object.keys(region))assert.ok(Math.abs(observed[side]-region[side])<.001,side);
    assert.equal(fire.mesh.material.depthTest,true,'foreground chess geometry must occlude the fire');
    assert.equal(fire.mesh.material.depthWrite,false,'the background patch must not mask foreground geometry');
    assert.equal(fire.mesh.castShadow,false);
    assert.equal(fire.mesh.userData.square,undefined,'the decorative patch must not become a chess square');
  } finally {fire.dispose();}
});

test('camera translation and capture rendering preserve the patch panorama direction',()=>{
  const f=fixture();
  try {
    const localVertex=new THREE.Vector3().fromBufferAttribute(f.fire.mesh.geometry.getAttribute('position'),50);
    const expectedDirection=localVertex.clone().normalize();
    for(const [index,position] of [[0,new THREE.Vector3(0,0,0)],[1,new THREE.Vector3(25,13,-8)],[2,new THREE.Vector3(-12,8,42)]]) {
      f.look(position);
      assert.equal(f.fire.update(index*100,f.camera),true);
      assertVector(f.fire.mesh.position,position,'mesh follows the camera');
      const captureCamera=f.camera.clone();
      for(const activeCamera of [captureCamera,f.camera]) {
        const beforeTime=f.fire.mesh.material.uniforms.time.value;
        f.fire.mesh.onBeforeRender(null,f.world,activeCamera);
        const worldVertex=localVertex.clone().applyMatrix4(f.fire.mesh.matrixWorld);
        assertVector(worldVertex.sub(position).normalize(),expectedDirection,'camera-relative panorama direction');
        assert.equal(f.fire.mesh.material.uniforms.time.value,beforeTime,'capture/final renders must not advance animation time separately');
      }
    }
  } finally {f.fire.dispose();}
});

test('idle fireplace updates are capped at 24 per second while time advances',()=>{
  const {fire,camera}=fixture();
  try {
    let lastDraw=-Infinity,count=0,lastTime=-Infinity;
    for(let milliseconds=0;milliseconds<1000;milliseconds++) {
      const previousTime=fire.mesh.material.uniforms.time.value;
      if(fire.update(milliseconds,camera)) {
        assert.ok(milliseconds-lastDraw>=1000/24,'successive animation redraws must respect the frame cap');
        assert.ok(fire.mesh.material.uniforms.time.value>lastTime,'accepted animation frames must progress');
        lastDraw=milliseconds;lastTime=fire.mesh.material.uniforms.time.value;count++;
      } else assert.equal(fire.mesh.material.uniforms.time.value,previousTime,'skipped frames must not mutate the displayed animation');
    }
    assert.ok(count>=23&&count<=24,`expected a 24-fps cap, got ${count} updates`);
  } finally {fire.dispose();}
});

test('reduced motion restores the static panorama, remains idle and resumes animation when disabled',()=>{
  const {fire,camera}=fixture();
  try {
    assert.equal(fire.update(0,camera),true);
    assert.equal(fire.update(100,camera),true);
    const before=fire.mesh.material.uniforms.time.value;
    assert.equal(fire.update(110,camera,true),true,'hiding the effect requires one redraw');
    assert.equal(fire.mesh.visible,false);
    for(const time of [200,500,1000]) {
      assert.equal(fire.update(time,camera,true),false,'reduced motion must not keep rendering decorative frames');
      assert.equal(fire.mesh.material.uniforms.time.value,before);
    }
    assert.equal(fire.update(1100,camera,false),true);
    assert.equal(fire.mesh.visible,true);
    assert.ok(fire.mesh.material.uniforms.time.value>before);
  } finally {fire.dispose();}
});

test('looking away stops decorative redraws and returning resumes them at the current camera position',()=>{
  const f=fixture();
  try {
    assert.equal(f.fire.update(0,f.camera),true);
    const before=f.fire.mesh.material.uniforms.time.value;
    f.look(new THREE.Vector3(11,7,-4),center.clone().negate());
    for(const time of [100,1000,5000]) {
      assert.equal(f.fire.update(time,f.camera),false);
      assert.equal(f.fire.mesh.material.uniforms.time.value,before);
    }
    f.look(new THREE.Vector3(-14,12,8));
    assert.equal(f.fire.update(5100,f.camera),true);
    assertVector(f.fire.mesh.position,f.camera.position,'reactivated patch position');
    assert.ok(f.fire.mesh.material.uniforms.time.value>before);
  } finally {f.fire.dispose();}
});

test('dispose removes the patch and releases owned resources once without disposing the shared panorama environment',()=>{
  const f=fixture();
  const disposals={geometry:0,material:0,environment:0};
  f.fire.mesh.geometry.addEventListener('dispose',()=>disposals.geometry++);
  f.fire.mesh.material.addEventListener('dispose',()=>disposals.material++);
  f.environment.addEventListener('dispose',()=>disposals.environment++);
  f.fire.update(0,f.camera);
  const lastTime=f.fire.mesh.material.uniforms.time.value;
  f.fire.dispose();f.fire.dispose();
  assert.equal(f.fire.mesh.parent,null);
  assert.deepEqual(disposals,{geometry:1,material:1,environment:0});
  assert.equal(f.fire.update(1000,f.camera),false);
  assert.equal(f.fire.mesh.material.uniforms.time.value,lastTime);
});

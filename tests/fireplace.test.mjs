import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {createFireplace,panoramaDirection} from '../fireplace.js';

// These tests exercise real geometry, camera matrices and animation scheduling.
// Shader compilation, colour matching, feathering and document visibility are
// verified in the browser rather than simulated by this fixture.
const panoramaSize={width:1774,height:887};
const region={left:552,right:700,top:476,bottom:585};
const reflectionRegion={left:536,right:736,top:602,bottom:748};
const atlasMetadata=JSON.parse(await readFile(new URL('../assets/fireplace/natural-fire.json',import.meta.url),'utf8'));
const rotation=1.5;
const center=panoramaDirection(625/panoramaSize.width,530/panoramaSize.height)
  .applyAxisAngle(new THREE.Vector3(0,1,0),rotation);
const floorOnlyDirection=panoramaDirection(625/panoramaSize.width,725/panoramaSize.height)
  .applyAxisAngle(new THREE.Vector3(0,1,0),rotation);

function assertVector(actual,expected,message,tolerance=1e-6) {
  assert.ok(actual.distanceTo(expected)<tolerance,`${message}: ${actual.toArray()} vs ${expected.toArray()}`);
}

function fixture({missingAtlas=false,missingEnvironment=false}={}) {
  // TextureLoader supplies an image and one initial upload request. The frame
  // loop should subsequently change uniforms, without uploading this atlas again.
  const atlas=missingAtlas?null:new THREE.Texture({width:atlasMetadata.atlas_size[0],height:atlasMetadata.atlas_size[1]});
  if(atlas)atlas.needsUpdate=true;
  const environment=missingEnvironment?null:new THREE.Texture({width:768,height:1024});
  const fire=createFireplace({atlas,environment,rotation,intensity:.82,blur:.045});
  const world=new THREE.Scene();
  world.background=new THREE.Texture();
  world.environment=environment;
  world.add(fire.mesh,fire.reflection);
  const camera=new THREE.PerspectiveCamera(38,1.6,.1,150);
  function look(position,direction=center) {
    camera.position.copy(position);
    camera.lookAt(position.clone().add(direction));
    camera.updateMatrixWorld(true);
  }
  look(new THREE.Vector3(3,5,12));
  return {fire,world,camera,atlas,environment,look};
}

function cameraFrustum(camera) {
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4()
    .multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
}

// Read dimensions from the actual WebP container rather than trusting the
// metadata or requiring a browser/image library in the repository's test runner.
function webpDimensions(bytes) {
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  for(let offset=12;offset+8<=bytes.length;) {
    const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
    assert.ok(start+size<=bytes.length,'WebP chunks must not be truncated');
    if(type==='VP8X')return [bytes.readUIntLE(start+4,3)+1,bytes.readUIntLE(start+7,3)+1];
    if(type==='VP8 ') {
      assert.equal(bytes.toString('hex',start+3,start+6),'9d012a');
      return [bytes.readUInt16LE(start+6)&0x3fff,bytes.readUInt16LE(start+8)&0x3fff];
    }
    if(type==='VP8L') {
      assert.equal(bytes[start],0x2f);
      const packed=bytes.readUInt32LE(start+1);
      return [(packed&0x3fff)+1,((packed>>>14)&0x3fff)+1];
    }
    offset=start+size+(size%2);
  }
  assert.fail('WebP has no decodable image-dimension chunk');
}

test('the built atlas matches its declared grid, original reference and natural loop timing',async()=>{
  const asset=await readFile(new URL('../assets/fireplace/natural-fire.webp',import.meta.url));
  assert.deepEqual(webpDimensions(asset),atlasMetadata.atlas_size);
  assert.deepEqual(atlasMetadata.atlas_size,[2016,1820]);
  assert.deepEqual(atlasMetadata.frame_size,[248,136]);
  assert.deepEqual(atlasMetadata.source_size,[498,273]);
  assert.equal(atlasMetadata.source_sha256,'cb0fad8b29ec252c425f0f26ded08698f6279fd3b6f37601f45320221a315295');
  assert.equal(atlasMetadata.frames,99);
  assert.equal(atlasMetadata.frame_duration_ms,90);
  assert.equal(atlasMetadata.frames*atlasMetadata.frame_duration_ms,8910);
  assert.equal(atlasMetadata.columns,8);
  assert.equal(atlasMetadata.rows,13);
  assert.equal(atlasMetadata.gutter,2);
  assert.equal(atlasMetadata.columns*(atlasMetadata.frame_size[0]+2*atlasMetadata.gutter),atlasMetadata.atlas_size[0]);
  assert.equal(atlasMetadata.rows*(atlasMetadata.frame_size[1]+2*atlasMetadata.gutter),atlasMetadata.atlas_size[1]);
  assert.ok(atlasMetadata.frames<=atlasMetadata.columns*atlasMetadata.rows);
  assert.ok(atlasMetadata.frames>(atlasMetadata.rows-1)*atlasMetadata.columns,'only the final row may have spare cells');
});

test('panorama coordinates use the expected cardinal directions and image top/bottom',()=>{
  for(const [u,v,expected] of [
    [.5,.5,[1,0,0]],[.75,.5,[0,0,1]],[.25,.5,[0,0,-1]],
    [0,.5,[-1,0,0]],[.5,0,[0,1,0]],[.5,1,[0,-1,0]]
  ])assertVector(panoramaDirection(u,v),new THREE.Vector3(...expected),`panorama (${u},${v})`);
});

test('every patch vertex aligns with its original panorama pixel after background rotation',()=>{
  const {fire}=fixture();
  try {
    for(const [patch,bounds] of [[fire.mesh,region],[fire.reflection,reflectionRegion]]) {
    const geometry=patch.geometry;
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
      assert.ok(x>=bounds.left-.001&&x<=bounds.right+.001&&y>=bounds.top-.001&&y<=bounds.bottom+.001,
        `${patch.name}: animation geometry must stay inside its accepted panorama region`);
    }
    for(const side of Object.keys(bounds))assert.ok(Math.abs(observed[side]-bounds[side])<.001,`${patch.name}: ${side}`);
    assert.equal(patch.material.depthTest,true,'foreground chess geometry must occlude both patches');
    assert.equal(patch.material.depthWrite,false,'the background patches must not mask foreground geometry');
    assert.equal(patch.castShadow,false);
    assert.equal(patch.userData.square,undefined,'neither decorative patch may become a chess square');
    }
  } finally {fire.dispose();}
});

test('camera translation and capture rendering preserve the patch panorama direction',()=>{
  const f=fixture();
  try {
    for(const [index,position] of [[0,new THREE.Vector3(0,0,0)],[1,new THREE.Vector3(25,13,-8)],[2,new THREE.Vector3(-12,8,42)]]) {
      f.look(position);
      assert.equal(f.fire.update(index*100,f.camera),true);
      const captureCamera=f.camera.clone();
      for(const patch of [f.fire.mesh,f.fire.reflection]) {
      const localVertex=new THREE.Vector3().fromBufferAttribute(patch.geometry.getAttribute('position'),50);
      const expectedDirection=localVertex.clone().normalize();
      assertVector(patch.position,position,`${patch.name} follows the camera`);
      for(const activeCamera of [captureCamera,f.camera]) {
        const beforeTime=patch.material.uniforms.time.value;
        patch.onBeforeRender(null,f.world,activeCamera);
        const worldVertex=localVertex.clone().applyMatrix4(patch.matrixWorld);
        assertVector(worldVertex.sub(position).normalize(),expectedDirection,'camera-relative panorama direction');
        assert.equal(patch.material.uniforms.time.value,beforeTime,'capture/final renders must not advance animation time separately');
      }
      }
    }
  } finally {f.fire.dispose();}
});

test('the photographed flame and floor reflection share one animation clock and atlas',()=>{
  const {fire,camera,atlas,environment}=fixture();
  try {
    assert.notEqual(fire.mesh,fire.reflection);
    assert.notEqual(fire.mesh.geometry,fire.reflection.geometry);
    assert.notEqual(fire.mesh.material,fire.reflection.material);
    assert.equal(fire.reflection.material.uniforms.time,fire.mesh.material.uniforms.time,
      'sharing the uniform object keeps capture, flame and reflected light in phase');
    for(const patch of [fire.mesh,fire.reflection])assert.equal(patch.material.uniforms.fireAtlas.value,atlas);
    assert.ok(Object.values(fire.reflection.material.uniforms).some(uniform=>uniform.value===environment),
      'the floor must use the existing room environment');
    for(const time of [0,90,4500,8910,17820]) {
      fire.update(time,camera);
      assert.equal(fire.reflection.material.uniforms.time.value,fire.mesh.material.uniforms.time.value);
    }
  } finally {fire.dispose();}
});

test('the floor keeps animating when it is visible and the fireplace is outside the camera view',()=>{
  const f=fixture();
  try {
    f.look(new THREE.Vector3(6,4,13),floorOnlyDirection);
    assert.equal(f.fire.update(0,f.camera),true,'a visible reflection must request its initial frame');
    const frustum=cameraFrustum(f.camera);
    assert.equal(frustum.intersectsObject(f.fire.mesh),false,'fixture must exclude the fireplace itself');
    assert.equal(frustum.intersectsObject(f.fire.reflection),true,'fixture must include the floor reflection');
    assert.equal(f.fire.update(100,f.camera),true);
    assert.equal(f.fire.mesh.material.uniforms.time.value,.1);
    assert.equal(f.fire.reflection.material.uniforms.time.value,.1);
    assert.equal(f.fire.update(110,f.camera),false,'floor-only animation must retain the frame cap');
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

test('reduced motion shows a stable photographed fire, remains idle and resumes animation when disabled',()=>{
  const {fire,camera}=fixture();
  try {
    assert.equal(fire.update(0,camera),true);
    assert.equal(fire.update(100,camera),true);
    const before=fire.mesh.material.uniforms.time.value;
    assert.equal(fire.update(110,camera,true),true,'switching to the stable first frame requires one redraw');
    assert.equal(fire.mesh.visible,true,'reduced motion should retain the new photographed fire');
    assert.equal(fire.reflection.visible,true,'reduced motion should retain a static warm floor reflection');
    assert.equal(fire.mesh.material.uniforms.time.value,0);
    assert.equal(fire.reflection.material.uniforms.time.value,0);
    for(const time of [200,500,1000]) {
      assert.equal(fire.update(time,camera,true),false,'reduced motion must not keep rendering decorative frames');
      assert.equal(fire.mesh.material.uniforms.time.value,0);
      assert.equal(fire.reflection.material.uniforms.time.value,0);
    }
    assert.equal(fire.update(1100,camera,false),true);
    assert.equal(fire.mesh.visible,true);
    assert.ok(fire.mesh.material.uniforms.time.value>before);
  } finally {fire.dispose();}
});

test('reduced-motion startup stays on frame zero and a quick preference change redraws immediately',()=>{
  const {fire,camera}=fixture();
  try {
    assert.equal(fire.update(1000,camera,true),true);
    assert.equal(fire.mesh.visible,true);
    assert.equal(fire.mesh.material.uniforms.time.value,0);
    assert.equal(fire.update(1010,camera,true),false);
    assert.equal(fire.update(1020,camera,false),true);
    assert.equal(fire.update(1025,camera,true),true);
    assert.equal(fire.mesh.material.uniforms.time.value,0);
    assert.equal(fire.update(1030,camera,false),true,'preference changes must bypass the decorative frame-rate limit');
  } finally {fire.dispose();}
});

test('animation uses one stable filtered atlas without recurring texture uploads or shader recompilation',()=>{
  const {fire,camera,atlas,environment}=fixture();
  try {
    assert.equal(atlas.colorSpace,THREE.SRGBColorSpace);
    assert.equal(atlas.generateMipmaps,false,'mipmaps can blend neighbouring atlas cells beyond the gutters');
    assert.equal(atlas.minFilter,THREE.LinearFilter);
    assert.equal(atlas.magFilter,THREE.LinearFilter);
    const versions=()=>({texture:atlas.version,source:atlas.source.version,material:fire.mesh.material.version,
      reflectionMaterial:fire.reflection.material.version,environment:environment.version,environmentSource:environment.source.version});
    const before=versions();
    for(const time of [0,45,90,1000,8820,8910,8955,17820]) {
      fire.update(time,camera);
      assert.equal(fire.mesh.material.uniforms.fireAtlas.value,atlas,'frame changes must keep the same atlas binding');
      assert.equal(fire.reflection.material.uniforms.fireAtlas.value,atlas);
      assert.deepEqual(versions(),before);
    }
  } finally {fire.dispose();}
});

test('a missing atlas leaves the original panorama available without decorative redraws',()=>{
  const {fire,world,camera}=fixture({missingAtlas:true});
  const background=world.background,environment=world.environment;
  try {
    assert.equal(fire.mesh.visible,false);
    assert.equal(fire.reflection.visible,false);
    for(const reduced of [false,true,false])for(const time of [0,100,1000]) {
      assert.equal(fire.update(time,camera,reduced),false);
      assert.equal(fire.mesh.visible,false);
      assert.equal(fire.reflection.visible,false);
      assert.equal(world.background,background);
      assert.equal(world.environment,environment);
    }
  } finally {fire.dispose();}
});

test('a missing environment disables only the floor reflection and cannot trigger offscreen flame redraws',()=>{
  const f=fixture({missingEnvironment:true});
  try {
    assert.equal(f.fire.mesh.visible,true,'the photographed fire still has its atlas');
    assert.equal(f.fire.reflection.visible,false,'the floor must retain its original panorama without an environment sample');
    assert.equal(f.fire.update(0,f.camera),true);
    f.look(new THREE.Vector3(6,4,13),floorOnlyDirection);
    assert.equal(f.fire.update(100,f.camera),false,'a hidden reflection must not keep background rendering active');
    const frustum=cameraFrustum(f.camera);
    assert.equal(frustum.intersectsObject(f.fire.mesh),false);
    assert.equal(frustum.intersectsObject(f.fire.reflection),true,'hidden floor geometry is deliberately inside the frustum');
    assert.equal(f.fire.mesh.material.uniforms.time.value,0);
    assert.equal(f.fire.reflection.visible,false);
  } finally {f.fire.dispose();}
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

test('dispose removes both patches and releases the shared owned atlas once without disposing the panorama environment',()=>{
  const f=fixture();
  const disposals={geometry:0,material:0,reflectionGeometry:0,reflectionMaterial:0,atlas:0,environment:0};
  f.fire.mesh.geometry.addEventListener('dispose',()=>disposals.geometry++);
  f.fire.mesh.material.addEventListener('dispose',()=>disposals.material++);
  f.fire.reflection.geometry.addEventListener('dispose',()=>disposals.reflectionGeometry++);
  f.fire.reflection.material.addEventListener('dispose',()=>disposals.reflectionMaterial++);
  f.atlas.addEventListener('dispose',()=>disposals.atlas++);
  f.world.environment.addEventListener('dispose',()=>disposals.environment++);
  f.fire.update(0,f.camera);
  const lastTime=f.fire.mesh.material.uniforms.time.value;
  f.fire.dispose();f.fire.dispose();
  assert.equal(f.fire.mesh.parent,null);
  assert.equal(f.fire.reflection.parent,null);
  assert.deepEqual(disposals,{geometry:1,material:1,reflectionGeometry:1,reflectionMaterial:1,atlas:1,environment:0});
  assert.equal(f.fire.update(1000,f.camera),false);
  assert.equal(f.fire.mesh.material.uniforms.time.value,lastTime);
});

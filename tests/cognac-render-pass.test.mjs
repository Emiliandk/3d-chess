import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Mesh,MeshPhysicalMaterial,PerspectiveCamera,Scene,Vector4} from '../vendor/three.module.js';
import {createCognacRenderPass} from '../cognac-render-pass.js';

// These tests exercise render orchestration and resource lifetime. They do not
// substitute for checking refraction, lighting, or shader compilation in WebGL.
function fixture() {
  const material=new MeshPhysicalMaterial({transmission:1});
  const geometry=new BoxGeometry();
  const shells=[new Mesh(geometry,material),new Mesh(geometry,material)];
  shells[1].visible=false;
  const liquid=new Mesh(geometry,new MeshPhysicalMaterial({transmission:1}));
  const scene=new Scene();
  scene.add(...shells,liquid);
  const camera=new PerspectiveCamera();
  camera.position.set(2,4,8);
  camera.lookAt(.2,0,.5);
  camera.updateMatrixWorld(true);
  const initialTarget={name:'caller-owned-target',viewport:new Vector4(12,24,800,450),
    scissor:new Vector4(9,15,640,360),scissorTest:true};
  const renderer={
    extensions:{has:()=>true},
    size:[1600,900],
    target:initialTarget,
    cubeFace:3,
    mipmapLevel:2,
    viewport:new Vector4(12,24,800,450),
    scissor:new Vector4(9,15,640,360),
    scissorTest:true,
    calls:[],
    clearCalls:0,
    getDrawingBufferSize(out){return out.set(...this.size);},
    getRenderTarget(){return this.target;},
    getActiveCubeFace(){return this.cubeFace;},
    getActiveMipmapLevel(){return this.mipmapLevel;},
    getViewport(out){return out.copy(this.viewport);},
    getScissor(out){return out.copy(this.scissor);},
    getScissorTest(){return this.scissorTest;},
    setRenderTarget(target,cubeFace=0,mipmapLevel=0){Object.assign(this,{target,cubeFace,mipmapLevel});},
    setViewport(...args){args[0]?.isVector4?this.viewport.copy(args[0]):this.viewport.set(...args);},
    setScissor(...args){args[0]?.isVector4?this.scissor.copy(args[0]):this.scissor.set(...args);},
    setScissorTest(value){this.scissorTest=value;},
    clear(){this.clearCalls++;},
    render(activeScene,activeCamera){
      assert.equal(activeScene,scene);
      if(this.target===initialTarget)assert.equal(activeCamera,camera);
      else{
        assert.notEqual(activeCamera,camera,'capture must have its own camera and internal transmission target');
        assert.deepEqual(activeCamera.projectionMatrix,camera.projectionMatrix);
        assert.deepEqual(activeCamera.matrixWorld,camera.matrixWorld);
      }
      this.calls.push({target:this.target,camera:activeCamera,visibility:scene.children.map(child=>child.visible),
        viewport:(this.target?.viewport??this.viewport).clone(),
        scissorTest:this.target?.scissorTest??this.scissorTest});
      if(this.failNextRender){this.failNextRender=false;throw new Error('capture failed');}
    }
  };
  const initialState={target:renderer.target,cubeFace:renderer.cubeFace,mipmapLevel:renderer.mipmapLevel,
    viewport:renderer.viewport.clone(),scissor:renderer.scissor.clone(),scissorTest:renderer.scissorTest};
  return {renderer,scene,camera,shells,material,initialState};
}

function assertCallerState(f) {
  for(const key of ['target','cubeFace','mipmapLevel','scissorTest'])assert.equal(f.renderer[key],f.initialState[key],key);
  assert.deepEqual(f.renderer.viewport,f.initialState.viewport);
  assert.deepEqual(f.renderer.scissor,f.initialState.scissor);
  assert.deepEqual(f.shells.map(shell=>shell.visible),[true,false]);
}

test('capture contains liquid, then final render restores shells and the caller’s render state',()=>{
  const f=fixture();
  const pass=createCognacRenderPass(f.renderer,{shells:f.shells});
  pass.render(f.scene,f.camera);
  assert.equal(f.renderer.calls.length,2);
  const [capture,final]=f.renderer.calls;
  assert.ok(capture.target.isWebGLRenderTarget);
  assert.notEqual(capture.target,f.initialState.target);
  assert.deepEqual(capture.visibility,[false,false,true],'only outer shells are excluded from the capture');
  assert.equal(capture.scissorTest,false,'a caller’s scissor must not leave stale pixels in the refraction image');
  assert.equal(final.target,f.initialState.target);
  assert.deepEqual(final.visibility,[true,false,true]);
  assert.equal(f.renderer.clearCalls,1);
  assertCallerState(f);
  pass.dispose();
});

test('refraction capture resizes with the drawing buffer while bounding its longest edge',()=>{
  const f=fixture();
  const pass=createCognacRenderPass(f.renderer,{shells:f.shells});
  const shader={fragmentShader:'#include <transmission_pars_fragment>',uniforms:{}};
  f.material.onBeforeCompile(shader,f.renderer);
  const sampler=shader.uniforms.cognacSceneSampler;
  const size=shader.uniforms.cognacSceneSamplerSize;
  assert.ok(sampler?.value?.isTexture);
  let captureCamera;
  for(const [width,height] of [[1600,900],[390,844],[2200,4400],[0,0]]){
    f.renderer.size=[width,height];
    f.camera.position.x+=.2;
    f.camera.aspect=width/Math.max(height,1)||1;
    f.camera.updateProjectionMatrix();
    f.camera.updateMatrixWorld(true);
    pass.render(f.scene,f.camera);
    const capture=f.renderer.calls.at(-2);
    const target=capture.target;
    if(captureCamera)assert.equal(capture.camera,captureCamera,'reuse the capture camera across frames');
    captureCamera=capture.camera;
    assert.equal(target.texture,sampler.value,'resize must retain the texture bound to the glass shader');
    assert.ok(target.width>=1&&target.height>=1&&target.width<=1024&&target.height<=1024);
    assert.deepEqual(size.value.toArray(),[target.width,target.height]);
    assert.deepEqual(f.renderer.calls.at(-2).viewport.toArray(),[0,0,target.width,target.height]);
    if(width>0&&height>0){
      const scale=Math.min(1,1024/Math.max(width,height));
      assert.ok(Math.abs(target.width-width*scale)<=.5&&Math.abs(target.height-height*scale)<=.5,
        'the capture must preserve the viewport aspect ratio within pixel rounding');
    }
  }
  pass.dispose();
});

test('failed capture restores visibility and renderer state and permits a later redraw',()=>{
  const f=fixture();
  const pass=createCognacRenderPass(f.renderer,{shells:f.shells});
  f.renderer.failNextRender=true;
  assert.throws(()=>pass.render(f.scene,f.camera),/capture failed/);
  assert.equal(f.renderer.calls.length,1,'do not render a final frame with an incomplete capture');
  assertCallerState(f);
  pass.render(f.scene,f.camera);
  assert.equal(f.renderer.calls.length,3);
  assertCallerState(f);
  pass.dispose();
});

test('shader capture binding preserves existing hooks and releases its target exactly once',()=>{
  const f=fixture();
  let priorCompileCalls=0;
  const priorCompile=function(shader){assert.equal(this,f.material);priorCompileCalls++;shader.uniforms.existing={value:7};};
  const priorCacheKey=()=> 'existing-glass-program';
  f.material.onBeforeCompile=priorCompile;
  f.material.customProgramCacheKey=priorCacheKey;
  const pass=createCognacRenderPass(f.renderer,{shells:[...f.shells,f.shells[0]]});
  const builtInSampler={value:'renderer-owned-transmission-image'};
  const shader={fragmentShader:'#include <transmission_pars_fragment>',uniforms:{transmissionSamplerMap:builtInSampler}};
  f.material.onBeforeCompile(shader,f.renderer);
  assert.equal(priorCompileCalls,1,'shared shell materials must be patched only once');
  assert.equal(shader.uniforms.existing.value,7);
  assert.equal(shader.uniforms.transmissionSamplerMap,builtInSampler,'leave renderer-owned uniforms intact');
  assert.match(shader.fragmentShader,/uniform sampler2D cognacSceneSampler;/);
  assert.doesNotMatch(shader.fragmentShader,/\btransmissionSamplerMap\b/);
  assert.ok(f.material.customProgramCacheKey().startsWith('existing-glass-program'));
  pass.render(f.scene,f.camera);
  let disposals=0;
  f.renderer.calls[0].target.addEventListener('dispose',()=>{disposals++;});
  pass.dispose();
  pass.dispose();
  assert.equal(disposals,1);
  assert.equal(f.material.onBeforeCompile,priorCompile);
  assert.equal(f.material.customProgramCacheKey,priorCacheKey);
  assert.throws(()=>pass.render(f.scene,f.camera),/disposed/);
});

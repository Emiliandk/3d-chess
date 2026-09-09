import test from 'node:test';
import assert from 'node:assert/strict';
import {BackSide,Box3,DoubleSide,FrontSide,Mesh,MeshBasicMaterial,PerspectiveCamera,Raycaster,Scene,Texture,Vector3} from '../vendor/three.module.js';
import {createCognacProps} from '../cognac-props.js';
import {createCognacRenderPass} from '../cognac-render-pass.js';
import {fitBoardCamera} from '../camera.js';

test('two glasses and one bottle stand on the table, clear of the chessboard',()=>{
  const props=createCognacProps({bottleTexture:new Texture()});
  assert.equal(props.group.children.length,3);
  for(const object of props.group.children){
    const box=new Box3().setFromObject(object);
    assert.ok(Math.abs(box.min.y-(-.72+.38/2))<1e-6,`${object.name} must touch the tabletop`);
    assert.ok(box.min.x>-8&&box.max.x<8&&box.min.z>-7&&box.max.z<7,`${object.name} overhangs the table`);
    assert.ok(box.min.x>4.84||box.max.x< -4.84||box.min.z>4.84||box.max.z< -4.84,`${object.name} overlaps the board`);
    object.traverse(mesh=>{
      assert.equal(mesh.userData.square,undefined,'table objects must not represent playable squares');
      if(mesh.isMesh)for(const attribute of Object.values(mesh.geometry.attributes)){
        assert.ok(attribute.array.every(Number.isFinite),`${mesh.name} has invalid geometry`);
      }
    });
  }
  const white=props.group.getObjectByName('white-player-cognac-glass');
  const black=props.group.getObjectByName('black-player-cognac-glass');
  assert.ok(white.position.x>0&&white.position.z>0,'white glass belongs at the near player’s right');
  assert.ok(black.position.x<0&&black.position.z<0,'black glass belongs at the far player’s right');
  props.dispose();
});

test('glass bowls have open mouths and a small pour below the rim',()=>{
  const props=createCognacProps({bottleTexture:new Texture()});
  for(const name of ['white-player-cognac-glass','black-player-cognac-glass']){
    const glass=props.group.getObjectByName(name);
    const bowl=glass.getObjectByName('hollow-tulip-bowl');
    // Use normal mesh raycasting to inspect the surface, independently of the
    // decoration's deliberate exclusion from chess input hit targets.
    const surface=new Mesh(bowl.geometry,bowl.material);
    surface.updateMatrixWorld(true);
    const hits=new Raycaster(new Vector3(0,4,0),new Vector3(0,-1,0)).intersectObject(surface);
    assert.ok(hits.length>0);
    assert.ok(hits[0].point.y<1.5,'a lid or solid bowl would conceal the inside');
    const liquid=new Box3().setFromObject(glass.getObjectByName('small-cognac-pour'));
    const rim=new Box3().setFromObject(bowl).max.y;
    assert.ok(rim-liquid.max.y>1,'leave ample empty bowl above a small serving');
  }
  props.dispose();
});

test('each vessel has one transmissive liquid volume with a single exposed fill surface',()=>{
  const props=createCognacProps({bottleTexture:new Texture()});
  for(const vessel of props.group.children){
    const liquids=vessel.children.filter(child=>child.isMesh&&/cognac|meniscus|fill-surface/.test(child.name));
    assert.equal(liquids.length,1,`${vessel.name} must not have an overlapping liquid lid`);
    const liquid=liquids[0];
    assert.ok(liquid.material.isMeshPhysicalMaterial&&liquid.material.transmission>0,
      'light must pass through the liquid instead of hitting an opaque brown surface');
    assert.ok(liquid.material.thickness>0&&Number.isFinite(liquid.material.attenuationDistance),
      'the liquid needs a finite absorption path');
    const surface=new Mesh(liquid.geometry,liquid.material);
    surface.updateMatrixWorld(true);
    // Offset slightly from the lathe axis so a ray does not count several
    // triangles meeting at the same central vertex as separate surfaces.
    const hits=new Raycaster(new Vector3(.07,6,.031),new Vector3(0,-1,0)).intersectObject(surface);
    assert.equal(hits.length,1,`${vessel.name} must have a single upward-facing liquid surface`);
    assert.ok(hits[0].face.normal.y>.99,'the central fill surface must stay level');
  }
  assert.equal(props.shells.length,3,'each liquid volume needs its own outer refraction shell');
  assert.ok(props.shells.every(shell=>shell.material.transmission>0));
  props.dispose();
});

test('the complete board and table props fit phone, tablet and desktop camera views',()=>{
  const props=createCognacProps({bottleTexture:new Texture()});
  const points=[...props.framingPoints];
  for(const x of [-4.84,4.84])for(const y of [-.51,1.60])for(const z of [-4.84,4.84])points.push(new Vector3(x,y,z));
  for(const [w,h] of [[898,666],[750,620],[430,620],[354,440],[282,440],[1350,800]]){
    for(const polar of [.12,.84,1.28])for(const azimuth of [.28,Math.PI+.28,Math.PI/2,-Math.PI/2]){
      const camera=new PerspectiveCamera(38,w/h,.1,150);
      const distance=fitBoardCamera(camera,new Vector3(0,.25,0),{azimuth,polar,framingPoints:props.framingPoints});
      assert.ok(distance<=56,'framing must stay within the orbit controls’ zoom range');
      for(const point of points){
        const p=point.clone().project(camera);
        assert.ok(Math.abs(p.x)<=.881&&Math.abs(p.y)<=.881&&p.z<1,`content clipped at ${w} × ${h}`);
      }
    }
  }
  props.dispose();
});

// Project three narrow strips along the bottle's axis onto the tabletop using
// the real key-light direction. Trace back toward that light through eligible
// shadow geometry. This detects the disconnected label/capsule shadow without
// relying on a screenshot or pretending to simulate WebGL filtering/refraction.
function bottleShadowGaps(bottle) {
  bottle.updateWorldMatrix(true,true);
  const shadowSurfaces=[];
  bottle.traverseVisible(object=>{
    if(!object.isMesh||!object.castShadow||!object.material.visible)return;
    // Match r180 PCF shadow-face selection, using normal raycasting instead of
    // the decorative meshes' deliberate no-op input handlers.
    const source=object.material;
    const side=source.shadowSide??(source.side===DoubleSide?DoubleSide:source.side===BackSide?FrontSide:BackSide);
    const surface=new Mesh(object.geometry,new MeshBasicMaterial({side}));
    surface.matrixAutoUpdate=false;
    surface.matrix.copy(object.matrixWorld);
    surface.updateMatrixWorld(true);
    shadowSurfaces.push(surface);
  });
  try {
    const towardLight=new Vector3(-6,12,7).normalize();
    const acrossShadow=new Vector3(7,0,6).normalize();
    const base=bottle.getWorldPosition(new Vector3());
    const gaps=[];
    for(const lateral of [-.1,0,.1])for(let sample=1;sample<=49;sample++){
      const height=sample/10;
      const ground=base.clone().add(new Vector3(height/2,.001,-height*7/12))
        .addScaledVector(acrossShadow,lateral);
      if(!new Raycaster(ground,towardLight).intersectObjects(shadowSurfaces).length)gaps.push({height,lateral});
    }
    return gaps;
  } finally {
    for(const surface of shadowSurfaces)surface.material.dispose();
  }
}

test('bottle shadow stays connected from its base through the cap, including while glass is hidden',()=>{
  const props=createCognacProps({bottleTexture:new Texture()});
  const bottle=props.group.getObjectByName('gourry-de-chadeville-cognac-bottle');
  const proxy=bottle.getObjectByName('bottle-shadow-proxy');
  try {
    assert.deepEqual(bottleShadowGaps(bottle),[],'the projected bottle silhouette must have no detached parts');
    for(const shell of props.shells)shell.visible=false;
    assert.deepEqual(bottleShadowGaps(bottle),[],'the liquid capture must retain the complete shadow');
    // Recreate the original defect in this isolated scene: cap/label casters
    // remain, but the body is absent. The probe must detect that actual gap.
    proxy.castShadow=false;
    assert.ok(bottleShadowGaps(bottle).some(gap=>gap.height===2.5&&gap.lateral===0),
      'removing body occlusion must reveal the original middle-of-shadow gap');
    proxy.castShadow=true;
    assert.deepEqual(bottleShadowGaps(bottle),[],'restoring the body must close the gap again');
  } finally {props.dispose();}
});

test('refraction capture builds a complete bottle shadow before consuming the pending update',()=>{
  const props=createCognacProps({bottleTexture:new Texture()});
  const bottle=props.group.getObjectByName('gourry-de-chadeville-cognac-bottle');
  const proxy=bottle.getObjectByName('bottle-shadow-proxy');
  const scene=new Scene();scene.add(props.group);
  const camera=new PerspectiveCamera();
  const captures=[],shadowUpdates=[];
  const renderer={
    extensions:{has:()=>true},target:null,
    shadowMap:{autoUpdate:false,needsUpdate:true},
    getDrawingBufferSize(out){return out.set(900,600);},
    getRenderTarget(){return this.target;},
    getActiveCubeFace(){return 0;},getActiveMipmapLevel(){return 0;},
    setRenderTarget(target){this.target=target;},clear(){},
    render(){
      if(this.target)captures.push(props.shells.map(shell=>shell.visible));
      // The real renderer consumes the pending update in the first render.
      // Its final canvas pass consequently reuses the capture's shadow map.
      if(this.shadowMap.needsUpdate){
        shadowUpdates.push({duringCapture:!!this.target,gaps:bottleShadowGaps(bottle)});
        this.shadowMap.needsUpdate=false;
      }
    }
  };
  const pass=createCognacRenderPass(renderer,{shells:props.shells});
  try {
    assert.equal(proxy.material.colorWrite,false,'shadow support must not replace the refracted bottle pixels');
    assert.equal(proxy.material.depthWrite,false,'shadow support must not occlude liquid in either color pass');
    pass.render(scene,camera);
    assert.deepEqual(shadowUpdates,[{duringCapture:true,gaps:[]}]);
    pass.render(scene,camera);
    assert.equal(shadowUpdates.length,1,'ordinary redraws must reuse the complete shadow');
    bottle.position.x+=.2;
    renderer.shadowMap.needsUpdate=true;
    pass.render(scene,camera);
    assert.deepEqual(shadowUpdates,[{duringCapture:true,gaps:[]},{duringCapture:true,gaps:[]}],
      'an invalidated shadow must remain complete when regenerated');
    assert.ok(captures.every(visibility=>visibility.every(value=>value===false)));
    assert.ok(props.shells.every(shell=>shell.visible),'capture must restore every glass shell');
  } finally {pass.dispose();props.dispose();}
});

test('shadow support preserves bottle geometry and releases shared resources exactly once',()=>{
  const inputTexture=new Texture();
  const props=createCognacProps({bottleTexture:inputTexture});
  const bottle=props.group.getObjectByName('gourry-de-chadeville-cognac-bottle');
  const shell=bottle.getObjectByName('hollow-bottle-glass');
  const proxy=bottle.getObjectByName('bottle-shadow-proxy');
  assert.equal(proxy.geometry,shell.geometry,'shadow contours must stay tied to the editable bottle geometry');
  assert.equal(proxy.parent,shell.parent,'shadow support must inherit bottle transforms');
  assert.equal(props.shells.includes(proxy),false,'shadow support must survive shell hiding');
  const disposals={geometry:0,material:0,inputTexture:0};
  shell.geometry.addEventListener('dispose',()=>disposals.geometry++);
  proxy.material.addEventListener('dispose',()=>disposals.material++);
  inputTexture.addEventListener('dispose',()=>disposals.inputTexture++);
  props.dispose();props.dispose();
  assert.deepEqual(disposals,{geometry:1,material:1,inputTexture:0},
    'shared geometry and the shadow material are owned once; the supplied texture remains caller-owned');
});

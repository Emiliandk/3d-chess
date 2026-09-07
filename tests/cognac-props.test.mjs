import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Mesh,PerspectiveCamera,Raycaster,Texture,Vector3} from '../vendor/three.module.js';
import {createCognacProps} from '../cognac-props.js';
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

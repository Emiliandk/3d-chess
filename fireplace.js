import * as THREE from './vendor/three.module.js';

// Pixel coordinates in the immutable 1774 × 887 library panorama. The entire
// feather support stays inside the dark firebox, leaving the marble untouched.
const WIDTH=1774,HEIGHT=887;
const REGION={left:552,right:700,top:476,bottom:585};
// Floor-only feather support: below the marble hearth, around the existing
// golden reflection. The immutable room photograph supplies the wood grain.
const FLOOR={left:536,right:736,top:602,bottom:748};
const RADIUS=80;
const vertexShader=`varying vec2 panoramaUv;
  void main(){panoramaUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const atlasShader=`
  uniform sampler2D fireAtlas;
  uniform float time,intensity;
  varying vec2 panoramaUv;
  vec3 atlasColor(float frame,vec2 uv){
    vec2 cell=vec2(mod(frame,8.0),floor(frame/8.0));
    vec2 pixel=cell*vec2(252.0,140.0)+vec2(2.5)+uv*vec2(247.0,135.0);
    return texture2D(fireAtlas,vec2(pixel.x/2016.0,1.0-pixel.y/1820.0)).rgb;
  }
  vec3 frameColor(float frame,vec2 uv){
    vec2 stepSize=vec2(1.15/247.0,1.15/135.0);
    return atlasColor(frame,uv)*.5
      +(atlasColor(frame,uv+vec2(stepSize.x,0.0))
      +atlasColor(frame,uv-vec2(stepSize.x,0.0))
      +atlasColor(frame,uv+vec2(0.0,stepSize.y))
      +atlasColor(frame,uv-vec2(0.0,stepSize.y)))*.125;
  }
  vec3 animatedColor(vec2 uv){
    uv=clamp(uv,0.0,1.0);
    float phase=mod(time/.09,99.0),frame=floor(phase);
    return mix(atlasColor(frame,uv),atlasColor(mod(frame+1.0,99.0),uv),fract(phase));
  }
`;

function patchGeometry(region,rotation){
  const positions=[],uvs=[],indices=[];
  for(let y=0;y<=8;y++)for(let x=0;x<=12;x++) {
    const u=THREE.MathUtils.lerp(region.left,region.right,x/12)/WIDTH;
    const v=THREE.MathUtils.lerp(region.top,region.bottom,y/8)/HEIGHT;
    const direction=panoramaDirection(u,v).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);
    positions.push(...direction.multiplyScalar(RADIUS).toArray());uvs.push(u,v);
    if(x<12&&y<8){const a=y*13+x;indices.push(a,a+13,a+1,a+1,a+13,a+14);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}

export function panoramaDirection(u,v) {
  const longitude=(u-.5)*Math.PI*2,latitude=(.5-v)*Math.PI;
  return new THREE.Vector3(Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),Math.cos(latitude)*Math.sin(longitude));
}

export function createFireplace({atlas=null,environment=null,rotation=1.5,intensity=.82,blur=.045}) {
  if(atlas){atlas.colorSpace=THREE.SRGBColorSpace;atlas.generateMipmaps=false;atlas.minFilter=THREE.LinearFilter;atlas.magFilter=THREE.LinearFilter;}
  // Both passes and both patches read this single clock and uploaded atlas.
  const uniforms={fireAtlas:{value:atlas},time:{value:0},intensity:{value:intensity}};
  const geometry=patchGeometry(REGION,rotation);
  const material=new THREE.ShaderMaterial({
    name:'living-fireplace',transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms,vertexShader,
    fragmentShader:`
      #include <common>
      ${atlasShader}
      void main(){
        vec2 local=(panoramaUv*vec2(1774.0,887.0)-vec2(552.0,476.0))/vec2(148.0,109.0);
        float mask=smoothstep(0.0,.065,local.x)*(1.0-smoothstep(.935,1.0,local.x))
          *smoothstep(0.0,.06,local.y)*(1.0-smoothstep(.925,1.0,local.y));
        if(mask<.001)discard;
        // A central crop of reference 04 fits the existing firebox proportions.
        vec2 source=vec2(.09+local.x*.82,local.y);
        float phase=mod(time/.09,99.0),frame=floor(phase);
        vec3 color=mix(frameColor(frame,source),frameColor(mod(frame+1.0,99.0),source),fract(phase));
        // Deepen the photographed brick recess without dimming the hot tongues.
        float luminance=dot(color,vec3(.2126,.7152,.0722));
        color*=mix(.40,1.45,smoothstep(.025,.5,luminance));
        gl_FragColor=vec4(color*intensity,mask);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='fireplace-panorama-animation';mesh.renderOrder=-1;mesh.visible=!!atlas;
  const floorGeometry=patchGeometry(FLOOR,rotation);
  const floorMaterial=new THREE.ShaderMaterial({
    name:'firelight-on-wood',transparent:true,depthWrite:false,side:THREE.DoubleSide,
    defines:{ENVMAP_TYPE_CUBE_UV:'',
      CUBEUV_TEXEL_WIDTH:1/(environment?.image?.width||768),
      CUBEUV_TEXEL_HEIGHT:1/(environment?.image?.height||1024),
      CUBEUV_MAX_MIP:(Math.log2(environment?.image?.height||1024)-2).toFixed(1)},
    uniforms:{...uniforms,envMap:{value:environment},blur:{value:blur}},vertexShader,
    fragmentShader:`
      #include <common>
      #include <cube_uv_reflection_fragment>
      ${atlasShader}
      uniform sampler2D envMap;
      uniform float blur;
      vec3 floorDirection(vec2 uv){
        float longitude=(uv.x-.5)*PI2,latitude=(.5-uv.y)*PI;
        return vec3(cos(latitude)*cos(longitude),sin(latitude),cos(latitude)*sin(longitude));
      }
      void main(){
        vec2 pixel=panoramaUv*vec2(1774.0,887.0);
        float y=(pixel.y-602.0)/146.0;
        float x=(pixel.x-623.0-10.0*y)/(48.0+20.0*y);
        float mask=(1.0-smoothstep(.55,1.0,abs(x)))
          *smoothstep(0.0,.045,y)*(1.0-smoothstep(.30,1.0,y));
        if(mask<.001)discard;
        // Flip the same photographed flames down onto the floor, then blur
        // their shapes into the soft, elongated highlights of polished wood.
        vec2 source=vec2(.5+x*.40,.94-y*.91);
        vec3 light=animatedColor(source)*.28
          +(animatedColor(source+vec2(.055,.10))+animatedColor(source-vec2(.055,.10)))*.22
          +(animatedColor(source+vec2(-.09,.06))+animatedColor(source-vec2(-.09,.06)))*.14;
        float energy=dot(light,vec3(.2126,.7152,.0722));
        vec3 wood=textureCubeUV(envMap,floorDirection(panoramaUv),blur).rgb;
        float grain=clamp(dot(wood,vec3(.2126,.7152,.0722))*4.0,.12,1.0);
        // Modulate the accepted reflection as well as adding a restrained warm
        // spill. Original plank seams and grain remain visible through the light.
        vec3 reflected=wood*(.68+energy*1.9)
          +vec3(.45,.12,.015)*energy*(.16+.84*grain);
        gl_FragColor=vec4(reflected*intensity,mask);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const reflection=new THREE.Mesh(floorGeometry,floorMaterial);
  reflection.name='fireplace-floor-reflection';reflection.renderOrder=-1;
  reflection.visible=!!atlas&&!!environment;
  const patches=[mesh,reflection];
  // Like Three's background, translation follows the camera, orientation does
  // not. Depth testing lets the table and pieces naturally occlude the light.
  for(const patch of patches)patch.onBeforeRender=(_renderer,_scene,camera)=>
    patch.matrixWorld.copyPosition(camera.matrixWorld);
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  let lastFrame=-Infinity,disposed=false,wasReduced=false;
  function update(milliseconds,camera,reducedMotion=false) {
    if(disposed)return false;
    if(!atlas)return false;
    for(const patch of patches){patch.position.copy(camera.position);patch.updateMatrixWorld();}
    if(reducedMotion){
      const changed=!wasReduced||material.uniforms.time.value!==0;
      wasReduced=true;material.uniforms.time.value=0;
      return changed;
    }
    const resumed=wasReduced;wasReduced=false;
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    if(!patches.some(patch=>patch.visible&&frustum.intersectsObject(patch)))return false;
    if(!resumed&&milliseconds-lastFrame<1000/24)return false;
    lastFrame=milliseconds;material.uniforms.time.value=milliseconds*.001;
    return true;
  }
  function dispose(){
    if(disposed)return;disposed=true;
    for(const patch of patches){patch.removeFromParent();patch.geometry.dispose();patch.material.dispose();}
    atlas?.dispose();
  }
  return {mesh,reflection,update,dispose};
}

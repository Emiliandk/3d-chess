import * as THREE from './vendor/three.module.js';

// Pixel coordinates in the immutable 1774 × 887 library panorama. The entire
// feather support stays inside the dark firebox, leaving the marble untouched.
const WIDTH=1774,HEIGHT=887;
const REGION={left:552,right:700,top:476,bottom:585};
const RADIUS=80;

export function panoramaDirection(u,v) {
  const longitude=(u-.5)*Math.PI*2,latitude=(.5-v)*Math.PI;
  return new THREE.Vector3(Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),Math.cos(latitude)*Math.sin(longitude));
}

export function createFireplace({atlas=null,rotation=1.5,intensity=.82}) {
  if(atlas){atlas.colorSpace=THREE.SRGBColorSpace;atlas.generateMipmaps=false;atlas.minFilter=THREE.LinearFilter;atlas.magFilter=THREE.LinearFilter;}
  const positions=[],uvs=[],indices=[];
  for(let y=0;y<=8;y++)for(let x=0;x<=12;x++) {
    const u=THREE.MathUtils.lerp(REGION.left,REGION.right,x/12)/WIDTH;
    const v=THREE.MathUtils.lerp(REGION.top,REGION.bottom,y/8)/HEIGHT;
    const direction=panoramaDirection(u,v).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);
    positions.push(...direction.multiplyScalar(RADIUS).toArray());uvs.push(u,v);
    if(x<12&&y<8){const a=y*13+x;indices.push(a,a+13,a+1,a+1,a+13,a+14);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  const material=new THREE.ShaderMaterial({
    name:'living-fireplace',transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{fireAtlas:{value:atlas},time:{value:0},intensity:{value:intensity}},
    vertexShader:`varying vec2 panoramaUv;
      void main(){panoramaUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      uniform sampler2D fireAtlas;
      uniform float time,intensity;
      varying vec2 panoramaUv;
      #include <common>
      vec3 frameColor(float frame,vec2 uv){
        vec2 cell=vec2(mod(frame,8.0),floor(frame/8.0));
        // Pixel centres plus extruded gutters prevent adjacent-frame bleed.
        vec2 pixel=cell*vec2(252.0,140.0)+vec2(2.5)+uv*vec2(247.0,135.0);
        vec2 at=vec2(pixel.x/2016.0,1.0-pixel.y/1820.0);
        vec2 stepSize=vec2(1.15/2016.0,1.15/1820.0);
        // Keep the photographed fire in the existing room's soft focus.
        return texture2D(fireAtlas,at).rgb*.5
          +(texture2D(fireAtlas,at+vec2(stepSize.x,0.0)).rgb
          +texture2D(fireAtlas,at-vec2(stepSize.x,0.0)).rgb
          +texture2D(fireAtlas,at+vec2(0.0,stepSize.y)).rgb
          +texture2D(fireAtlas,at-vec2(0.0,stepSize.y)).rgb)*.125;
      }
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
  // Like Three's background, translation follows the camera, orientation does
  // not. Depth testing lets the table and pieces naturally occlude the fire.
  mesh.onBeforeRender=(_renderer,_scene,camera)=>mesh.matrixWorld.copyPosition(camera.matrixWorld);
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  let lastFrame=-Infinity,disposed=false,wasReduced=false;
  function update(milliseconds,camera,reducedMotion=false) {
    if(disposed)return false;
    if(!atlas)return false;
    mesh.position.copy(camera.position);mesh.updateMatrixWorld();
    if(reducedMotion){
      const changed=!wasReduced||material.uniforms.time.value!==0;
      wasReduced=true;material.uniforms.time.value=0;
      return changed;
    }
    const resumed=wasReduced;wasReduced=false;
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    if(!frustum.intersectsObject(mesh))return false;
    if(!resumed&&milliseconds-lastFrame<1000/24)return false;
    lastFrame=milliseconds;material.uniforms.time.value=milliseconds*.001;
    return true;
  }
  function dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();atlas?.dispose();}
  return {mesh,update,dispose};
}

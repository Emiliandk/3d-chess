import * as THREE from './vendor/three.module.js';

// Pixel coordinates in the immutable 1774 × 887 library panorama. The entire
// feather/warp support stays inside the firebox, above the iron grate.
const WIDTH=1774,HEIGHT=887;
const REGION={left:574,right:676,top:493,bottom:567};
const RADIUS=80;

export function panoramaDirection(u,v) {
  const longitude=(u-.5)*Math.PI*2,latitude=(.5-v)*Math.PI;
  return new THREE.Vector3(Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),Math.cos(latitude)*Math.sin(longitude));
}

export function createFireplace({environment,rotation=1.5,intensity=.82,blur=.045}) {
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
    defines:{ENVMAP_TYPE_CUBE_UV:'',CUBEUV_TEXEL_WIDTH:1/environment.image.width,CUBEUV_TEXEL_HEIGHT:1/environment.image.height,CUBEUV_MAX_MIP:(Math.log2(environment.image.height)-2).toFixed(1)},
    uniforms:{envMap:{value:environment},time:{value:0},intensity:{value:intensity},blur:{value:blur}},
    vertexShader:`varying vec2 panoramaUv;
      void main(){panoramaUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      uniform sampler2D envMap;
      uniform float time,intensity,blur;
      varying vec2 panoramaUv;
      #include <common>
      #include <cube_uv_reflection_fragment>
      vec3 direction(vec2 uv){
        float longitude=(uv.x-.5)*2.0*PI,latitude=(.5-uv.y)*PI;
        return vec3(cos(latitude)*cos(longitude),sin(latitude),cos(latitude)*sin(longitude));
      }
      void main(){
        vec2 pixel=panoramaUv*vec2(1774.0,887.0);
        float mask=smoothstep(574.0,586.0,pixel.x)*(1.0-smoothstep(664.0,676.0,pixel.x))
          *smoothstep(493.0,509.0,pixel.y)*(1.0-smoothstep(559.0,567.0,pixel.y));
        if(mask<.001)discard;
        float height=clamp((564.0-pixel.y)/48.0,0.0,1.0);
        float wave=sin(pixel.x*.18+time*2.8)+.45*sin(pixel.y*.27-time*4.1);
        vec2 source=pixel;
        source.x+=height*(2.2*wave+sin(time*1.7));
        source.y+=(564.0-pixel.y)*(.13*sin(time*2.2+pixel.x*.13)+.07*sin(time*3.7-pixel.x*.21));
        vec3 color=textureCubeUV(envMap,direction(source/vec2(1774.0,887.0)),blur).rgb;
        float flicker=1.0+.07*sin(time*3.1)+.035*sin(time*7.3+1.2);
        gl_FragColor=vec4(color*intensity*flicker,mask);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='fireplace-panorama-animation';mesh.renderOrder=-1;
  // Like Three's background, translation follows the camera, orientation does
  // not. Depth testing lets the table and pieces naturally occlude the fire.
  mesh.onBeforeRender=(_renderer,_scene,camera)=>mesh.matrixWorld.copyPosition(camera.matrixWorld);
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  let lastFrame=-Infinity,disposed=false;
  function update(milliseconds,camera,reducedMotion=false) {
    if(disposed)return false;
    const wasVisible=mesh.visible;
    mesh.visible=!reducedMotion;
    if(reducedMotion)return wasVisible;
    mesh.position.copy(camera.position);mesh.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    if(!frustum.intersectsObject(mesh))return false;
    if(milliseconds-lastFrame<1000/24)return false;
    lastFrame=milliseconds;material.uniforms.time.value=milliseconds*.001;
    return true;
  }
  function dispose(){if(disposed)return;disposed=true;mesh.removeFromParent();geometry.dispose();material.dispose();}
  return {mesh,update,dispose};
}

import * as THREE from './vendor/three.module.js';

// The existing tabletop ends at y=-.91. All support geometry stays below it.
export function createTablePedestal({woodTexture,brass}){
  const group=new THREE.Group();group.name='walnut-table-pedestal';
  const map=woodTexture.clone();
  map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.anisotropy=8;map.needsUpdate=true;
  const walnut=new THREE.MeshPhysicalMaterial({map,color:0xc1a38b,roughness:.48,
    clearcoat:.28,clearcoatRoughness:.35});
  const shadowWood=walnut.clone();shadowWood.color.set(0x76604e);
  const metal=brass.clone();metal.roughness=.43;metal.color.set(0x9b7d42);
  const geometries=[];

  // Chamfered rectangular cross-sections produce real joinery and mouldings,
  // with vertical UV grain and flat normals on each broad timber face.
  function profile(name,rings,material=walnut){
    const positions=[],uv=[],indices=[];
    const perimeter=({w,d})=>{
      const x=w/2,z=d/2,c=Math.min(w,d)*.065;
      return [[-x+c,-z],[x-c,-z],[x,-z+c],[x,z-c],
        [x-c,z],[-x+c,z],[-x,z-c],[-x,-z+c]];
    };
    for(let r=0;r<rings.length-1;r++){
      const a=rings[r],b=rings[r+1],pa=perimeter(a),pb=perimeter(b);
      for(let i=0;i<8;i++){
        const j=(i+1)%8,start=positions.length/3;
        for(const [p,y] of [[pa[i],a.y],[pb[i],b.y],[pb[j],b.y],[pa[j],a.y]])positions.push(p[0],y,p[1]);
        const u0=i/2,u1=u0+Math.hypot(pa[j][0]-pa[i][0],pa[j][1]-pa[i][1])/4;
        uv.push(u0,a.y/7,u0,b.y/7,u1,b.y/7,u1,a.y/7);
        indices.push(start,start+1,start+2,start,start+2,start+3);
      }
    }
    // Close both ends so a low orbit cannot see hollow furniture.
    for(const [r,top] of [[0,false],[rings.length-1,true]]){
      const ring=rings[r],p=perimeter(ring),center=positions.length/3;
      positions.push(0,ring.y,0);uv.push(.5,.5);
      for(const [x,z] of p){positions.push(x,ring.y,z);uv.push(x/ring.w+.5,z/ring.d+.5);}
      for(let i=0;i<8;i++){
        const a=center+1+i,b=center+1+(i+1)%8;
        indices.push(...(top?[center,b,a]:[center,a,b]));
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometries.push(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
    mesh.castShadow=mesh.receiveShadow=true;
    // Decorative support must never intercept chess-square picking.
    mesh.raycast=()=>{};group.add(mesh);return mesh;
  }
  const ring=(y,w,d)=>({y,w,d});
  profile('recessed-table-apron',[
    ring(-1.52,14.8,12.8),ring(-1.40,15.3,13.3),
    ring(-1.03,15.3,13.3),ring(-.91,15.55,13.55)
  ],shadowWood);
  profile('pedestal-capital',[
    ring(-2.03,4.15,3.65),ring(-1.90,4.45,3.95),
    ring(-1.60,7.5,6.5),ring(-1.48,8.2,7.2)
  ]);
  profile('tapered-walnut-column',[
    ring(-8.05,4.9,4.25),ring(-7.65,4.4,3.8),
    ring(-2.3,3.65,3.2),ring(-2.03,4.15,3.65)
  ]);
  profile('upper-brass-inlay',[ring(-2.28,3.72,3.27),ring(-2.22,3.74,3.29)],metal);
  profile('column-foot-moulding',[
    ring(-8.43,6.3,5.5),ring(-8.25,6.3,5.5),
    ring(-8.08,5.05,4.4),ring(-7.99,4.95,4.3)
  ]);
  profile('stepped-pedestal-plinth',[
    ring(-9.25,7.7,6.7),ring(-9.12,8,7),ring(-8.86,8,7),
    ring(-8.65,7.4,6.4),ring(-8.5,7.4,6.4),ring(-8.43,6.3,5.5)
  ]);
  profile('plinth-brass-inlay',[ring(-8.89,8.015,7.015),ring(-8.83,7.93,6.93)],metal);
  profile('recessed-plinth-foot',[ring(-9.36,7.3,6.3),ring(-9.25,7.3,6.3)],shadowWood);

  // A transparent receiver grounds the foot against the photographed floor.
  const contactGeometry=new THREE.PlaneGeometry(22,20);geometries.push(contactGeometry);
  const contactMaterial=new THREE.ShadowMaterial({opacity:.24,depthWrite:false});
  const shadow=new THREE.Mesh(contactGeometry,contactMaterial);shadow.name='pedestal-floor-shadow';
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-9.37;shadow.receiveShadow=true;shadow.raycast=()=>{};

  const framingPoints=[];
  for(const x of [-8,8])for(const z of [-7,7])framingPoints.push(new THREE.Vector3(x,-.91,z));
  for(const x of [-4,4])for(const z of [-3.5,3.5])framingPoints.push(new THREE.Vector3(x,-9.36,z));
  return {group,shadow,framingPoints,dispose(){
    for(const geometry of geometries)geometry.dispose();
    for(const material of [walnut,shadowWood,metal,contactMaterial])material.dispose();map.dispose();
  }};
}

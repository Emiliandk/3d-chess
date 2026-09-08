import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import {fitChessView} from './camera.js';
import {BOARD_SURFACE_Y,createBoard} from './board.js';
import {pickChessSquare} from './picking.js';
import {createCognacProps} from './cognac-props.js';
import {createCognacRenderPass} from './cognac-render-pass.js';
import {createFireplace} from './fireplace.js';

const PIECES = {p:'pawn',r:'rook',n:'knight',b:'bishop',q:'queen',k:'king'};
const NAMES = {p:'bonde',r:'tårn',n:'springer',b:'løber',q:'dronning',k:'konge'};
export async function createChessScene({canvas,onSquare,onReady,onError,onCameraChange,onSquareFocus,viewMode=window.innerWidth<=900?'play':'room',onViewModeChange}) {
  if(viewMode!=='play'&&viewMode!=='room')throw new RangeError('Unknown chess view mode');
  const world = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.25;
  const camera=new THREE.PerspectiveCamera(38,1,.1,150);
  const controls=new OrbitControls(camera,canvas);
  controls.target.set(0,.25,0);
  controls.enableDamping=true;controls.dampingFactor=.09;
  controls.enablePan=false;controls.rotateSpeed=.55;controls.zoomSpeed=.7;
  controls.minPolarAngle=.12;controls.maxPolarAngle=1.28;
  controls.minDistance=10;controls.maxDistance=56;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
  controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_ROTATE};
  let needsRender=true,disposed=false,ready=false,state=null,side='w';
  let tableProps=null,cognacPass=null,fireplace=null,framingPoints=[];
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionChanged=()=>{needsRender=true;};
  reducedMotion.addEventListener('change',motionChanged);
  let keyboardSquare={r:6,c:4},keyboardVisible=false;
  const pieceRoot=new THREE.Group();world.add(pieceRoot);
  const pickTargets=[],pieceMeshes=new Map(),templates={};
  const loader=new THREE.TextureLoader();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const point=(r,c,y=BOARD_SURFACE_Y)=>new THREE.Vector3(c-3.5,y,r-3.5);
  function fitView(angles={}){return fitChessView(camera,controls.target,{viewMode,framingPoints,...angles});}
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(ready){fitView({azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle()});controls.update();}needsRender=true;}
  function resetView(nextSide=side){side=nextSide;resize();controls.target.set(0,.25,0);fitView({azimuth:(side==='b'?Math.PI:0)+.28});controls.update();needsRender=true;}
  function setViewMode(nextMode){
    if(nextMode!=='play'&&nextMode!=='room')throw new RangeError('Unknown chess view mode');
    if(nextMode===viewMode)return;
    viewMode=nextMode;
    fitView({azimuth:controls.getAzimuthalAngle()});
    controls.update();needsRender=true;onViewModeChange?.(viewMode);
  }
  resetView();
  const observer=new ResizeObserver(resize);observer.observe(canvas.parentElement);
  const hemi=new THREE.HemisphereLight(0xffedd0,0x3d2c23,2);world.add(hemi);
  const key=new THREE.DirectionalLight(0xffe1b2,3.7);key.position.set(-6,12,7);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;key.shadow.camera.near=.5;key.shadow.camera.far=35;key.shadow.normalBias=.02;key.shadow.bias=-.0001;key.shadow.radius=3;world.add(key);
  const fill=new THREE.DirectionalLight(0xe2eaf6,1.3);fill.position.set(8,5,-6);world.add(fill);
  const rim=new THREE.DirectionalLight(0xffc279,1.7);rim.position.set(-3,6,-8);world.add(rim);
  function box(w,h,d,y,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.y=y;m.receiveShadow=true;m.castShadow=true;world.add(m);return m;}
  const brass=new THREE.MeshStandardMaterial({color:0xb99753,metalness:.78,roughness:.3});
  const markerMats={selected:new THREE.MeshBasicMaterial({color:0xf5ca71}),legal:new THREE.MeshBasicMaterial({color:0x9eccac}),last:new THREE.MeshBasicMaterial({color:0xd4a65f,transparent:true,opacity:.18,depthWrite:false}),check:new THREE.MeshBasicMaterial({color:0xea7467}),focus:new THREE.MeshBasicMaterial({color:0xffffff})};
  const markerRoot=new THREE.Group();world.add(markerRoot);
  const ringGeo=new THREE.RingGeometry(.38,.415,48),dotGeo=new THREE.CircleGeometry(.105,32),lastGeo=new THREE.PlaneGeometry(.96,.96);
  function marker(geo,mat,r,c,y=BOARD_SURFACE_Y+.006){const m=new THREE.Mesh(geo,mat);m.rotation.x=-Math.PI/2;m.position.copy(point(r,c,y));markerRoot.add(m);}
  function updateMarkers(){markerRoot.clear();if(!state)return;if(state.lastMove)for(const p of [state.lastMove.from,state.lastMove.to])marker(lastGeo,markerMats.last,p.r,p.c,BOARD_SURFACE_Y+.003);if(state.selected)marker(ringGeo,markerMats.selected,state.selected.r,state.selected.c,BOARD_SURFACE_Y+.006);for(const p of state.legalTargets)marker(p.capture?ringGeo:dotGeo,markerMats.legal,p.r,p.c,BOARD_SURFACE_Y+.008);if(state.checkSquare)marker(ringGeo,markerMats.check,state.checkSquare.r,state.checkSquare.c,BOARD_SURFACE_Y+.011);if(keyboardVisible)marker(ringGeo,markerMats.focus,keyboardSquare.r,keyboardSquare.c,BOARD_SURFACE_Y+.015);needsRender=true;}
  function squareDescription(r,c){const piece=state?.board[r]?.[c];return `${'abcdefgh'[c]}${8-r}: ${piece?(piece.color==='w'?'hvid':'sort')+' '+NAMES[piece.type]:'tomt felt'}`;}
  function announce(){canvas.setAttribute('aria-label','3D-skakbræt. '+squareDescription(keyboardSquare.r,keyboardSquare.c));onSquareFocus?.(squareDescription(keyboardSquare.r,keyboardSquare.c));}
  function pick(e){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);return pickChessSquare({raycaster,pointer,camera,squares:pickTargets,pieces:pieceRoot.children,width:rect.width,height:rect.height});}
  const down=new Map();let gestureMoved=false;
  canvas.addEventListener('pointerdown',e=>{if(down.size===0)gestureMoved=false;down.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button});if(down.size>1)gestureMoved=true;keyboardVisible=false;updateMarkers();});
  canvas.addEventListener('pointermove',e=>{const p=down.get(e.pointerId);if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>6)gestureMoved=true;});
  canvas.addEventListener('pointercancel',e=>{down.delete(e.pointerId);gestureMoved=true;});
  canvas.addEventListener('pointerup',e=>{const p=down.get(e.pointerId);down.delete(e.pointerId);if(!p||p.button!==0||gestureMoved||!ready||Math.hypot(e.clientX-p.x,e.clientY-p.y)>6)return;const sq=pick(e);if(sq){keyboardSquare={...sq};announce();onSquare(sq.r,sq.c);}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function orbitBy(az,polar){const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));s.theta+=az;s.phi=THREE.MathUtils.clamp(s.phi+polar,controls.minPolarAngle,controls.maxPolarAngle);camera.position.copy(new THREE.Vector3().setFromSpherical(s).add(controls.target));controls.update();needsRender=true;}
  canvas.addEventListener('keydown',e=>{if(!ready)return;if(e.shiftKey&&e.key.startsWith('Arrow')){e.preventDefault();orbitBy(e.key==='ArrowLeft'?-.12:e.key==='ArrowRight'?.12:0,e.key==='ArrowUp'?-.08:e.key==='ArrowDown'?.08:0);return;}const offsets={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};if(offsets[e.key]){e.preventDefault();const [dr,dc]=offsets[e.key];keyboardSquare={r:THREE.MathUtils.clamp(keyboardSquare.r+dr,0,7),c:THREE.MathUtils.clamp(keyboardSquare.c+dc,0,7)};keyboardVisible=true;announce();updateMarkers();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();keyboardVisible=true;onSquare(keyboardSquare.r,keyboardSquare.c);updateMarkers();}else if(e.key.toLowerCase()==='r'){resetView();}else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();const v=camera.position.clone().sub(controls.target);v.setLength(THREE.MathUtils.clamp(v.length()*(e.key==='-'?1.12:.89),controls.minDistance,controls.maxDistance));camera.position.copy(controls.target.clone().add(v));controls.update();}else if(e.key==='Escape'){onSquare(-1,-1);keyboardVisible=false;updateMarkers();}});
  canvas.addEventListener('focus',()=>{keyboardVisible=true;announce();updateMarkers();});
  canvas.addEventListener('blur',()=>{keyboardVisible=false;updateMarkers();});
  controls.addEventListener('change',()=>{needsRender=true;onCameraChange?.(Math.cos(controls.getAzimuthalAngle())>=0?'w':'b');});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;onError?.(new Error('3D-visningen mistede forbindelsen til grafikken. Genindlæs for at fortsætte.'));});
  function renderScene(){if(cognacPass)cognacPass.render(world,camera);else renderer.render(world,camera);}
  function frame(time=0){if(disposed)return;requestAnimationFrame(frame);if(document.hidden)return;controls.update();if(ready&&fireplace?.update(time,camera,reducedMotion.matches))needsRender=true;if(needsRender){renderScene();needsRender=false;}}frame();
  const materials={};
  const api={resetView,setViewMode,getViewMode:()=>viewMode,update(next){state=next;if(!ready)return;renderer.shadowMap.needsUpdate=true;for(let r=0;r<8;r++)for(let c=0;c<8;c++){const key=`${r},${c}`,p=state.board[r][c],old=pieceMeshes.get(key),signature=p?`${p.color}${p.type}`:'';if(old&&old.userData.signature!==signature){pieceRoot.remove(old);pieceMeshes.delete(key);}if(p&&!pieceMeshes.has(key)){const group=templates[p.type].clone(true);group.scale.set(1.208,1,1.208);group.position.copy(point(r,c,BOARD_SURFACE_Y));if(p.color==='b')group.rotation.y=Math.PI;group.userData.square={r,c};group.userData.signature=signature;group.traverse(n=>{if(n.isMesh){n.material=materials[p.color];n.castShadow=true;n.receiveShadow=true;}});const collar=new THREE.Mesh(new THREE.CylinderGeometry(p.type==='n'?.173:.205,p.type==='n'?.185:.21,.035,48),brass);collar.position.y=p.type==='n'?.384:.055;group.add(collar);pieceRoot.add(group);pieceMeshes.set(key,group);}}updateMarkers();announce();},dispose(){disposed=true;observer.disconnect();reducedMotion.removeEventListener('change',motionChanged);fireplace?.dispose();cognacPass?.dispose();tableProps?.dispose();controls.dispose();renderer.dispose();}};
  try{
    const [wood,rough,normal,panorama,bottleTexture,...models]=await Promise.all([
      loader.loadAsync('./assets/wood_table_001_diff_1k.jpg'),loader.loadAsync('./assets/wood_table_001_rough_1k.jpg'),loader.loadAsync('./assets/wood_table_001_nor_gl_1k.jpg'),loader.loadAsync('./assets/library-panorama.png'),
      loader.loadAsync('./assets/cognac/gourry-bottle-reference.png'),
      ...Object.values(PIECES).map(name=>new GLTFLoader().loadAsync(`./assets/${name}.glb`))
    ]);
    wood.colorSpace=THREE.SRGBColorSpace;wood.anisotropy=8;wood.wrapS=wood.wrapT=THREE.RepeatWrapping;
    for(const t of [rough,normal]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
    panorama.mapping=THREE.EquirectangularReflectionMapping;panorama.colorSpace=THREE.SRGBColorSpace;
    // Align the fireplace/globe/chair side of the room with the initial board view.
    world.background=panorama;world.backgroundBlurriness=.045;world.backgroundIntensity=.82;world.backgroundRotation.y=1.5;
    const pmrem=new THREE.PMREMGenerator(renderer);world.environment=pmrem.fromEquirectangular(panorama).texture;world.environmentIntensity=.5;world.environmentRotation.copy(world.backgroundRotation);pmrem.dispose();
    fireplace=createFireplace({environment:world.environment,rotation:world.backgroundRotation.y,intensity:world.backgroundIntensity,blur:world.backgroundBlurriness});
    fireplace.mesh.visible=!reducedMotion.matches;world.add(fireplace.mesh);
    const walnut=new THREE.MeshPhysicalMaterial({color:0x9e7655,map:wood,roughnessMap:rough,roughness:.55,normalMap:normal,normalScale:new THREE.Vector2(.13,.13),clearcoat:.5,clearcoatRoughness:.27});
    const darkTile=walnut.clone();darkTile.color.set(0x9f7851);darkTile.roughness=.4;
    const lightTile=new THREE.MeshPhysicalMaterial({color:0xf0d5a3,roughness:.42,normalMap:normal,normalScale:new THREE.Vector2(.035,.035),clearcoat:.35,clearcoatRoughness:.3});
    const darkTrim=new THREE.MeshStandardMaterial({color:0x1d1008,roughness:.35});
    const board=createBoard({walnut,brass,darkTrim,lightTile,darkTile});
    world.add(board.group);pickTargets.push(...board.squares);
    const tableMat=walnut.clone();const tableMap=wood.clone();tableMap.repeat.set(2,2);tableMap.needsUpdate=true;tableMat.map=tableMap;tableMat.color.set(0x76523a);tableMat.roughness=.64;box(16,.38,14,-.72,tableMat);
    tableProps=createCognacProps({bottleTexture});world.add(tableProps.group);framingPoints=tableProps.framingPoints;
    cognacPass=createCognacRenderPass(renderer,{shells:tableProps.shells});
    function label(text,x,z,rotation=0){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#d7b780';ctx.font='50px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,66);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.31,.31),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));mesh.rotation.set(-Math.PI/2,0,rotation);mesh.position.set(x,BOARD_SURFACE_Y+.003,z);world.add(mesh);}
    for(let i=0;i<8;i++){label('abcdefgh'[i],i-3.5,4.35);label('abcdefgh'[i],i-3.5,-4.35,Math.PI);label(String(8-i),-4.35,i-3.5);label(String(8-i),4.35,i-3.5,Math.PI);}
    materials.w=new THREE.MeshPhysicalMaterial({color:0xf0d9ad,roughness:.32,clearcoat:.55,clearcoatRoughness:.2,metalness:.06});
    materials.b=new THREE.MeshPhysicalMaterial({color:0x55412c,map:wood,roughness:.3,clearcoat:.62,clearcoatRoughness:.2,metalness:.06,normalMap:normal,normalScale:new THREE.Vector2(.035,.035)});
    Object.keys(PIECES).forEach((type,i)=>templates[type]=models[i].scene);
    renderer.shadowMap.needsUpdate=true;ready=true;resetView();if(state)api.update(state);needsRender=true;renderScene();onReady?.();
  }catch(error){onError?.(error);throw error;}
  return api;
}

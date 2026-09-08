import {Vector3} from './vendor/three.module.js';
// Conservatively include the entire raised frame and the tallest chess piece.
const corners=[];
for(const x of [-4.84,4.84])for(const y of [-.51,1.60])for(const z of [-4.84,4.84])corners.push(new Vector3(x,y,z));

// Both presets use the same perspective camera and free orbit controls. The
// play preset reserves the viewport for the board; the room preset includes
// the glasses and bottle. An explicit polar angle keeps a user's chosen
// elevation when the viewport changes (including browser fullscreen).
export function fitChessView(camera,target,{viewMode='room',framingPoints=[],azimuth=.28,polar}={}){
  if(viewMode!=='play'&&viewMode!=='room')throw new RangeError('Unknown chess view mode');
  return fitBoardCamera(camera,target,{
    azimuth,
    polar:polar??(viewMode==='play'?.62:.84),
    margin:viewMode==='play'?.92:.88,
    framingPoints:viewMode==='room'?framingPoints:[]
  });
}

export function fitBoardCamera(camera,target,{azimuth=.28,polar=.84,margin=.88,framingPoints=[]}={}){
  const points=[...corners,...framingPoints];
  const direction=new Vector3(Math.sin(azimuth)*Math.sin(polar),Math.cos(polar),Math.cos(azimuth)*Math.sin(polar));
  let distance=16;
  for(let i=0;i<10;i++){
    camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld();
    const bound=Math.max(...points.map(c=>{const p=c.clone().project(camera);return Math.max(Math.abs(p.x),Math.abs(p.y));}));
    if(bound<=margin)break;
    distance*=Math.max(1.04,bound/margin);
  }
  return distance;
}

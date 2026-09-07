import {Vector3} from './vendor/three.module.js';
// Conservatively include the entire raised frame and the tallest chess piece.
const corners=[];
for(const x of [-4.84,4.84])for(const y of [-.51,1.60])for(const z of [-4.84,4.84])corners.push(new Vector3(x,y,z));
export function fitBoardCamera(camera,target,{azimuth=.28,polar=.84,margin=.88}={}){
  const direction=new Vector3(Math.sin(azimuth)*Math.sin(polar),Math.cos(polar),Math.cos(azimuth)*Math.sin(polar));
  let distance=16;
  for(let i=0;i<10;i++){
    camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld();
    const bound=Math.max(...corners.map(c=>{const p=c.clone().project(camera);return Math.max(Math.abs(p.x),Math.abs(p.y));}));
    if(bound<=margin)break;
    distance*=Math.max(1.04,bound/margin);
  }
  return distance;
}

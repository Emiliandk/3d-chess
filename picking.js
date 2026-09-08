import {Vector2} from './vendor/three.module.js';

function squareOf(hit) {
  let node=hit?.object;
  while(node&&!node.userData.square)node=node.parent;
  return node?.userData.square||null;
}

// Thin silhouettes, particularly the knight's head, need a small allowance
// in screen pixels. A direct hit on another piece always keeps priority.
export function pickChessSquare({raycaster,pointer,camera,squares,pieces,width,height,tolerance=3}) {
  raycaster.setFromCamera(pointer,camera);
  const pieceHit=raycaster.intersectObjects(pieces,true)[0];
  const boardHit=raycaster.intersectObjects(squares,true)[0];
  if(pieceHit&&(!boardHit||pieceHit.distance<=boardHit.distance))return squareOf(pieceHit);
  const fallback=squareOf(boardHit);
  if(!(width>0&&height>0&&tolerance>0))return fallback;

  const sample=new Vector2();
  for(const radius of [tolerance/2,tolerance]) {
    let nearest=null;
    for(let step=0;step<8;step++) {
      const angle=step*Math.PI/4;
      sample.set(pointer.x+Math.cos(angle)*radius*2/width,pointer.y+Math.sin(angle)*radius*2/height);
      raycaster.setFromCamera(sample,camera);
      const hit=raycaster.intersectObjects(pieces,true)[0];
      if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
    }
    if(nearest)return squareOf(nearest);
  }
  return fallback;
}

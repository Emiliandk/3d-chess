import {Plane,Raycaster,Vector2,Vector3} from './vendor/three.module.js';
import {BOARD_SURFACE_Y} from './board.js';

const sameSquare=(a,b)=>a&&b&&a.r===b.r&&a.c===b.c;
const lift=.14,threshold=6;

export function squareAtPosition({x,z}){
  if(!Number.isFinite(x)||!Number.isFinite(z)||x< -4||x>=4||z< -4||z>=4)return null;
  return {r:Math.floor(z+4),c:Math.floor(x+4)};
}

// Project onto the height where the piece was grabbed, so its grabbed point
// stays under the cursor even when the camera looks across the board.
export function projectDragPointer({event,canvas,camera,height,raycaster=new Raycaster()}){
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  const pointer=new Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
  raycaster.setFromCamera(pointer,camera);
  return raycaster.ray.intersectPlane(new Plane(new Vector3(0,1,0),-height),new Vector3());
}

export function createPieceDrag({canvas,camera,controls,pick,getPiece,getState,canMove=()=>true,select,click,drop,onChange,windowTarget=window,documentTarget=document}){
  const raycaster=new Raycaster(),listeners=[];
  let active=null,selecting=false;
  function available(square){
    const state=getState(),piece=state?.board[square.r]?.[square.c];
    return canMove()&&state&&!state.gameOver&&!state.pendingPromotion&&!state.engine.thinking&&
      state.turn===state.humanColor&&piece?.color===state.humanColor;
  }
  function changed(){
    canvas.dataset.pieceDragging=String(Boolean(active?.dragging));
    onChange?.();
  }
  function finish(){
    if(!active)return null;
    const drag=active;active=null;
    drag.piece.position.copy(drag.origin);
    controls.enabled=drag.enabled;controls.enableDamping=drag.damping;
    if(canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
    changed();return drag;
  }
  function reconcile(){
    if(!active)return;
    const state=getState();
    if(!available(active.from)||state.fen!==active.fen||
      (active.dragging&&!selecting&&!sameSquare(state.selected,active.from)))finish();
  }
  function move(event){
    reconcile();
    if(!active)return;
    if(!active.dragging){
      if(Math.hypot(event.clientX-active.x,event.clientY-active.y)<=threshold)return;
      active.dragging=true;selecting=true;
      try{select(active.from);}finally{selecting=false;}
      reconcile();if(!active)return;
    }
    const position=projectDragPointer({event,canvas,camera,height:active.height,raycaster});
    active.target=null;
    if(position){
      active.piece.position.set(position.x+active.offset.x,active.origin.y+lift,position.z+active.offset.z);
      const rect=canvas.getBoundingClientRect();
      const inside=event.clientX>=rect.left&&event.clientX<rect.left+rect.width&&event.clientY>=rect.top&&event.clientY<rect.top+rect.height;
      const square=inside?squareAtPosition(active.piece.position):null;
      if(square&&getState().legalTargets.some(target=>sameSquare(square,target)))active.target=square;
    }
    changed();
  }
  function pointerDown(event){
    if(active){finish();return;}
    if(event.pointerType!=='mouse'||event.button!==0||event.isPrimary===false)return;
    const from=pick(event);
    if(!from||!available(from))return;
    const piece=getPiece(from);if(!piece)return;
    const enabled=controls.enabled,damping=controls.enableDamping;
    controls.enableDamping=false;controls.update();controls.enabled=false;
    piece.updateWorldMatrix(true,true);
    const base=projectDragPointer({event,canvas,camera,height:BOARD_SURFACE_Y,raycaster});
    const hit=raycaster.intersectObject(piece,true)[0];
    const grabbed=hit?.point??base,height=(grabbed?.y??BOARD_SURFACE_Y)+lift;
    if(!grabbed){controls.enabled=enabled;controls.enableDamping=damping;return;}
    active={id:event.pointerId,from:{...from},piece,origin:piece.position.clone(),height,
      offset:new Vector3(piece.position.x-grabbed.x,0,piece.position.z-grabbed.z),
      x:event.clientX,y:event.clientY,fen:getState().fen,enabled,damping,dragging:false,target:null};
    // Capture before OrbitControls handles the press. Other board gestures
    // remain camera gestures; this pointer belongs to the chosen piece.
    event.stopImmediatePropagation();event.preventDefault();
    canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});changed();
  }
  function pointerMove(event){
    if(active?.id!==event.pointerId)return;
    event.stopImmediatePropagation();
    if(!(event.buttons&1)){finish();return;}
    move(event);
  }
  function pointerUp(event){
    if(active?.id!==event.pointerId)return;
    event.stopImmediatePropagation();
    move(event);if(!active)return;
    const drag=finish();
    if(!drag.dragging)click(drag.from);
    else if(drag.target)drop(drag.from,drag.target);
  }
  function pointerCancel(event){if(active?.id===event.pointerId){event.stopImmediatePropagation();finish();}}
  function listen(target,type,listener,capture=false){target.addEventListener(type,listener,capture);listeners.push(()=>target.removeEventListener(type,listener,capture));}
  for(const [type,handler] of Object.entries({pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerUp,pointercancel:pointerCancel,lostpointercapture:pointerCancel}))listen(canvas,type,handler,true);
  for(const type of ['blur','keydown','wheel'])listen(canvas,type,finish,true);
  listen(windowTarget,'blur',finish);
  listen(documentTarget,'visibilitychange',()=>{if(documentTarget.hidden)finish();});
  return {cancel:finish,reconcile,getTarget:()=>active?.target??null,
    dispose(){finish();for(const remove of listeners)remove();}};
}

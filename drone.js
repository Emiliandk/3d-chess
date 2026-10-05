import {Spherical,Vector3} from './vendor/three.module.js';

// Match the calm 90-second orbit on academy.emilian.dk.
export const DRONE_ORBIT_SECONDS=90;
const speed=2*Math.PI/DRONE_ORBIT_SECONDS;

export function createDroneFlight({camera,controls,fitOrbit,onChange}){
  const orbit=new Spherical(),offset=new Vector3();
  let running=false,reducedMotion=false,lastTime=null,savedDamping;
  const getState=()=>({running,reducedMotion});
  const announce=()=>onChange?.(getState());
  function refit(){
    fitOrbit({azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle()});
    orbit.setFromVector3(offset.copy(camera.position).sub(controls.target));
    controls.update();
  }
  function pause(){
    if(!running)return;
    running=false;lastTime=null;controls.enableDamping=savedDamping;
    announce();
  }
  function start(){
    if(running||reducedMotion)return false;
    savedDamping=controls.enableDamping;
    // Flush residual manual rotation before taking ownership of the camera.
    controls.enableDamping=false;controls.update();
    refit();running=true;lastTime=null;announce();return true;
  }
  return {
    start,pause,refit,getState,
    toggle(){if(running)pause();else start();},
    setReducedMotion(value){
      const next=Boolean(value);
      if(next===reducedMotion)return;
      reducedMotion=next;
      if(next&&running)pause();else announce();
    },
    update(time,{hidden=false}={}){
      if(!running||hidden){lastTime=null;return false;}
      if(lastTime===null){lastTime=time;return false;}
      // This slow orbit only needs 30 redraws per second.
      if(time-lastTime<1000/30)return false;
      // Hidden tabs and slow frames must never cause a camera jump.
      const delta=Math.min(100,Math.max(0,time-lastTime))/1000;
      lastTime=time;
      if(!delta)return false;
      orbit.theta=(orbit.theta+speed*delta)%(2*Math.PI);
      camera.position.copy(controls.target).add(offset.setFromSpherical(orbit));
      controls.update();return true;
    }
  };
}

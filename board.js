import * as THREE from './vendor/three.module.js';

// One shared height keeps pieces and move indicators above the playing surface.
export const BOARD_SURFACE_Y = .04;

export function createBoard({walnut,brass,darkTrim,lightTile,darkTile}) {
  const group=new THREE.Group();
  group.name='chess-board';
  const squares=[];
  function box(name,width,height,depth,centerY,material) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
    mesh.name=name;
    mesh.position.y=centerY;
    mesh.receiveShadow=true;
    mesh.castShadow=true;
    group.add(mesh);
    return mesh;
  }

  box('board-base',9.65,.22,9.65,-.39,darkTrim);
  box('board-edge-inlay',9.5,.035,9.5,-.2625,brass);
  // The frame must stay below the tiles. The former .027 frame top hid .022 planes.
  box('board-wood-frame',9.5,.27,9.5,.012-.27/2,walnut);
  const tileThickness=.014;
  const tileBottom=BOARD_SURFACE_Y-tileThickness;
  box('board-playing-inlay',8.13,.025,8.13,tileBottom-.025/2,brass);

  const tileGeometry=new THREE.BoxGeometry(1,tileThickness,1);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++) {
    const tile=new THREE.Mesh(tileGeometry,(r+c)%2===0?lightTile:darkTile);
    tile.name=`square-${'abcdefgh'[c]}${8-r}`;
    tile.position.set(c-3.5,BOARD_SURFACE_Y-tileThickness/2,r-3.5);
    tile.receiveShadow=true;
    tile.castShadow=true;
    tile.userData.square={r,c};
    group.add(tile);
    squares.push(tile);
  }
  return {group,squares};
}

import * as THREE from './vendor/three.module.js';

const TABLE_SURFACE_Y = -.53;
const ROUND_SEGMENTS = 64;
const REFERENCE_SIZE = 1000;

/**
 * Tabletop objects modelled from the supplied Gourry bottle and Riedel glass.
 * One unit is one chess square. Glasses are 3 units tall; the bottle is 5.
 *
 * The caller owns bottleTexture. This factory owns all geometry, materials and
 * its texture clone, whose image pixels remain the original uploaded image.
 * Call dispose() when removing the scene. Both glasses share GPU resources.
 */
export function createCognacProps({bottleTexture}) {
  if (!bottleTexture?.isTexture) {
    throw new TypeError('The cognac bottle reference texture is required.');
  }

  const geometries = new Set();
  const materials = new Set();
  const reference = bottleTexture.clone();
  reference.colorSpace = THREE.SRGBColorSpace;
  reference.wrapS = reference.wrapT = THREE.ClampToEdgeWrapping;
  reference.anisotropy = 4;
  reference.needsUpdate = true;

  const group = new THREE.Group();
  group.name = 'cognac-tabletop-props';
  group.userData.decorative = true;

  function material(parameters) {
    const result = new THREE.MeshPhysicalMaterial(parameters);
    materials.add(result);
    return result;
  }

  function geometry(value) {
    geometries.add(value);
    return value;
  }

  function lathe(profile, segments = ROUND_SEGMENTS, start = 0, length = Math.PI * 2) {
    return geometry(new THREE.LatheGeometry(
      profile.map(([radius, height]) => new THREE.Vector2(radius, height)),
      segments, start, length
    ));
  }

  function mesh(parent, name, shape, finish, {shadow = false, order = 0} = {}) {
    const result = new THREE.Mesh(shape, finish);
    result.name = name;
    result.castShadow = shadow;
    result.receiveShadow = true;
    result.renderOrder = order;
    result.userData.decorative = true;
    // Decorative objects never become board/piece input targets.
    result.raycast = () => {};
    parent.add(result);
    return result;
  }

  // UV windows sample the unmodified reference photograph. In particular, the
  // printed label and seal are actual supplied pixels, not recreated lettering.
  function referenceWindow(shape, left, top, right, bottom) {
    const uv = shape.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i,
        (left + uv.getX(i) * (right - left)) / REFERENCE_SIZE,
        1 - bottom / REFERENCE_SIZE + uv.getY(i) * (bottom - top) / REFERENCE_SIZE
      );
    }
    uv.needsUpdate = true;
    return shape;
  }

  const crystal = material({
    color: 0xffffff, metalness: 0, roughness: .065,
    transmission: 1, ior: 1.52, thickness: .018,
    attenuationColor: 0xf8fbf4, attenuationDistance: 12,
    envMapIntensity: 1.15, clearcoat: .12, clearcoatRoughness: .04
  });
  const solidCrystal = material({
    color: 0xffffff, metalness: 0, roughness: .08,
    transmission: 1, ior: 1.52, thickness: .12,
    attenuationColor: 0xf8fbf4, attenuationDistance: 12,
    envMapIntensity: 1.1
  });

  // r180 captures opaque objects for the glass transmission pass. Keeping the
  // small liquid volumes opaque makes them visible through every glass wall
  // without depending on sorting multiple nested transmission layers. Their
  // curved sides and level, glossy surfaces still catch the real room lighting.
  const cognac = material({
    color: 0x743006, metalness: 0, roughness: .14,
    ior: 1.36, clearcoat: 1, clearcoatRoughness: .055,
    envMapIntensity: .85
  });
  const meniscus = material({
    color: 0x98531b, metalness: 0, roughness: .07,
    ior: 1.36, clearcoat: 1, clearcoatRoughness: .035,
    envMapIntensity: 1.15
  });

  // Broad thin foot and a long, slender stem; the low point rests on the table.
  const footAndStem = lathe([
    [0, 0], [.36, 0], [.475, .007], [.525, .022], [.54, .043],
    [.529, .061], [.494, .079], [.413, .095], [.295, .116],
    [.187, .143], [.119, .184], [.084, .235], [.062, .305],
    [.048, .455], [.042, .71], [.043, .95], [.048, 1.115],
    [.06, 1.257], [.083, 1.366], [.099, 1.414], [0, 1.436]
  ]);

  // Continuous exterior -> rounded lip -> interior profile creates a genuinely
  // hollow tulip bowl, with an open mouth instead of a solid transparent cone.
  const bowl = lathe([
    [0, 1.384], [.079, 1.397], [.134, 1.427], [.199, 1.478],
    [.27, 1.552], [.331, 1.635], [.383, 1.725], [.423, 1.825],
    [.447, 1.927], [.454, 2.026], [.446, 2.15], [.424, 2.304],
    [.396, 2.468], [.371, 2.633], [.359, 2.776], [.364, 2.892],
    [.379, 2.972], [.391, 2.993], [.387, 3], [.379, 2.998],
    [.368, 2.973], [.353, 2.892], [.348, 2.776], [.36, 2.633],
    [.385, 2.468], [.413, 2.304], [.435, 2.15], [.442, 2.026],
    [.435, 1.932], [.411, 1.833], [.372, 1.736], [.322, 1.647],
    [.261, 1.566], [.193, 1.496], [.128, 1.45], [.073, 1.427],
    [0, 1.42]
  ]);
  const pour = lathe([
    [0, 1.432], [.065, 1.438], [.119, 1.458], [.179, 1.501],
    [.245, 1.569], [.302, 1.648], [.35, 1.735], [.389, 1.831],
    [.407, 1.903], [.402, 1.899], [0, 1.899]
  ]);
  const pourSurface = geometry(new THREE.CircleGeometry(.4005, ROUND_SEGMENTS));

  function glass(name, x, z) {
    const result = new THREE.Group();
    result.name = name;
    result.position.set(x, TABLE_SURFACE_Y, z);
    result.userData.decorative = true;
    result.userData.height = 3;
    mesh(result, 'crystal-foot-and-stem', footAndStem, solidCrystal);
    mesh(result, 'hollow-tulip-bowl', bowl, crystal);
    mesh(result, 'small-cognac-pour', pour, cognac, {shadow: true});
    const surface = mesh(result, 'level-cognac-meniscus', pourSurface, meniscus);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 1.8995;
    group.add(result);
    return result;
  }

  // Each player's right-hand side, outside the frame and within easy reach.
  const whiteGlass = glass('white-player-cognac-glass', 6.15, 5.1);
  const blackGlass = glass('black-player-cognac-glass', -6.15, -5.1);

  const bottle = new THREE.Group();
  bottle.name = 'gourry-de-chadeville-cognac-bottle';
  bottle.position.set(-6.9, TABLE_SURFACE_Y, .8);
  bottle.rotation.y = .28;
  bottle.userData.decorative = true;
  bottle.userData.height = 5;
  group.add(bottle);

  const bottleGlass = material({
    color: 0xf5f6e9, metalness: 0, roughness: .09,
    transmission: 1, ior: 1.5, thickness: .045,
    attenuationColor: 0xd4ddbd, attenuationDistance: 5,
    envMapIntensity: 1.1, clearcoat: .15, clearcoatRoughness: .06
  });
  const bottledCognac = material({
    color: 0x481704, metalness: 0, roughness: .13,
    ior: 1.36, clearcoat: 1, clearcoatRoughness: .05,
    envMapIntensity: .9
  });
  const labelPaper = material({
    color: 0xffffff, map: reference, roughness: .74, metalness: 0,
    clearcoat: .04, clearcoatRoughness: .65
  });
  const stampedSeal = material({
    color: 0xffffff, map: reference, roughness: .7, metalness: .08
  });
  const foil = material({
    color: 0x99632e, roughness: .71, metalness: .16,
    clearcoat: .04, clearcoatRoughness: .5
  });

  // Slender, almost straight lower body; rounded shoulders taper into the long
  // clear neck seen in the reference. The bottom has a recessed central punt.
  mesh(bottle, 'hollow-bottle-glass', lathe([
    [0, .145], [.20, .105], [.35, .035], [.43, 0], [.537, 0],
    [.573, .035], [.588, .09], [.592, .17], [.59, .42],
    [.59, 2.67], [.585, 2.83], [.565, 2.998], [.519, 3.17],
    [.451, 3.354], [.372, 3.555], [.315, 3.722], [.277, 3.879],
    [.255, 4.048], [.238, 4.268], [.239, 4.517], [.246, 4.76],
    [.227, 4.76], [.22, 4.517], [.219, 4.268], [.235, 4.048],
    [.257, 3.879], [.295, 3.722], [.352, 3.555], [.431, 3.354],
    [.498, 3.17], [.544, 2.998], [.564, 2.83], [.569, 2.67],
    [.569, .42], [.567, .19], [.546, .12], [.442, .079],
    [.362, .103], [.218, .209], [0, .246]
  ]), bottleGlass);

  mesh(bottle, 'bottled-cognac', lathe([
    [0, .257], [.208, .22], [.351, .116], [.435, .091],
    [.535, .135], [.555, .201], [.556, .42], [.556, 2.67],
    [.551, 2.827], [.531, 2.991], [.485, 3.16], [.418, 3.342],
    [.339, 3.545], [.282, 3.71], [.258, 3.812], [.252, 3.808],
    [0, 3.808]
  ]), bottledCognac, {shadow: true});
  const bottleSurface = mesh(bottle, 'bottle-fill-surface',
    geometry(new THREE.CircleGeometry(.25, ROUND_SEGMENTS)), meniscus);
  bottleSurface.rotation.x = -Math.PI / 2;
  bottleSurface.position.y = 3.8085;

  const labelGeometry = referenceWindow(
    geometry(new THREE.CylinderGeometry(.594, .594, 1.95, 48, 1, true, -1.15, 2.3)),
    411, 478, 588, 790
  );
  const printedLabel = mesh(bottle, 'original-gourry-label', labelGeometry, labelPaper, {shadow: true});
  printedLabel.position.y = 1.6625;

  // Curve the original seal around the shoulder rather than suspending a flat
  // image in front of it. Concentric rings keep the small decal above the glass
  // between vertices as well as around its edge.
  const shoulder = [[3.17, .519], [3.354, .451], [3.555, .372], [3.722, .315]];
  const sealPositions = [], sealUvs = [], sealIndices = [];
  const sealSegments = 48, sealRings = 8, sealRadius = .221;
  function sealVertex(x, y) {
    const px = x + .075, py = y * .9 + 3.405;
    const upper = shoulder.findIndex(([height]) => height >= py);
    const [lowY, lowR] = shoulder[Math.max(0, upper - 1)];
    const [highY, highR] = shoulder[Math.max(1, upper)];
    const radius = THREE.MathUtils.lerp(lowR, highR, (py - lowY) / (highY - lowY));
    sealPositions.push(px, py, Math.sqrt(radius * radius - px * px) + .009);
    sealUvs.push(.5 + x / (sealRadius * 2), .5 + y / (sealRadius * 2));
  }
  sealVertex(0, 0);
  for (let ring = 1; ring <= sealRings; ring++) {
    for (let i = 0; i < sealSegments; i++) {
      const angle = i / sealSegments * Math.PI * 2;
      sealVertex(Math.cos(angle) * sealRadius * ring / sealRings,
        Math.sin(angle) * sealRadius * ring / sealRings);
    }
    for (let i = 0; i < sealSegments; i++) {
      const next = (i + 1) % sealSegments;
      const outer = 1 + (ring - 1) * sealSegments;
      if (ring === 1) {
        sealIndices.push(0, outer + i, outer + next);
      } else {
        const inner = outer - sealSegments;
        sealIndices.push(inner + i, outer + i, outer + next,
          inner + i, outer + next, inner + next);
      }
    }
  }
  const sealGeometry = geometry(new THREE.BufferGeometry());
  sealGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sealPositions, 3));
  sealGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(sealUvs, 2));
  sealGeometry.setIndex(sealIndices);
  sealGeometry.computeVertexNormals();
  referenceWindow(sealGeometry, 483, 322, 553, 382);
  mesh(bottle, 'original-embossed-seal', sealGeometry, stampedSeal, {shadow: true});

  mesh(bottle, 'warm-brown-neck-capsule', lathe([
    [0, 4.295], [.191, 4.295], [.222, 4.313], [.231, 4.37],
    [.235, 4.467], [.231, 4.58], [.244, 4.709], [.251, 4.841],
    [.247, 4.926], [.232, 4.975], [.194, 5], [0, 5]
  ], 48), foil, {shadow: true});

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group, true);
  // Per-object corners give the camera enough information without including
  // large empty regions above and between the props.
  const framingPoints = [];
  for (const object of [whiteGlass, blackGlass, bottle]) {
    const box = new THREE.Box3().setFromObject(object, true);
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          framingPoints.push(new THREE.Vector3(x, y, z));
        }
      }
    }
  }

  let disposed = false;
  return {
    group, bounds, framingPoints,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const value of geometries) value.dispose();
      for (const value of materials) value.dispose();
      reference.dispose();
    }
  };
}

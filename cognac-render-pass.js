import * as THREE from './vendor/three.module.js';

const MAX_CAPTURE_EDGE = 1024;
const CAPTURE_MAP = 'cognacSceneSampler';
const CAPTURE_SIZE = 'cognacSceneSamplerSize';

/**
 * Give the outer glass a refraction image that already contains the liquid.
 * Three r180's normal transmission image only contains opaque scene objects.
 * This extra, bounded render uses public APIs and runs only when the caller
 * redraws the scene. It never samples the render target while writing to it.
 */
export function createCognacRenderPass(renderer, {shells}) {
  if (!Array.isArray(shells) || shells.some(shell => !shell?.isMesh)) {
    throw new TypeError('Cognac refraction requires an array of glass meshes.');
  }

  const glassShells = [...new Set(shells)];
  const shellMaterials = [...new Set(glassShells.flatMap(shell =>
    Array.isArray(shell.material) ? shell.material : [shell.material]
  ))];
  if (shellMaterials.some(material => !material?.isMeshPhysicalMaterial || material.transmission <= 0)) {
    throw new TypeError('Cognac glass shells must use transmissive physical materials.');
  }

  const supportsHalfFloat = renderer.extensions.has('EXT_color_buffer_half_float') ||
    renderer.extensions.has('EXT_color_buffer_float');
  const capture = new THREE.WebGLRenderTarget(1, 1, {
    type: supportsHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: true,
    stencilBuffer: false,
    // An ordinary render target stays linear and is not tone-mapped by r180.
    colorSpace: THREE.LinearSRGBColorSpace
  });
  capture.texture.name = 'cognac-scene-with-liquid';

  const sampler = {value: capture.texture};
  const samplerSize = {value: new THREE.Vector2(1, 1)};
  const drawingSize = new THREE.Vector2();
  const bindings = [];
  let captureCamera = null;
  let disposed = false;
  let rendering = false;

  for (const material of shellMaterials) {
    const onBeforeCompile = material.onBeforeCompile;
    const customProgramCacheKey = material.customProgramCacheKey;
    const priorProgramKey = customProgramCacheKey.call(material);
    bindings.push({material, onBeforeCompile, customProgramCacheKey});

    material.onBeforeCompile = function(shader, activeRenderer) {
      onBeforeCompile.call(this, shader, activeRenderer);
      const include = '#include <transmission_pars_fragment>';
      if (!shader.fragmentShader.includes(include)) {
        throw new Error('The cognac glass shader requires the Three r180 transmission chunk.');
      }
      // Keep Three's built-in uniforms intact: the renderer updates them itself.
      // Only this material's expanded chunk reads the separately owned capture.
      const transmission = THREE.ShaderChunk.transmission_pars_fragment
        .replace(/\btransmissionSamplerMap\b/g, CAPTURE_MAP)
        .replace(/\btransmissionSamplerSize\b/g, CAPTURE_SIZE);
      shader.fragmentShader = shader.fragmentShader.replace(include, transmission);
      shader.uniforms[CAPTURE_MAP] = sampler;
      shader.uniforms[CAPTURE_SIZE] = samplerSize;
    };
    material.customProgramCacheKey = () => `${priorProgramKey}|cognac-liquid-capture-v1`;
    material.needsUpdate = true;
  }

  function render(scene, camera) {
    if (disposed) throw new Error('The cognac render pass has been disposed.');
    if (rendering) throw new Error('The cognac render pass cannot render recursively.');
    if (!camera?.isCamera) throw new TypeError('The cognac render pass requires a Three camera.');
    rendering = true;
    try {
      // r180 caches its internal transmission target per camera ID. A stable
      // separate camera keeps the bounded capture and full-size canvas targets
      // from resizing and reallocating each other on every orbit frame.
      if (!captureCamera) captureCamera = camera.clone();
      else captureCamera.copy(camera, false);
      renderer.getDrawingBufferSize(drawingSize);
      const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(drawingSize.x, drawingSize.y, 1));
      const width = Math.max(1, Math.round(drawingSize.x * scale));
      const height = Math.max(1, Math.round(drawingSize.y * scale));
      if (capture.width !== width || capture.height !== height) {
        capture.setSize(width, height);
        samplerSize.value.set(width, height);
      }

      const previousTarget = renderer.getRenderTarget();
      const previousCubeFace = renderer.getActiveCubeFace();
      const previousMipmapLevel = renderer.getActiveMipmapLevel();
      const visibility = glassShells.map(shell => shell.visible);
      try {
        for (const shell of glassShells) shell.visible = false;
        // setRenderTarget installs the target's physical-pixel viewport and
        // scissor. Do not use setViewport here: it multiplies by device ratio
        // even for render targets and would also change the canvas viewport.
        renderer.setRenderTarget(capture);
        renderer.clear();
        renderer.render(scene, captureCamera);
      } finally {
        glassShells.forEach((shell, index) => { shell.visible = visibility[index]; });
        renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel);
      }
      renderer.render(scene, camera);
    } finally {
      rendering = false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const {material, onBeforeCompile, customProgramCacheKey} of bindings) {
      material.onBeforeCompile = onBeforeCompile;
      material.customProgramCacheKey = customProgramCacheKey;
      material.needsUpdate = true;
    }
    capture.dispose();
  }

  return {render, dispose};
}

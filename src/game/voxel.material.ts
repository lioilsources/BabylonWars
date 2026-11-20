// Materiály voxelů: texture array 16×16 (RawTexture2DArray, nearest), jas
// z vrcholu (stín plochy × AO × světlo), exponenciální mlha do barvy oblohy.
// Tři varianty podle průchodu meshe: opaque (bez discard — rychlé na
// mobilních GPU), cutout (alfa test, oboustranné) a blend (průhledné).
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { RawTexture2DArray } from '@babylonjs/core/Materials/Textures/rawTexture2DArray';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

const vertexSource = `#version 300 es
precision highp float;
in vec3 position;
in vec4 data;
uniform mat4 world;
uniform mat4 viewProjection;
out vec2 vUv;
flat out float vLayer;
out float vBright;
out vec3 vWorld;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUv = data.xy;
  vLayer = data.z;
  vBright = data.w;
  gl_Position = viewProjection * wp;
}`;

const fragment = (defines: string): string => `#version 300 es
precision highp float;
precision highp sampler2DArray;
${defines}
in vec2 vUv;
flat in float vLayer;
in float vBright;
in vec3 vWorld;
uniform sampler2DArray blocks;
uniform vec3 eye;
uniform vec3 fogColor;
uniform float fogDensity;
out vec4 fragColor;
void main() {
  vec4 t = texture(blocks, vec3(fract(vUv.x), 1.0 - fract(vUv.y), vLayer));
#ifdef CUTOUT
  if (t.a < 0.5) discard;
#endif
  float d = length(vWorld - eye);
  float f = clamp(1.0 - exp(-pow(d * fogDensity, 2.0)), 0.0, 1.0);
  vec3 c = mix(t.rgb * vBright, fogColor, f);
#ifdef BLEND
  fragColor = vec4(c, mix(max(t.a, 0.55), 1.0, f));
#else
  fragColor = vec4(c, 1.0);
#endif
}`;

export interface VoxelMaterials {
  passes: ShaderMaterial[];   // [opaque, cutout, blend]
  setFog(density: number): void;
  /** průměrné barvy vrstev (impostory, mapa) */
  avg: number[][];
}

export async function createVoxelMaterials(scene: Scene, base: string, fogColor: Color3): Promise<VoxelMaterials> {
  const meta: { size: number; layers: string[]; avg: number[][] } =
    await fetch(`${base}assets/blocks.json`).then((r) => r.json());
  const img = await fetch(`${base}assets/blocks.png`).then((r) => r.blob()).then((b) => createImageBitmap(b));
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const pixels = new Uint8Array(ctx.getImageData(0, 0, img.width, img.height).data.buffer);
  const depth = meta.layers.length;
  const tex = new RawTexture2DArray(pixels, meta.size, meta.size, depth, Constants.TEXTUREFORMAT_RGBA, scene,
    false, false, Texture.NEAREST_SAMPLINGMODE);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;

  const make = (name: string, defines: string, opts: { cull: boolean; blend: boolean }): ShaderMaterial => {
    const m = new ShaderMaterial(name, scene, { vertexSource, fragmentSource: fragment(defines) }, {
      attributes: ['position', 'data'],
      uniforms: ['world', 'viewProjection', 'eye', 'fogColor', 'fogDensity'],
      samplers: ['blocks'],
      needAlphaBlending: opts.blend,
    });
    m.setTexture('blocks', tex);
    m.setColor3('fogColor', fogColor);
    m.backFaceCulling = opts.cull;
    if (opts.blend) { m.alphaMode = Constants.ALPHA_COMBINE; m.disableDepthWrite = true; }
    return m;
  };
  const passes = [
    make('voxelOpaque', '', { cull: true, blend: false }),
    make('voxelCutout', '#define CUTOUT', { cull: false, blend: false }),
    make('voxelBlend', '#define BLEND', { cull: false, blend: true }),
  ];
  // eye se plní z kamery každý frame
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam) return;
    for (const m of passes) m.setVector3('eye', cam.globalPosition);
  });
  return {
    passes,
    avg: meta.avg,
    setFog: (density) => { for (const m of passes) m.setFloat('fogDensity', density); },
  };
}

// Materiály voxelů: texture array 16×16 (RawTexture2DArray, nearest), jas
// z vrcholu (stín plochy × AO × světlo), exponenciální mlha do barvy oblohy.
// Tři varianty podle průchodu meshe: opaque (bez discard — rychlé na
// mobilních GPU), cutout (alfa test, oboustranné) a blend (průhledné).
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { RawTexture2DArray } from '@babylonjs/core/Materials/Textures/rawTexture2DArray';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector4 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { TUNING } from './settings';

/** Pásmo prolnutí voxely × impostory (stejný dither na obou stranách) */
export const IMPOSTOR_BAND = 1.06;

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
uniform vec4 hlPos;      // xyz pozice, w = zapnuto (0/1)
uniform vec4 hlDir;      // xyz směr, w = dosah
uniform vec2 hlCos;      // cos vnitřního / vnějšího úhlu kuželu
uniform float cutDist;   // hranice voxely × impostory (jen varianta CUT)
out vec4 fragColor;
void main() {
#ifdef CUT
  {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (length(vWorld - eye) > cutDist * mix(1.0, ${IMPOSTOR_BAND.toFixed(3)}, dn)) discard;
  }
#endif
  vec4 t = texture(blocks, vec3(fract(vUv.x), 1.0 - fract(vUv.y), vLayer));
#ifdef CUTOUT
  if (t.a < 0.5) discard;
#endif
  float d = length(vWorld - eye);
  float f = clamp(1.0 - exp(-pow(d * fogDensity, 2.0)), 0.0, 1.0);
  // světlomet: kužel před lodí; projeví se jen ve stínu (max s jasem),
  // na denním světle nic nemění — jako headlight.lua (svítí jen ve tmě)
  float bright = vBright;
  if (hlPos.w > 0.5) {
    vec3 L = vWorld - hlPos.xyz;
    float dl = length(L);
    float cone = smoothstep(hlCos.y, hlCos.x, dot(L / max(dl, 0.001), hlDir.xyz));
    float att = 1.0 - smoothstep(hlDir.w * 0.35, hlDir.w, dl);
    bright = max(bright, cone * att * 0.95);
  }
  vec3 c = mix(t.rgb * bright, fogColor, f);
#ifdef BLEND
  fragColor = vec4(c, mix(max(t.a, 0.55), 1.0, f));
#else
  fragColor = vec4(c, 1.0);
#endif
}`;

export interface VoxelMaterials {
  passes: ShaderMaterial[];   // [opaque, cutout, blend] + totéž s ořezem
  setCut(dist: number): void;
  setFog(density: number): void;
  setHeadlight(on: boolean, px: number, py: number, pz: number, dx: number, dy: number, dz: number): void;
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

  const hlPos = new Vector4(0, 0, 0, 0), hlDir = new Vector4(0, 0, 1, TUNING.headlight.range);
  const make = (name: string, defines: string, opts: { cull: boolean; blend: boolean }): ShaderMaterial => {
    const m = new ShaderMaterial(name, scene, { vertexSource, fragmentSource: fragment(defines) }, {
      attributes: ['position', 'data'],
      uniforms: ['world', 'viewProjection', 'eye', 'fogColor', 'fogDensity', 'hlPos', 'hlDir', 'hlCos', 'cutDist'],
      samplers: ['blocks'],
      needAlphaBlending: opts.blend,
    });
    m.setTexture('blocks', tex);
    m.setColor3('fogColor', fogColor);
    m.setVector4('hlPos', hlPos);
    m.setVector4('hlDir', hlDir);
    m.setVector2('hlCos', new Vector2(TUNING.headlight.cosInner, TUNING.headlight.cosOuter));
    m.backFaceCulling = opts.cull;
    if (opts.blend) { m.alphaMode = Constants.ALPHA_COMBINE; m.disableDepthWrite = true; }
    return m;
  };
  // 0–2 běžné, 3–5 s ořezem na hranici dohledu (nejhrubší LOD)
  const passes = [
    make('voxelOpaque', '', { cull: true, blend: false }),
    make('voxelCutout', '#define CUTOUT', { cull: false, blend: false }),
    make('voxelBlend', '#define BLEND', { cull: false, blend: true }),
    make('voxelOpaqueCut', '#define CUT', { cull: true, blend: false }),
    make('voxelCutoutCut', '#define CUTOUT\n#define CUT', { cull: false, blend: false }),
    make('voxelBlendCut', '#define BLEND\n#define CUT', { cull: false, blend: true }),
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
    setCut: (dist) => { for (const m of passes) m.setFloat('cutDist', dist); },
    setFog: (density) => { for (const m of passes) m.setFloat('fogDensity', density); },
    setHeadlight: (on, px, py, pz, dx, dy, dz) => {
      hlPos.set(px, py, pz, on ? 1 : 0);
      hlDir.set(dx, dy, dz, TUNING.headlight.range);
      for (const m of passes) { m.setVector4('hlPos', hlPos); m.setVector4('hlDir', hlDir); }
    },
  };
}

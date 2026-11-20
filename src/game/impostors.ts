// Impostory vzdálených ostrovů (plán §5): za poloměrem voxelů kreslíme
// nízkopolygonový „soustružený“ mesh z analytického profilu ostrova
// (islandProfile), obarvený podle biomu a nasvícený předem do barvy vrcholu.
// Všechny ostrovy v dohledu jsou v jednom meshi = jeden draw call; přestaví
// se, když se loď posune o půl buňky. Hranice je koule kolem oka: uvnitř
// voxely (nejhrubší chunky ji ořežou), venku impostor, pásmo s ditherem.
import { Effect } from '@babylonjs/core/Materials/effect';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { ISLAND_GRID, islandProfile, islandsWithin, yExtents, HILL_AMP_MAX, type Island } from '../gen/islands';
import { IMPOSTOR_BAND } from './voxel.material';
import { SUN_DIR } from './sky';

Effect.ShadersStore.bwImpostorVertexShader = `#version 300 es
precision highp float;
in vec3 position;
in vec4 color;
uniform mat4 viewProjection;
out vec3 vWorld;
out vec3 vColor;
void main() {
  vWorld = position;
  vColor = color.rgb;
  gl_Position = viewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore.bwImpostorFragmentShader = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vColor;
uniform vec3 eye; uniform vec3 fogColor; uniform float fogDensity; uniform float nearCut;
out vec4 fragColor;
void main() {
  float d = length(vWorld - eye);
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  // přesný doplněk ořezu ve voxel shaderu (stejný dither) — žádná mezera ani překryv
  if (d <= nearCut * mix(1.0, ${IMPOSTOR_BAND.toFixed(3)}, n)) discard;
  float f = clamp(1.0 - exp(-pow(d * fogDensity, 2.0)), 0.0, 1.0);
  fragColor = vec4(mix(vColor, fogColor, f), 1.0);
}`;

const ROCK: [number, number, number] = [0.3, 0.29, 0.29];
// voxely mají texturu × stín plochy × AO; impostor to dorovná jedním činitelem
const TONE = 0.72;

export class Impostors {
  private mesh: Mesh;
  private mat: ShaderMaterial;
  private cx = NaN; private cz = NaN;
  private list: Island[] = [];
  range = 2000;
  segments = 32;
  rings = 14;

  constructor(scene: Scene, private seed: number, fogColor: Color3) {
    this.mat = new ShaderMaterial('impostorMat', scene, 'bwImpostor', {
      attributes: ['position', 'color'], uniforms: ['viewProjection', 'eye', 'fogColor', 'fogDensity', 'nearCut'],
    });
    this.mat.setColor3('fogColor', fogColor);
    this.mat.backFaceCulling = true;
    this.mesh = new Mesh('impostors', scene);
    this.mesh.material = this.mat;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  configure(range: number, segments: number, rings: number, nearCut: number, fogDensity: number): void {
    const rebuild = range !== this.range || segments !== this.segments || rings !== this.rings;
    this.range = range; this.segments = segments; this.rings = rings;
    this.mat.setFloat('nearCut', nearCut);
    this.mat.setFloat('fogDensity', fogDensity);
    if (rebuild) this.cx = NaN;
  }

  get triangles(): number { return this.mesh.getTotalIndices() / 3; }
  get count(): number { return this.list.length; }

  update(eye: Vector3): void {
    this.mat.setVector3('eye', eye);
    const half = ISLAND_GRID / 2;
    if (Math.abs(eye.x - this.cx) < half && Math.abs(eye.z - this.cz) < half) return;
    this.cx = eye.x; this.cz = eye.z;
    this.build();
  }

  private build(): void {
    const isl = islandsWithin(this.cx, this.cz, this.range + ISLAND_GRID / 2, this.seed, this.list);
    const S = this.segments, R = this.rings;
    const vPer = S * R + 2, tPer = S * (R - 1) * 2 + S * 2;
    const pos = new Float32Array(isl.length * vPer * 3);
    const col = new Float32Array(isl.length * vPer * 4);
    const idx = new Uint32Array(isl.length * tPer * 3);
    let v = 0, ii = 0;
    const ys = new Float32Array(R), rs = new Float32Array(R);
    for (const it of isl) {
      const [upExt, down] = yExtents(it);
      const up = upExt - HILL_AMP_MAX * 0.5;
      // prstence hustší u horní plochy (tam je obrys nejzajímavější)
      for (let k = 0; k < R; k++) {
        const u = k / (R - 1);
        const y = -down + (up + down) * (1 - (1 - u) * (1 - u) * 0.6 - (1 - u) * 0.4);
        ys[k] = y;
        rs[k] = islandProfile(it, y);
      }
      const base = v;
      const tint = it.biome.tint;
      const wob = (it.x * 0.013 + it.z * 0.007) % 6.283;
      for (let k = 0; k < R; k++) {
        // normála z profilu: sklon mezi sousedními prstenci
        const k0 = Math.max(0, k - 1), k1 = Math.min(R - 1, k + 1);
        const dr = rs[k1] - rs[k0], dy = ys[k1] - ys[k0];
        const top = ys[k] > 0 && -dr / (Math.hypot(dr, dy) || 1) > 0.3;
        for (let s = 0; s < S; s++) {
          const a = (s / S) * Math.PI * 2;
          const w = 1 + 0.05 * Math.sin(a * 3 + wob) + 0.03 * Math.sin(a * 7 + wob * 2);
          const ca = Math.cos(a), sa = Math.sin(a);
          const r = rs[k] * w;
          pos[v * 3] = it.x + ca * r; pos[v * 3 + 1] = it.y + ys[k]; pos[v * 3 + 2] = it.z + sa * r;
          // normála ≈ (dy·radiálně, −dr, …) normalizovaná
          let nx = ca * dy, ny = -dr, nz = sa * dy;
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          const lam = Math.max(0, nx * SUN_DIR.x + ny * SUN_DIR.y + nz * SUN_DIR.z);
          // spodek je ve stínu jako sky light 0.35 ve voxelech
          const shade = (ny < -0.2 ? 0.3 + 0.1 * lam : 0.5 + 0.45 * lam) * TONE;
          const c = top ? tint : ROCK;
          const m = top ? 1 : 0.8;
          col[v * 4] = (c[0] * m + tint[0] * (1 - m)) * shade;
          col[v * 4 + 1] = (c[1] * m + tint[1] * (1 - m)) * shade;
          col[v * 4 + 2] = (c[2] * m + tint[2] * (1 - m)) * shade;
          col[v * 4 + 3] = 1;
          v++;
        }
      }
      // středy spodního a horního víčka
      const bot = v, topc = v + 1;
      for (const [vi, k, sh, c] of [[bot, 0, 0.3 * TONE, ROCK], [topc, R - 1, TONE, tint]] as const) {
        pos[vi * 3] = it.x; pos[vi * 3 + 1] = it.y + ys[k]; pos[vi * 3 + 2] = it.z;
        col[vi * 4] = c[0] * sh; col[vi * 4 + 1] = c[1] * sh; col[vi * 4 + 2] = c[2] * sh; col[vi * 4 + 3] = 1;
      }
      v += 2;
      // levotočivý systém Babylonu: přední strana po směru hodinek zvenku
      for (let k = 0; k < R - 1; k++) for (let s = 0; s < S; s++) {
        const a = base + k * S + s, b = base + k * S + (s + 1) % S;
        const c = a + S, d = b + S;
        idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
        idx[ii++] = b; idx[ii++] = c; idx[ii++] = d;
      }
      for (let s = 0; s < S; s++) {
        const a = base + s, b = base + (s + 1) % S;
        idx[ii++] = bot; idx[ii++] = a; idx[ii++] = b;
        const ta = base + (R - 1) * S + s, tb = base + (R - 1) * S + (s + 1) % S;
        idx[ii++] = topc; idx[ii++] = tb; idx[ii++] = ta;
      }
    }
    const vd = new VertexData();
    vd.positions = pos.subarray(0, v * 3);
    vd.colors = col.subarray(0, v * 4);
    vd.indices = idx.subarray(0, ii);
    vd.applyToMesh(this.mesh, false);
  }
}

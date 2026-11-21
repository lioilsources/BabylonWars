// Částice jako v Luanti: plné barevné čtverečky (textury částic jsou jednobarevné),
// billboard v shaderu, gravitace, doběh průhlednosti. Jeden draw call, pool bez
// alokací; do GPU jde jen živá část bufferu.
import { Buffer, VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Effect } from '@babylonjs/core/Materials/effect';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';

Effect.ShadersStore.bwParticleVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
attribute float psize;
attribute vec2 corner;
uniform mat4 viewProjection;
uniform vec3 camRight, camUp, eye;
uniform float fogDensity;
varying vec4 vColor;
void main() {
  vec3 p = position + (camRight * corner.x + camUp * corner.y) * psize;
  gl_Position = viewProjection * vec4(p, 1.0);
  float d = length(p - eye) * fogDensity;
  vColor = vec4(color.rgb, color.a * clamp(exp(-d * d), 0.0, 1.0));
}`;
Effect.ShadersStore.bwParticleFragmentShader = `
precision highp float;
varying vec4 vColor;
void main() { gl_FragColor = vColor; }`;

const STRIDE = 8; // x y z  r g b a  size

export interface Emit {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** zrychlení v ose y (gravitace) */
  ay: number;
  life: number;
  size: number;
  r: number; g: number; b: number;
}

/** Barva '#rrggbb' → [r,g,b] 0..1 */
export function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** Luanti ^[colorize:#c:a — přimíchání barvy do textury v poměru a/255 */
export function colorize(base: [number, number, number], c: string, a: number): [number, number, number] {
  const t = hex(c), k = a / 255;
  return [base[0] + (t[0] - base[0]) * k, base[1] + (t[1] - base[1]) * k, base[2] + (t[2] - base[2]) * k];
}

/** doggiowars_particle_engine.png je jednobarevná */
export const ENGINE: [number, number, number] = [1, 200 / 255, 50 / 255];

export class Particles {
  private n = 0;
  private pos: Float32Array; private vel: Float32Array;
  private ay: Float32Array; private life: Float32Array; private max: Float32Array; private size: Float32Array;
  private rgb: Float32Array;
  private data: Float32Array;
  private buf: Buffer;
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private right = new Vector3(); private up = new Vector3();

  constructor(scene: Scene, private cap = 4096) {
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3);
    this.ay = new Float32Array(cap); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.size = new Float32Array(cap); this.rgb = new Float32Array(cap * 3);
    this.data = new Float32Array(cap * 4 * STRIDE);
    const engine = scene.getEngine();
    this.mesh = new Mesh('particles', scene);
    this.buf = new Buffer(engine, this.data, true, STRIDE, false, false);
    this.mesh.setVerticesBuffer(this.buf.createVertexBuffer(VertexBuffer.PositionKind, 0, 3));
    this.mesh.setVerticesBuffer(this.buf.createVertexBuffer(VertexBuffer.ColorKind, 3, 4));
    this.mesh.setVerticesBuffer(this.buf.createVertexBuffer('psize', 7, 1));
    const corner = new Float32Array(cap * 8), idx = new Uint32Array(cap * 6);
    for (let i = 0; i < cap; i++) {
      corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    this.mesh.setVerticesData('corner', corner, false, 2);
    this.mesh.setIndices(idx, cap * 4);
    // pozice žijí jen v dynamickém bufferu → bounding info ručně (řazení průhledných)
    const bi = new BoundingInfo(new Vector3(-1e6, -1e6, -1e6), new Vector3(1e6, 1e6, 1e6));
    this.mesh.setBoundingInfo(bi);
    for (const sm of this.mesh.subMeshes) sm.setBoundingInfo(bi);
    this.mesh.doNotSyncBoundingInfo = true;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.isPickable = false;
    this.mat = new ShaderMaterial('particleMat', scene, { vertex: 'bwParticle', fragment: 'bwParticle' }, {
      attributes: ['position', 'color', 'psize', 'corner'],
      uniforms: ['viewProjection', 'camRight', 'camUp', 'eye', 'fogDensity'],
      needAlphaBlending: true,
    });
    this.mat.alphaMode = Constants.ALPHA_COMBINE;
    this.mat.backFaceCulling = false;
    this.mat.disableDepthWrite = true;
    this.mesh.material = this.mat;
    this.mesh.renderingGroupId = 0;
  }

  get count(): number { return this.n; }

  emit(e: Emit): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = e.x; this.pos[i * 3 + 1] = e.y; this.pos[i * 3 + 2] = e.z;
    this.vel[i * 3] = e.vx; this.vel[i * 3 + 1] = e.vy; this.vel[i * 3 + 2] = e.vz;
    this.ay[i] = e.ay; this.life[i] = e.life; this.max[i] = e.life; this.size[i] = e.size;
    this.rgb[i * 3] = e.r; this.rgb[i * 3 + 1] = e.g; this.rgb[i * 3 + 2] = e.b;
  }

  update(dt: number, cam: Camera, fogDensity: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.swapRemove(i); continue; }
      this.vel[i * 3 + 1] += this.ay[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      i++;
    }
    const d = this.data;
    for (let k = 0; k < this.n; k++) {
      // posledních 30 % života dohasíná
      const a = Math.min(1, this.life[k] / (this.max[k] * 0.3));
      const half = this.size[k] * 0.5;
      for (let v = 0; v < 4; v++) {
        const o = (k * 4 + v) * STRIDE;
        d[o] = this.pos[k * 3]; d[o + 1] = this.pos[k * 3 + 1]; d[o + 2] = this.pos[k * 3 + 2];
        d[o + 3] = this.rgb[k * 3]; d[o + 4] = this.rgb[k * 3 + 1]; d[o + 5] = this.rgb[k * 3 + 2]; d[o + 6] = a;
        d[o + 7] = half;
      }
    }
    if (this.n) this.buf.updateDirectly(d, 0, this.n * 4);
    this.mesh.isVisible = this.n > 0;
    const sm = this.mesh.subMeshes?.[0];
    if (sm) sm.indexCount = this.n * 6;
    // billboard: osy kamery ve světě
    const m = cam.getViewMatrix();
    this.right.set(m.m[0], m.m[4], m.m[8]);
    this.up.set(m.m[1], m.m[5], m.m[9]);
    this.mat.setVector3('camRight', this.right);
    this.mat.setVector3('camUp', this.up);
    this.mat.setVector3('eye', cam.globalPosition);
    this.mat.setFloat('fogDensity', fogDensity);
  }

  private swapRemove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    for (let c = 0; c < 3; c++) {
      this.pos[i * 3 + c] = this.pos[j * 3 + c]; this.vel[i * 3 + c] = this.vel[j * 3 + c]; this.rgb[i * 3 + c] = this.rgb[j * 3 + c];
    }
    this.ay[i] = this.ay[j]; this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j];
  }
}

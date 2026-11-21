// Padající sutina (weapons.lua spawn_debris): kostky 0,8 m v barvě zasaženého
// nodu, gravitace −10, rotace, při dopadu nebo po 2,5–4 s zmizí s obláčkem.
// Thin instances — jeden draw call; poslední kus se kopíruje na místo zaniklého.
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh'; // side effect: thin instances (bez něj tiché stuby)
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { WEAPON } from '../../sim/weapons';
import { NODE_TILE } from '../../voxel/registry';
import type { Effects } from './effects';

interface Piece { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; ttl: number; r: number; g: number; b: number }

const CAP = WEAPON.DEBRIS_MAX;

export class Debris {
  private pieces: Piece[] = [];
  private mesh: Mesh;
  private matrices = new Float32Array(CAP * 16);
  private colors = new Float32Array(CAP * 4);
  private m = new Matrix(); private q = new Quaternion(); private s = new Vector3(0.8, 0.8, 0.8); private t = new Vector3();

  constructor(scene: Scene, private avg: number[][], private fx: Effects, private solid: (x: number, y: number, z: number) => boolean) {
    this.mesh = CreateBox('debris', { size: 1 }, scene);
    const mat = new StandardMaterial('debrisMat', scene);
    mat.diffuseColor = Color3.White();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
    this.mesh.thinInstanceCount = 0;
  }

  get count(): number { return this.pieces.length; }

  /**
   * Odlomí část vykopaných nodů (removed = [x,y,z,id,…]). S eject se kusy
   * vymrští z ústí díry proti směru střely (uvnitř tunelu by hned narazily).
   */
  spawn(removed: number[], ox: number, oy: number, oz: number, count: number, eject?: { x: number; y: number; z: number }): void {
    const n = removed.length / 4;
    if (!n) return;
    for (let k = 0; k < Math.min(n, count) && this.pieces.length < CAP; k++) {
      const i = Math.floor(Math.random() * n) * 4;
      const id = removed[i + 3];
      const c = this.avg[NODE_TILE[id * 3 + 2]] ?? [0.5, 0.5, 0.5];
      const sp = 3 + Math.random() * 5;
      let x: number, y: number, z: number, vx: number, vy: number, vz: number;
      if (eject) {
        x = ox - eject.x; y = oy - eject.y; z = oz - eject.z;
        vx = -eject.x * sp + (Math.random() - 0.5) * 6;
        vy = -eject.y * sp + 2 + Math.random() * 4;
        vz = -eject.z * sp + (Math.random() - 0.5) * 6;
      } else {
        x = removed[i]; y = removed[i + 1]; z = removed[i + 2];
        let dx = x - ox, dy = y - oy, dz = z - oz, l = Math.hypot(dx, dy, dz);
        if (l < 0.1) { dx = 0; dy = 1; dz = 0; l = 1; }
        vx = dx / l * sp + (Math.random() - 0.5) * 3;
        vy = Math.abs(dy / l) * sp * 0.5 + 2 + Math.random() * 3;
        vz = dz / l * sp + (Math.random() - 0.5) * 3;
      }
      this.pieces.push({
        x, y, z, vx, vy, vz, rx: 0, ry: 0, rz: 0,
        sx: (Math.random() - 0.5) * 9, sy: (Math.random() - 0.5) * 9, sz: (Math.random() - 0.5) * 9,
        ttl: 2.5 + Math.random() * 1.5, r: c[0], g: c[1], b: c[2],
      });
    }
  }

  update(dt: number): void {
    const P = this.pieces;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.ttl -= dt;
      p.vy -= 10 * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.ttl <= 0 || this.solid(nx, ny - 0.35, nz)) {
        this.fx.puff(p.x, p.y, p.z);
        P[i] = P[P.length - 1]; P.pop();
        continue;
      }
      p.x = nx; p.y = ny; p.z = nz;
      p.rx += p.sx * dt; p.ry += p.sy * dt; p.rz += p.sz * dt;
    }
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      Quaternion.FromEulerAnglesToRef(p.rx, p.ry, p.rz, this.q);
      this.t.set(p.x, p.y, p.z);
      Matrix.ComposeToRef(this.s, this.q, this.t, this.m);
      this.m.copyToArray(this.matrices, i * 16);
      this.colors[i * 4] = p.r; this.colors[i * 4 + 1] = p.g; this.colors[i * 4 + 2] = p.b; this.colors[i * 4 + 3] = 1;
    }
    this.mesh.thinInstanceCount = P.length;
    if (P.length) {
      this.mesh.thinInstanceBufferUpdated('matrix');
      this.mesh.thinInstanceBufferUpdated('color');
    }
    this.mesh.isVisible = P.length > 0;
  }
}

// Greedy mesher po plochách s AO a analytickým světlem.
// Klíč slučování = (vrstva textury, AO 4 rohů, světlo, emisivita, průchod).
// Vstup: objem VOL³ s lemem 1 (generátor) + horní plocha terénu per sloupec.
// Výstup: tři průchody — opaque (bez discard), cutout (alfa test: listí,
// rostliny) a blend (voda, ledové krystaly).
//
// Vertex: position (3×f32, lokálně v chunku, jednotky světa)
//         data     (4×f32: u, v, vrstva, jas) — u/v ve voxelech, opakují se přes quad

import { CHUNK, VOL, volIndex } from './coords';
import { NODES, NODE_DRAW, NODE_LIGHT, NODE_OPAQUE, NODE_TILE, NODE_WALKABLE } from './registry';

export const PASS_OPAQUE = 0;
export const PASS_CUTOUT = 1;
export const PASS_BLEND = 2;

export interface PassMesh { positions: Float32Array; data: Float32Array; indices: Uint32Array; quads: number }

export interface MeshResult {
  passes: (PassMesh | null)[];
  quads: number;
  /** jen LOD 0: 32³ bitů „walkable“ pro raycast/kolize, index (y*32+z)*32+x */
  solidBits?: Uint32Array;
}

export interface MeshParams {
  /** velikost voxelu v blocích (2^lod) */
  scale: number;
  /** světová Y pro j = 0 (lem) */
  originY: number;
  /** nejvyšší plný blok terénu per sloupec (VOL×VOL, index k*VOL+i), nebo -1e9 */
  top: Int32Array;
}

// stín ploch: +X, −X, +Y, −Y, +Z, −Z
const FACE_SHADE = [0.8, 0.8, 1.0, 0.5, 0.65, 0.65];
const AO_CURVE = [0.42, 0.62, 0.82, 1.0];
const SKY_MIN = 0.35;

class Builder {
  pos = new Float32Array(3 * 4 * 1024);
  dat = new Float32Array(4 * 4 * 1024);
  ao = new Uint8Array(1024);   // příznak „otočená diagonála“ per quad
  quads = 0;
  reset(): void { this.quads = 0; }
  grow(): void {
    const p = new Float32Array(this.pos.length * 2); p.set(this.pos); this.pos = p;
    const d = new Float32Array(this.dat.length * 2); d.set(this.dat); this.dat = d;
    const a = new Uint8Array(this.ao.length * 2); a.set(this.ao); this.ao = a;
  }
  /** přidá quad; vrcholy v pořadí navinutí (front face) */
  quad(px: number[], uv: number[], layer: number, bright: number[], flip: boolean): void {
    if (this.quads >= this.ao.length) this.grow();
    const q = this.quads++;
    this.pos.set(px, q * 12);
    const o = q * 16;
    for (let k = 0; k < 4; k++) {
      this.dat[o + k * 4] = uv[k * 2];
      this.dat[o + k * 4 + 1] = uv[k * 2 + 1];
      this.dat[o + k * 4 + 2] = layer;
      this.dat[o + k * 4 + 3] = bright[k];
    }
    this.ao[q] = flip ? 1 : 0;
  }
  finish(): PassMesh | null {
    const n = this.quads;
    if (!n) return null;
    const indices = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const b = i * 4, o = i * 6;
      if (this.ao[i]) {
        indices.set([b, b + 1, b + 3, b + 1, b + 2, b + 3], o);
      } else {
        indices.set([b, b + 1, b + 2, b, b + 2, b + 3], o);
      }
    }
    return { positions: this.pos.slice(0, n * 12), data: this.dat.slice(0, n * 16), indices, quads: n };
  }
}

const builders = [new Builder(), new Builder(), new Builder()];
const mask = new Int32Array(CHUNK * CHUNK);

function passOf(id: number): number {
  const d = NODE_DRAW[id];
  if (d === 'glasslike') return PASS_BLEND;
  if (d === 'liquid') return NODE_LIGHT[id] ? PASS_OPAQUE : PASS_BLEND;
  if (d === 'allfaces') return PASS_CUTOUT;
  return PASS_OPAQUE;
}

/** Je plocha nodu a viditelná proti sousedovi b? */
function faceVisible(a: number, b: number): boolean {
  if (NODE_OPAQUE[b]) return false;
  const d = NODE_DRAW[a];
  if (d === 'normal') return true;
  if (d === 'liquid') return NODE_DRAW[b] !== 'liquid';
  return b !== a; // allfaces, glasslike: mezi stejnými nody stěny nekresli
}

const isCube = (d: string): boolean => d === 'normal' || d === 'allfaces' || d === 'glasslike' || d === 'liquid';

export function meshChunk(vol: Uint16Array, p: MeshParams): MeshResult {
  for (const b of builders) b.reset();
  const s = p.scale;
  const x = [0, 0, 0], q = [0, 0, 0], c = [0, 0, 0];

  const sky = (i: number, j: number, k: number): number => {
    const t = p.top[k * VOL + i];
    const wy = p.originY + j * s;
    if (wy > t) return 1;
    return Math.max(SKY_MIN, 1 - (t - wy + 1) / 3 * (1 - SKY_MIN));
  };
  const occ = (i: number, j: number, k: number): number => NODE_OPAQUE[vol[volIndex(i, j, k)]];

  for (let d = 0; d < 3; d++) {
    const u = d === 1 ? 0 : d === 0 ? 2 : 0;   // osa u textury (vodorovná)
    const v = d === 1 ? 2 : 1;                   // osa v (svislá u stěn)
    for (let side = 0; side < 2; side++) {
      const dir = side === 0 ? 1 : -1;
      const face = d * 2 + side;
      const shade = FACE_SHADE[face];
      const tileSlot = d === 1 ? side : 2;       // +Y top, −Y bottom, jinak side
      q[0] = 0; q[1] = 0; q[2] = 0; q[d] = dir;

      for (x[d] = 0; x[d] < CHUNK; x[d]++) {
        let n = 0;
        for (x[v] = 0; x[v] < CHUNK; x[v]++) {
          for (x[u] = 0; x[u] < CHUNK; x[u]++, n++) {
            const ai = x[0] + 1, aj = x[1] + 1, ak = x[2] + 1;
            const a = vol[volIndex(ai, aj, ak)];
            mask[n] = 0;
            if (a === 0 || !isCube(NODE_DRAW[a])) continue;
            const bi = ai + q[0], bj = aj + q[1], bk = ak + q[2];
            const b = vol[volIndex(bi, bj, bk)];
            if (!faceVisible(a, b)) continue;
            const layer = NODE_TILE[a * 3 + tileSlot];
            const emis = NODE_LIGHT[a] > 0 ? 1 : 0;
            const light = emis ? 15 : Math.round(sky(bi, bj, bk) * 15);
            // AO ve vrstvě vzduchu před plochou; rohy (−u−v, +u−v, +u+v, −u+v)
            let aoBits = 0;
            if (!emis && NODE_DRAW[a] !== 'liquid') {
              for (let corner = 0; corner < 4; corner++) {
                const su = corner === 1 || corner === 2 ? 1 : -1;
                const sv = corner >= 2 ? 1 : -1;
                c[0] = bi; c[1] = bj; c[2] = bk; c[u] += su;
                const s1 = occ(c[0], c[1], c[2]);
                c[0] = bi; c[1] = bj; c[2] = bk; c[v] += sv;
                const s2 = occ(c[0], c[1], c[2]);
                c[u] += su;
                const cc = occ(c[0], c[1], c[2]);
                const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
                aoBits |= ao << (corner * 2);
              }
            } else aoBits = 0xff;
            mask[n] = 1 | (layer << 1) | (aoBits << 10) | (light << 18) | (emis << 22) | (passOf(a) << 23);
          }
        }
        // greedy slučování
        n = 0;
        for (let j = 0; j < CHUNK; j++) {
          for (let i = 0; i < CHUNK;) {
            const key = mask[n];
            if (key === 0) { i++; n++; continue; }
            let w = 1;
            while (i + w < CHUNK && mask[n + w] === key) w++;
            let h = 1;
            outer: for (; j + h < CHUNK; h++) {
              for (let k = 0; k < w; k++) if (mask[n + k + h * CHUNK] !== key) break outer;
            }
            emitFace(key, d, u, v, dir, x[d], i, j, w, h, shade, s);
            for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * CHUNK] = 0;
            i += w; n += w;
          }
        }
      }
    }
  }

  // Nekrychlové drawtypy (jen LOD 0 — z dálky by byly obří)
  if (s === 1) {
    for (let j = 1; j <= CHUNK; j++) for (let k = 1; k <= CHUNK; k++) for (let i = 1; i <= CHUNK; i++) {
      const a = vol[volIndex(i, j, k)];
      if (a === 0) continue;
      const dt = NODE_DRAW[a];
      if (dt === 'plantlike' || dt === 'firelike') emitCross(a, i - 1, j - 1, k - 1, NODE_LIGHT[a] ? 1 : sky(i, j, k));
      else if (dt === 'nodebox') emitBox(a, i - 1, j - 1, k - 1, sky(i, j, k));
    }
  }

  const passes = builders.map((b) => b.finish());
  const result: MeshResult = { passes, quads: passes.reduce((acc, m) => acc + (m?.quads ?? 0), 0) };
  if (s === 1) {
    const bits = new Uint32Array(CHUNK * CHUNK * CHUNK / 32);
    for (let j = 0; j < CHUNK; j++) for (let k = 0; k < CHUNK; k++) for (let i = 0; i < CHUNK; i++) {
      if (NODE_WALKABLE[vol[volIndex(i + 1, j + 1, k + 1)]]) {
        const idx = (j * CHUNK + k) * CHUNK + i;
        bits[idx >>> 5] |= 1 << (idx & 31);
      }
    }
    result.solidBits = bits;
  }
  return result;
}

const P = new Array<number>(12), UV = new Array<number>(8), BR = new Array<number>(4);

function emitFace(key: number, d: number, u: number, v: number, dir: number, slice: number,
  i: number, j: number, w: number, h: number, shade: number, s: number): void {
  const layer = (key >>> 1) & 0x1ff;
  const aoBits = (key >>> 10) & 0xff;
  const light = ((key >>> 18) & 0xf) / 15;
  const emis = (key >>> 22) & 1;
  const pass = (key >>> 23) & 3;
  // rohy c0..c3 = (i,j), (i+w,j), (i+w,j+h), (i,j+h) v osách u, v
  const cu = [i, i + w, i + w, i], cv = [j, j, j + h, j + h];
  const ao = [aoBits & 3, (aoBits >> 2) & 3, (aoBits >> 4) & 3, (aoBits >> 6) & 3];
  const plane = slice + (dir > 0 ? 1 : 0);
  // pořadí navinutí: pro cyklické osy (u = d+1, v = d+2) má kladná normála
  // c0,c3,c2,c1 a záporná c0,c1,c2,c3. Osy X a Y mají u/v prohozené (kvůli
  // orientaci textury), takže se navinutí obrací.
  const swapped = d !== 2;
  const order = (dir > 0) === swapped ? [0, 1, 2, 3] : [0, 3, 2, 1];
  for (let k = 0; k < 4; k++) {
    const o = order[k];
    const pt = [0, 0, 0];
    pt[d] = plane; pt[u] = cu[o]; pt[v] = cv[o];
    P[k * 3] = pt[0] * s; P[k * 3 + 1] = pt[1] * s; P[k * 3 + 2] = pt[2] * s;
    UV[k * 2] = cu[o]; UV[k * 2 + 1] = cv[o];
    BR[k] = emis ? 1 : shade * AO_CURVE[ao[o]] * light;
  }
  // diagonála podle AO (proti anizotropii): porovnej protilehlé rohy
  const a0 = ao[order[0]] + ao[order[2]], a1 = ao[order[1]] + ao[order[3]];
  builders[pass].quad(P, UV, layer, BR, a0 < a1);
}

function emitCross(id: number, x: number, y: number, z: number, light: number): void {
  const layer = NODE_TILE[id * 3 + 2];
  const b = [light, light, light, light];
  // cutout materiál nemá backface culling → stačí jedna strana
  const quads = [[x, z, x + 1, z + 1], [x + 1, z, x, z + 1]];
  for (const [ax, az, bx, bz] of quads) {
    const pos = [ax, y, az, bx, y, bz, bx, y + 1, bz, ax, y + 1, az];
    builders[PASS_CUTOUT].quad(pos, [0, 0, 1, 0, 1, 1, 0, 1], layer, b, false);
  }
}

function emitBox(id: number, x: number, y: number, z: number, light: number): void {
  const layer = NODE_TILE[id * 3];
  for (const box of NODES_BOX(id)) {
    const [x0, y0, z0, x1, y1, z1] = box.map((vv, i) => vv + 0.5 + [x, y, z][i % 3]);
    const b = [light, light, light, light];
    const cut = builders[PASS_CUTOUT];
    // horní a dolní plocha + 4 stěny
    cut.quad([x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0], [0, 0, 0, 1, 1, 1, 1, 0], layer, b, false);
    cut.quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], [0, 0, 1, 0, 1, 1, 0, 1], layer, b.map((l) => l * 0.5), false);
    cut.quad([x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0], [0, 0, 0, 1, 1, 1, 1, 0], layer, b.map((l) => l * 0.65), false);
    cut.quad([x1, y0, z1, x1, y1, z1, x0, y1, z1, x0, y0, z1], [0, 0, 0, 1, 1, 1, 1, 0], layer, b.map((l) => l * 0.65), false);
    cut.quad([x0, y0, z1, x0, y1, z1, x0, y1, z0, x0, y0, z0], [0, 0, 0, 1, 1, 1, 1, 0], layer, b.map((l) => l * 0.8), false);
    cut.quad([x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1], [0, 0, 0, 1, 1, 1, 1, 0], layer, b.map((l) => l * 0.8), false);
  }
}

const NODES_BOX = (id: number): number[][] => NODES[id].box ?? [[-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]];

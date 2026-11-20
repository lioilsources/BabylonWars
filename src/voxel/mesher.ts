// Greedy mesher po plochách. Klíč slučování = id nodu (F0: barva, bez AO).
// Vstup: objem VOL³ s lemem; výstup: quady v lokálních souřadnicích chunku
// (jednotky světa, voxel = scale bloků).

import { CHUNK, volIndex } from './coords';
import { NODE_COLORS, NODE_EMISSIVE, NODE_SOLID } from './registry';

export interface MeshData {
  positions: Float32Array;   // 3 × f32 na vrchol
  colors: Float32Array;      // 4 × f32 na vrchol (rgb × stín, a = 1)
  indices: Uint32Array;
  quads: number;
}

// Stínování ploch podle směru (+X, −X, +Y, −Y, +Z, −Z)
const FACE_SHADE = [0.8, 0.8, 1.0, 0.55, 0.68, 0.68];

// Pracovní buffery (mesher běží ve workeru sekvenčně)
const mask = new Int32Array(CHUNK * CHUNK);
let pos = new Float32Array(3 * 4 * 4096);
let col = new Float32Array(4 * 4 * 4096);

function ensure(quads: number): void {
  if (quads * 12 <= pos.length) return;
  const np = new Float32Array(pos.length * 2); np.set(pos); pos = np;
  const nc = new Float32Array(col.length * 2); nc.set(col); col = nc;
}

export function meshChunk(vol: Uint8Array, scale = 1): MeshData {
  let quads = 0;
  const x = [0, 0, 0];
  const q = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    q[0] = 0; q[1] = 0; q[2] = 0; q[d] = 1;
    for (let side = 0; side < 2; side++) {
      const dir = side === 0 ? 1 : -1;     // normála +d / −d
      const face = d * 2 + side;
      const shade = FACE_SHADE[face];
      // vrstva x[d] = 0..CHUNK-1 v souřadnicích interiéru
      for (x[d] = 0; x[d] < CHUNK; x[d]++) {
        // maska: id viditelné plochy, nebo 0
        let n = 0;
        for (x[v] = 0; x[v] < CHUNK; x[v]++) {
          for (x[u] = 0; x[u] < CHUNK; x[u]++, n++) {
            const a = vol[volIndex(x[0] + 1, x[1] + 1, x[2] + 1)];
            const b = vol[volIndex(x[0] + 1 + q[0] * dir, x[1] + 1 + q[1] * dir, x[2] + 1 + q[2] * dir)];
            mask[n] = NODE_SOLID[a] && !NODE_SOLID[b] ? a : 0;
          }
        }
        // greedy slučování obdélníků
        n = 0;
        for (let j = 0; j < CHUNK; j++) {
          for (let i = 0; i < CHUNK;) {
            const id = mask[n];
            if (id === 0) { i++; n++; continue; }
            let w = 1;
            while (i + w < CHUNK && mask[n + w] === id) w++;
            let h = 1;
            outer: for (; j + h < CHUNK; h++) {
              for (let k = 0; k < w; k++) if (mask[n + k + h * CHUNK] !== id) break outer;
            }
            ensure(quads + 1);
            // rohy quadu: rovina x[d] (+1 pro kladnou normálu)
            const base = [0, 0, 0];
            base[d] = x[d] + (dir > 0 ? 1 : 0); base[u] = i; base[v] = j;
            const du = [0, 0, 0]; du[u] = w;
            const dv = [0, 0, 0]; dv[v] = h;
            emitQuad(quads, base, du, dv, dir > 0, id, shade, scale);
            quads++;
            for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * CHUNK] = 0;
            i += w; n += w;
          }
        }
      }
    }
  }

  const positions = pos.slice(0, quads * 12);
  const colors = col.slice(0, quads * 16);
  const indices = new Uint32Array(quads * 6);
  for (let i = 0; i < quads; i++) {
    const b = i * 4, o = i * 6;
    indices[o] = b; indices[o + 1] = b + 1; indices[o + 2] = b + 2;
    indices[o + 3] = b; indices[o + 4] = b + 2; indices[o + 5] = b + 3;
  }
  return { positions, colors, indices, quads };
}

function emitQuad(qi: number, base: number[], du: number[], dv: number[], positive: boolean, id: number, shade: number, s: number): void {
  // pořadí rohů určuje navinutí: kladná normála a, b, c, d; záporná obráceně
  const p = qi * 12;
  const c0 = [base[0], base[1], base[2]];
  const c1 = [base[0] + du[0], base[1] + du[1], base[2] + du[2]];
  const c2 = [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]];
  const c3 = [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]];
  const order = positive ? [c0, c3, c2, c1] : [c0, c1, c2, c3];
  for (let k = 0; k < 4; k++) {
    pos[p + k * 3] = order[k][0] * s;
    pos[p + k * 3 + 1] = order[k][1] * s;
    pos[p + k * 3 + 2] = order[k][2] * s;
  }
  const sh = NODE_EMISSIVE[id] ? 1 : shade;
  const r = NODE_COLORS[id * 3] * sh, g = NODE_COLORS[id * 3 + 1] * sh, b = NODE_COLORS[id * 3 + 2] * sh;
  const c = qi * 16;
  for (let k = 0; k < 4; k++) {
    col[c + k * 4] = r; col[c + k * 4 + 1] = g; col[c + k * 4 + 2] = b; col[c + k * 4 + 3] = NODE_EMISSIVE[id];
  }
}


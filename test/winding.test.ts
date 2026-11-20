import { describe, expect, it } from 'vitest';
import { VOL, VOL_SIZE, volIndex } from '../src/voxel/coords';
import { meshChunk, PASS_OPAQUE } from '../src/voxel/mesher';
import { nodeId, NODE_OPAQUE } from '../src/voxel/registry';
import { NO_TOP } from '../src/gen/generator';

describe('navinutí na schodovitém terénu (AO, otočené diagonály)', () => {
  it('každý trojúhelník má pravotočivou normálu dovnitř plného nodu', () => {
    const v = new Uint16Array(VOL_SIZE);
    const B = nodeId('doggiowars:basalt');
    // kuželová homole ze schodů
    for (let i = 1; i <= 32; i++) for (let k = 1; k <= 32; k++) {
      const d = Math.hypot(i - 16, k - 16);
      const h = Math.max(1, Math.floor(20 - d));
      for (let j = 1; j <= h; j++) v[volIndex(i, j, k)] = B;
    }
    const p = meshChunk(v, { scale: 1, originY: -1, top: new Int32Array(VOL * VOL).fill(NO_TOP) }).passes[PASS_OPAQUE]!;
    let bad = 0, total = 0;
    for (let t = 0; t < p.indices.length; t += 3) {
      const P = (n: number): number[] => [0, 1, 2].map((a) => p.positions[p.indices[t + n] * 3 + a]);
      const [a, b, c] = [P(0), P(1), P(2)];
      const e1 = a.map((x, i) => b[i] - x), e2 = a.map((x, i) => c[i] - x);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const ax = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
      const sgn = Math.sign(n[ax]);
      const cen = [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3);
      // bod půl voxelu ve směru normály: má být uvnitř plného nodu
      const q = cen.slice(); q[ax] += sgn * 0.5;
      const cell = q.map((x) => Math.floor(x) + 1);
      const inside = NODE_OPAQUE[v[volIndex(cell[0], cell[1], cell[2])]] === 1;
      total++;
      if (!inside) bad++;
    }
    expect(total).toBeGreaterThan(100);
    expect(bad).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { VOL, VOL_SIZE, volIndex, CHUNK } from '../src/voxel/coords';
import { meshChunk, PASS_OPAQUE, PASS_CUTOUT, type MeshParams } from '../src/voxel/mesher';
import { nodeId } from '../src/voxel/registry';
import { generateChunk, NO_TOP } from '../src/gen/generator';

const STONE = nodeId('dw_nodes:stone');
const params = (): MeshParams => ({ scale: 1, originY: -1, top: new Int32Array(VOL * VOL).fill(NO_TOP) });
const vol = (): Uint16Array => new Uint16Array(VOL_SIZE);

describe('greedy mesher', () => {
  it('jedna krychle = 6 quadů', () => {
    const v = vol(); v[volIndex(5, 5, 5)] = STONE;
    expect(meshChunk(v, params()).quads).toBe(6);
  });
  it('plná deska 32×1×32 = 6 quadů', () => {
    const v = vol();
    for (let i = 1; i <= CHUNK; i++) for (let k = 1; k <= CHUNK; k++) v[volIndex(i, 3, k)] = STONE;
    expect(meshChunk(v, params()).quads).toBe(6);
  });
  it('různé textury vedle sebe se neslučují', () => {
    const v = vol(); v[volIndex(5, 5, 5)] = STONE; v[volIndex(6, 5, 5)] = nodeId('dw_nodes:dirt');
    expect(meshChunk(v, params()).quads).toBe(10);
  });
  it('plný chunk nemá plochy, ale má bity pro kolize', () => {
    const v = vol().fill(STONE);
    const m = meshChunk(v, params());
    expect(m.quads).toBe(0);
    expect(m.solidBits!.every((w) => w === 0xffffffff)).toBe(true);
  });
  it('navinutí: front face je po směru hodinových ručiček zvenku (Babylon, levotočivě)', () => {
    const v = vol(); v[volIndex(5, 5, 5)] = STONE;
    const p = meshChunk(v, params()).passes[PASS_OPAQUE]!;
    const c = [4.5, 4.5, 4.5]; // střed krychle v lokálních souřadnicích
    for (let qd = 0; qd < p.quads; qd++) {
      const i = p.indices.subarray(qd * 6, qd * 6 + 3);
      const P = (n: number): number[] => [p.positions[i[n] * 3], p.positions[i[n] * 3 + 1], p.positions[i[n] * 3 + 2]];
      const [a, b, d] = [P(0), P(1), P(2)];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const mid = [(a[0] + b[0] + d[0]) / 3 - c[0], (a[1] + b[1] + d[1]) / 3 - c[1], (a[2] + b[2] + d[2]) / 3 - c[2]];
      // F0 (vizuálně ověřeno): pravotočivý součin míří DOVNITŘ krychle
      expect(n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2]).toBeLessThan(0);
    }
  });
  it('AO: kout ztmaví vrcholy u stěny', () => {
    const v = vol();
    for (let i = 1; i <= 10; i++) for (let k = 1; k <= 10; k++) v[volIndex(i, 3, k)] = STONE;
    v[volIndex(5, 4, 5)] = STONE; // kostka na desce → AO kolem ní
    const p = meshChunk(v, params()).passes[PASS_OPAQUE]!;
    let min = 1;
    for (let k = 0; k < p.quads * 4; k++) min = Math.min(min, p.data[k * 4 + 3]);
    expect(min).toBeLessThan(0.5);
  });
  it('rostliny jdou do cutout průchodu jako zkřížené quady', () => {
    const v = vol(); v[volIndex(5, 5, 5)] = nodeId('dw_nodes:grass_1');
    const m = meshChunk(v, params());
    expect(m.passes[PASS_CUTOUT]!.quads).toBe(2);
    expect(m.passes[PASS_OPAQUE]).toBeNull();
  });
  it('spodek ostrova je tmavší než vršek (analytické světlo)', () => {
    const v = vol();
    for (let i = 1; i <= CHUNK; i++) for (let k = 1; k <= CHUNK; k++) v[volIndex(i, 10, k)] = STONE;
    const p = params();
    p.top.fill(9); // world y = originY + j → j=10 je y=9
    const d = meshChunk(v, p).passes[PASS_OPAQUE]!.data;
    const br = Array.from({ length: d.length / 4 }, (_, k) => d[k * 4 + 3]);
    expect(Math.max(...br)).toBeGreaterThan(0.9);
    expect(Math.min(...br)).toBeLessThan(0.35);
  });
});

describe('generátor', () => {
  it('domovský ostrov má povrch v chunku nad středem', () => {
    const v = vol(), top = new Int32Array(VOL * VOL);
    expect(generateChunk(v, 0, 13, 0, 0, 42, top)).toBeGreaterThan(0);
    expect(meshChunk(v, { scale: 1, originY: 13 * 32 - 1, top }).quads).toBeGreaterThan(0);
    expect(Math.max(...top)).toBeGreaterThan(400);
  });
  it('vysoko nad ostrovy je prázdno', () => {
    expect(generateChunk(vol(), 0, 40, 0, 0, 42)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { raycast } from '../src/voxel/raycast';
import { sweepSphere, sphereOverlaps } from '../src/voxel/sweep';
import { EditStore } from '../src/voxel/edits';
import { VoxelWorld } from '../src/voxel/world';
import { solidAtWorld, generateChunk } from '../src/gen/generator';
import { VOL_SIZE, volIndex } from '../src/voxel/coords';
import { NODE_WALKABLE } from '../src/voxel/registry';

// podlaha y <= 0
const floor = (_x: number, y: number): boolean => y <= 0;

describe('raycast (DDA)', () => {
  it('paprsek dolů zasáhne podlahu s normálou nahoru', () => {
    const h = raycast(floor, 0.2, 10, 0.3, 0, -1, 0, 50);
    expect(h.hit).toBe(true);
    expect([h.x, h.y, h.z]).toEqual([0, 0, 0]);
    expect(h.ny).toBe(1);
    expect(h.t).toBeCloseTo(9.5, 6); // node 0 má horní plochu na y = 0.5
  });
  it('šikmý paprsek, mimo dosah = bez zásahu', () => {
    expect(raycast(floor, 0, 10, 0, 1, -0.1, 0, 50).hit).toBe(false);
    expect(raycast(floor, 0, 10, 0, 1, -1, 0.5, 50).hit).toBe(true);
  });
});

describe('sweep koule', () => {
  it('koule r=1.5 padající na podlahu se zastaví nad ní', () => {
    const h = sweepSphere(floor, 0, 10, 0, 0, -10, 0, 1.5);
    expect(h.hit).toBe(true);
    expect(h.y).toBeGreaterThanOrEqual(0.5 + 1.5 - 0.5);
    expect(h.ny).toBeGreaterThan(0.9);
  });
  it('volný let bez zásahu', () => {
    const h = sweepSphere(floor, 0, 10, 0, 30, 10, 0, 1.5);
    expect(h.hit).toBe(false);
    expect(h.x).toBe(30);
  });
  it('overlap těsně nad plochou ne, v ní ano', () => {
    expect(sphereOverlaps(floor, 0, 2.01, 0, 1.5)).toBe(false);
    expect(sphereOverlaps(floor, 0, 1.9, 0, 1.5)).toBe(true);
  });
});

describe('editace a svět', () => {
  it('setNodes vrací chunk i sousedy na hraně', () => {
    const e = new EditStore();
    const d = e.setNodes([31, 5, 0, 0]);
    expect(d.has('0:0:0:0')).toBe(true);
    expect(d.has('0:1:0:0')).toBe(true);
    expect(d.has('0:0:0:-1')).toBe(true);
    expect(e.get(31, 5, 0)).toBe(0);
  });
  it('collect převede editaci do lemu souseda', () => {
    const e = new EditStore();
    e.setNodes([32, 5, 5, 3]); // chunk cx=1, lokálně x=0
    const c = e.collect(0, 0, 0)!; // pro chunk 0 leží x=32 v lemu (i = 33)
    expect(Array.from(c)).toEqual([volIndex(33, 6, 6), 3]);
  });
  it('generátor po voxelu = terén generátoru po chuncích', () => {
    const v = new Uint16Array(VOL_SIZE);
    generateChunk(v, 0, 13, 0, 0, 42, undefined, false);
    let checked = 0;
    for (let j = 1; j <= 32; j += 3) for (let k = 1; k <= 32; k += 3) for (let i = 1; i <= 32; i += 3) {
      const x = i - 1, y = 13 * 32 + j - 1, z = k - 1;
      expect(solidAtWorld(x, y, z, 42)).toBe(NODE_WALKABLE[v[volIndex(i, j, k)]] === 1);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it('editace přebije generátor', () => {
    const w = new VoxelWorld(42);
    const y = 13 * 32 + 5;
    // najdi plný node a vykousni ho
    let x = 0;
    while (!w.solidAt(x, y, 0) && x < 32) x++;
    expect(w.solidAt(x, y, 0)).toBe(true);
    w.setNodes([x, y, 0, 0]);
    expect(w.solidAt(x, y, 0)).toBe(false);
  });
});

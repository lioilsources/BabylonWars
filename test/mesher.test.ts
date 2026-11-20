import { describe, expect, it } from 'vitest';
import { VOL_SIZE, volIndex, CHUNK } from '../src/voxel/coords';
import { meshChunk } from '../src/voxel/mesher';
import { nodeId } from '../src/voxel/registry';
import { generateChunk } from '../src/gen/generator';

describe('greedy mesher', () => {
  it('jedna krychle = 6 quadů', () => {
    const vol = new Uint8Array(VOL_SIZE);
    vol[volIndex(5, 5, 5)] = nodeId('dw_nodes:stone');
    expect(meshChunk(vol).quads).toBe(6);
  });
  it('plná deska 32×1×32 = 6 quadů', () => {
    const vol = new Uint8Array(VOL_SIZE);
    for (let i = 1; i <= CHUNK; i++) for (let k = 1; k <= CHUNK; k++) vol[volIndex(i, 3, k)] = 1;
    expect(meshChunk(vol).quads).toBe(6);
  });
  it('dva materiály vedle sebe se neslučují', () => {
    const vol = new Uint8Array(VOL_SIZE);
    vol[volIndex(5, 5, 5)] = 1; vol[volIndex(6, 5, 5)] = 2;
    // 2 krychle: ±X konce (2), společná stěna skrytá, ostatní 4 směry × 2 = 8
    expect(meshChunk(vol).quads).toBe(10);
  });
  it('plný chunk bez lemu vzduchu nemá plochy uvnitř', () => {
    const vol = new Uint8Array(VOL_SIZE).fill(1);
    expect(meshChunk(vol).quads).toBe(0);
  });
});

describe('generátor', () => {
  it('domovský ostrov má povrch v chunku nad středem', () => {
    const vol = new Uint8Array(VOL_SIZE);
    // střed (0,320,0), kupole do ~434 → chunk cy = 13 (416..447)
    const n = generateChunk(vol, 0, 13, 0, 0, 42);
    expect(n).toBeGreaterThan(0);
    expect(meshChunk(vol).quads).toBeGreaterThan(0);
  });
  it('vysoko nad ostrovy je prázdno', () => {
    const vol = new Uint8Array(VOL_SIZE);
    expect(generateChunk(vol, 0, 40, 0, 0, 42)).toBe(0);
  });
});

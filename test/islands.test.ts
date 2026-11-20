import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hash2d, luaMod, parseSeed } from '../src/gen/lcg';
import { islandForCell, islandProfile } from '../src/gen/islands';

interface GoldenCell {
  cx: number; cz: number; empty?: boolean;
  x: number; y: number; z: number; radius: number; biome: number; shape: string;
  hs: number; cap: number; tail: number; tunnels: boolean; p10: number; pm10: number;
}
interface GoldenSeed { seedString: string; seed: number; cells: GoldenCell[] }

// Vygenerováno z reálného mapgen.lua: scripts/golden/dump.lua (LuaJIT)
const golden: GoldenSeed[] = JSON.parse(readFileSync(new URL('./golden/islands.json', import.meta.url), 'utf8'));

describe('LCG', () => {
  it('Lua modulo = a - floor(a/b)*b', () => {
    expect(luaMod(-1, 5)).toBe(4);
    expect(luaMod(7, 5)).toBe(2);
  });
  it('hash je nezáporný a pod 2^31', () => {
    for (let i = -50; i < 50; i++) {
      const h = hash2d(i, -i * 3, 42);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2147483648);
    }
  });
});

describe('golden: island_for_cell z Lua', () => {
  for (const g of golden) {
    it(`seed "${g.seedString}"`, () => {
      expect(parseSeed(g.seedString)).toBe(g.seed);
      let n = 0;
      for (const c of g.cells) {
        const isl = islandForCell(c.cx, c.cz, g.seed);
        if (c.empty) { expect(isl, `cell ${c.cx},${c.cz}`).toBeNull(); continue; }
        expect(isl, `cell ${c.cx},${c.cz}`).not.toBeNull();
        const i = isl!;
        expect([i.x, i.y, i.z, i.radius, i.biomeIdx, i.shape, i.tunnels]).toEqual(
          [c.x, c.y, c.z, c.radius, c.biome, c.shape, c.tunnels]);
        expect(Math.abs(i.heightScale - c.hs)).toBeLessThan(1e-9);
        expect(Math.abs(i.capFrac - c.cap)).toBeLessThan(1e-9);
        expect(Math.abs(i.tailFrac - c.tail)).toBeLessThan(1e-9);
        expect(Math.abs(islandProfile(i, 10) - c.p10)).toBeLessThan(1e-9);
        expect(Math.abs(islandProfile(i, -10) - c.pm10)).toBeLessThan(1e-9);
        n++;
      }
      expect(n).toBeGreaterThan(100);
    });
  }
});

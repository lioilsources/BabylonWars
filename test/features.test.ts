import { describe, expect, it } from 'vitest';
import { islandForCell, ISLAND_GRID } from '../src/gen/islands';
import { BIOMES } from '../src/gen/biomes';
import { buildFeatures } from '../src/gen/features';
import { generateChunk, islandColumnTop, solidAtWorld } from '../src/gen/generator';
import { VOL, VOL_SIZE, volIndex } from '../src/voxel/coords';
import { nodeId, NODE_DRAW } from '../src/voxel/registry';

const SEED = 42;
const terrain = { surfaceY: (i: Parameters<typeof islandColumnTop>[0], x: number, z: number) => islandColumnTop(i, x, z, SEED),
  solid: (x: number, y: number, z: number) => solidAtWorld(x, y, z, SEED) };

function findIsland(biome: string) {
  for (let r = 0; r < 12; r++) for (let cx = -r; cx <= r; cx++) for (let cz = -r; cz <= r; cz++) {
    const isl = islandForCell(cx, cz, SEED);
    if (isl && isl.biome.name === biome && !(cx === 0 && cz === 0)) return isl;
  }
  throw new Error(`biom ${biome} nenalezen`);
}

describe('dekorace', () => {
  it('všech 12 biomů existuje v okolí seedu 42', () => {
    for (const b of BIOMES) expect(findIsland(b.name).biome.name).toBe(b.name);
    expect(ISLAND_GRID).toBe(340);
  });
  it('seznam prvků je deterministický', () => {
    const isl = findIsland('verdant');
    const a = buildFeatures(isl, SEED, terrain), b = buildFeatures(isl, SEED, terrain);
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(500);
    const dump = (f: typeof a): number[] => { const o: number[] = []; f.slice(0, 50).forEach((x) => x.emit((...p) => o.push(p[0], p[1], p[2], p[3]))); return o; };
    expect(dump(a)).toEqual(dump(b));
  });
  it('sopečný ostrov má lávu a čedičovou homoli', () => {
    const isl = findIsland('volcanic');
    const f = buildFeatures(isl, SEED, terrain);
    const lava = nodeId('dw_nodes:lava_source');
    let lavaCount = 0;
    f[0].emit((_x, _y, _z, id) => { if (id === lava) lavaCount++; });
    expect(lavaCount).toBeGreaterThan(20);
  });
  it('prvky se razítkují do chunku nezávisle na pořadí chunků', () => {
    const isl = findIsland('jungle');
    const top = islandColumnTop(isl, isl.x, isl.z, SEED)!;
    const cx = Math.floor(isl.x / 32), cy = Math.floor((top + 2) / 32), cz = Math.floor(isl.z / 32);
    const v1 = new Uint16Array(VOL_SIZE), v2 = new Uint16Array(VOL_SIZE);
    generateChunk(v1, cx, cy, cz, 0, SEED, new Int32Array(VOL * VOL));
    generateChunk(new Uint16Array(VOL_SIZE), cx + 1, cy, cz, 0, SEED); // jiný chunk mezi tím
    generateChunk(v2, cx, cy, cz, 0, SEED, new Int32Array(VOL * VOL));
    expect(v2).toEqual(v1);
    let plants = 0;
    for (let i = 0; i < VOL_SIZE; i++) if (NODE_DRAW[v1[i]] === 'plantlike' || NODE_DRAW[v1[i]] === 'allfaces') plants++;
    expect(plants).toBeGreaterThan(0);
    expect(v1[volIndex(1, 1, 1)]).toBeTypeOf('number');
  });
});

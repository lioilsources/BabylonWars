// Dekorace ostrovů — port decorate.lua. Originál sází dodatečně přes
// set_node a math.random; tady se pro každý ostrov jednou spočítá SEZNAM
// PRVKŮ ze seedovaného PRNG (seed = hash ostrova). Každý prvek má
// deterministickou funkci emit(), která vygeneruje své zápisy; chunk
// orazítkuje jen zápisy uvnitř svého objemu. Pořadí prvků = pořadí zápisů,
// takže výsledek nezávisí na tom, v jakém pořadí se chunky generují.
//
// Dotazy na terén (povrch, spodek ostrova) jdou na generátor BEZ dekorací —
// prvky se tedy navzájem nestohují (strom na balvanu). Vědomé zjednodušení.

import { hash2d } from './lcg';
import type { Island } from './islands';
import { nodeId } from '../voxel/registry';

export type Put = (x: number, y: number, z: number, id: number, ifAir: boolean) => void;

export interface Feature {
  emit(put: Put): void;
  minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number;
}

/** Dotazy na čistý terén (implementuje generator.ts) */
export interface TerrainQuery {
  /** nejvyšší plný blok sloupce ostrova, nebo null */
  surfaceY(isl: Island, x: number, z: number): number | null;
  solid(x: number, y: number, z: number): boolean;
}

// --- PRNG (mulberry32) — vlastní, deterministický -------------------------
export class Rng {
  constructor(private s: number) { this.s = s >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** celé číslo a..b včetně (jako math.random(a, b)) */
  int(a: number, b: number): number { return a + Math.floor(this.next() * (b - a + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  seed(): number { return Math.floor(this.next() * 4294967296); }
}

const id = nodeId;
const N = {
  air: 0,
  tree: id('dw_nodes:tree'), leaves: id('dw_nodes:leaves'),
  acaciaTree: id('dw_nodes:acacia_tree'), acaciaLeaves: id('dw_nodes:acacia_leaves'),
  jungleTree: id('dw_nodes:jungletree'), jungleLeaves: id('dw_nodes:jungleleaves'),
  bushStem: id('dw_nodes:bush_stem'),
  crystal: id('doggiowars:crystal'), iceCrystal: id('doggiowars:ice_crystal'),
  spore: id('doggiowars:spore_block'), basalt: id('doggiowars:basalt'), magma: id('doggiowars:magma_block'),
  lava: id('dw_nodes:lava_source'), water: id('dw_nodes:water_source'), waterFlow: id('dw_nodes:water_flowing'),
  riverWater: id('dw_nodes:river_water_source'), riverFlow: id('dw_nodes:river_water_flowing'),
  sand: id('dw_nodes:sand'), mud: id('doggiowars:mud'), dirt: id('dw_nodes:dirt'),
  waterlily: id('dw_nodes:waterlily'), snow: id('dw_nodes:snow'), embers: id('doggiowars:embers'),
  flame: id('dw_nodes:basic_flame'), dryShrub: id('dw_nodes:dry_shrub'), papyrus: id('dw_nodes:papyrus'),
  cactus: id('dw_nodes:cactus'), ice: id('dw_nodes:ice'), caveIce: id('dw_nodes:cave_ice'),
};
const ids = (names: string[]): number[] => names.map(id);
const FLOWERS = ids(['dw_nodes:rose', 'dw_nodes:tulip', 'dw_nodes:dandelion_yellow', 'dw_nodes:dandelion_white', 'dw_nodes:geranium', 'dw_nodes:viola']);
const GRASS = ids(['dw_nodes:grass_1', 'dw_nodes:grass_2', 'dw_nodes:grass_3', 'dw_nodes:grass_4', 'dw_nodes:grass_5']);
const DRY_GRASS = ids(['dw_nodes:dry_grass_1', 'dw_nodes:dry_grass_2', 'dw_nodes:dry_grass_3', 'dw_nodes:dry_grass_4', 'dw_nodes:dry_grass_5']);
const FERNS = ids(['dw_nodes:fern_1', 'dw_nodes:fern_2', 'dw_nodes:fern_3']);
const MARRAM = ids(['dw_nodes:marram_grass_1', 'dw_nodes:marram_grass_2', 'dw_nodes:marram_grass_3']);
const JUNGLE_GROUND = ids(['dw_nodes:junglegrass', 'dw_nodes:fern_1', 'dw_nodes:fern_2', 'dw_nodes:fern_3']);
const SWAMP_MUSH = ids(['dw_nodes:mushroom_red', 'dw_nodes:mushroom_brown']);
const VERDANT_TREES: [number, number][] = [
  [N.tree, N.leaves], [id('dw_nodes:aspen_tree'), id('dw_nodes:aspen_leaves')], [id('dw_nodes:pine_tree'), id('dw_nodes:pine_needles')],
];

// --- tvary (port funkcí z decorate.lua; r = PRNG prvku) -------------------
type Shape = (put: Put, r: Rng) => void;

const boulder = (x: number, y: number, z: number, name: number, rad: number): Shape => (put) => {
  for (let dx = -rad; dx <= rad; dx++) for (let dy = 0; dy <= rad; dy++) for (let dz = -rad; dz <= rad; dz++)
    if (dx * dx + dy * dy + dz * dz <= rad * rad + 1) put(x + dx, y + dy, z + dz, name, true);
};
const column = (x: number, y: number, z: number, name: number, h: number): Shape => (put) => {
  for (let dy = 1; dy <= h; dy++) put(x, y + dy, z, name, true);
};
const single = (x: number, y: number, z: number, name: number): Shape => (put) => put(x, y + 1, z, name, true);

const tree = (x: number, sy: number, z: number, trunk: number, leaf: number): Shape => (put, r) => {
  const h = r.int(4, 7);
  for (let dy = 1; dy <= h; dy++) put(x, sy + dy, z, trunk, true);
  const top = sy + h;
  for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++)
    if (dx * dx + dy * dy + dz * dz <= 6) put(x + dx, top + dy, z + dz, leaf, true);
};
const acacia = (x: number, y: number, z: number): Shape => (put, r) => {
  const h = r.int(4, 6);
  for (let dy = 1; dy <= h; dy++) put(x, y + dy, z, N.acaciaTree, true);
  const top = y + h;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (dx * dx + dz * dz <= 10) {
    put(x + dx, top, z + dz, N.acaciaLeaves, true); put(x + dx, top + 1, z + dz, N.acaciaLeaves, true);
  }
};
const deadTree = (x: number, y: number, z: number): Shape => (put, r) => {
  const h = r.int(3, 6);
  for (let dy = 1; dy <= h; dy++) put(x, y + dy, z, N.acaciaTree, true);
  const top = y + h;
  for (let i = r.int(1, 3); i > 0; i--) put(x + (r.int(0, 1) === 0 ? 1 : -1), top - r.int(0, 1), z, N.acaciaTree, true);
};
const crystalCluster = (x: number, y: number, z: number): Shape => (put, r) => {
  column(x, y, z, N.crystal, r.int(2, 5))(put, r);
  for (let i = r.int(1, 3); i > 0; i--) {
    const ox = r.int(-1, 1), oz = r.int(-1, 1);
    column(x + ox, y, z + oz, N.crystal, r.int(1, 3))(put, r);
  }
};
const bush = (x: number, y: number, z: number, leaf: number): Shape => (put) => {
  put(x, y + 1, z, N.bushStem, true);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(x + dx, y + 2, z + dz, leaf, true);
  put(x, y + 3, z, leaf, true);
};
/** Zadržená tůň (carve_pond): hladina v úrovni povrchu, těsnící dno a val */
const pond = (cx: number, y: number, cz: number, rad: number, liquid: number, mat: number, lilies = 0): Shape => (put, r) => {
  for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (dx * dx + dz * dz <= rad * rad) {
    put(cx + dx, y - 1, cz + dz, mat, true);
    put(cx + dx, y, cz + dz, liquid, false);
    // lekníny na hladině (Lua je sází, když rozptyl trefí vodu)
    if (lilies && r.next() < lilies) put(cx + dx, y + 1, cz + dz, N.waterlily, true);
  }
  for (let dx = -rad - 1; dx <= rad + 1; dx++) for (let dz = -rad - 1; dz <= rad + 1; dz++) {
    const d2 = dx * dx + dz * dz;
    if (d2 > rad * rad && d2 <= (rad + 1) * (rad + 1) + 1) {
      put(cx + dx, y, cz + dz, mat, true); put(cx + dx, y - 1, cz + dz, mat, true);
    }
  }
};

// --- jednotlivé prvky podle biomu (place_feature) -------------------------
function placeFeature(kind: string, x: number, y: number, z: number, r: Rng): Shape | null {
  const p = r.int(1, 100);
  switch (kind) {
    case 'verdant':
      if (p <= 42) return single(x, y, z, r.pick(GRASS));
      if (p <= 68) return single(x, y, z, r.pick(FLOWERS));
      if (p <= 77) { const t = r.pick(VERDANT_TREES); return tree(x, y, z, t[0], t[1]); }
      if (p <= 83) return bush(x, y, z, id('dw_nodes:bush_leaves'));
      if (p <= 87) return bush(x, y, z, id('dw_nodes:blueberry_bush_leaves_with_berries'));
      if (p <= 90) return single(x, y, z, r.pick(SWAMP_MUSH));
      return null;
    case 'jungle':
      if (p <= 38) return single(x, y, z, r.pick(JUNGLE_GROUND));
      if (p <= 56) return tree(x, y, z, N.jungleTree, N.jungleLeaves);
      if (p <= 68) return column(x, y, z, N.papyrus, r.int(2, 4));
      if (p <= 77) return bush(x, y, z, N.jungleLeaves);
      if (p <= 86) return single(x, y, z, r.pick(FLOWERS));
      return null;
    case 'glacial':
      if (p <= 30) return column(x, y, z, N.iceCrystal, r.int(1, 3));
      if (p <= 46) return single(x, y, z, N.snow);
      if (p <= 58) return boulder(x, y, z, N.ice, r.int(1, 2));
      if (p <= 64) return boulder(x, y, z, N.caveIce, 1);
      return null;
    case 'crystal':
      if (p <= 34) return crystalCluster(x, y, z);
      if (p <= 46) return single(x, y, z, N.crystal);
      if (p <= 56) return boulder(x, y, z, id('dw_nodes:silver_sandstone'), r.int(1, 2));
      return null;
    case 'volcanic':
      if (p <= 22) return single(x, y, z, N.embers);
      if (p <= 34) return boulder(x, y, z, N.basalt, r.int(1, 2));
      if (p <= 42) return single(x, y, z, N.flame);
      if (p <= 48) return pond(x, y, z, r.int(1, 2), N.lava, N.basalt);
      return null;
    case 'ashen':
      if (p <= 14) return deadTree(x, y, z);
      if (p <= 40) return single(x, y, z, N.embers);
      if (p <= 52) return single(x, y, z, N.flame);
      if (p <= 58) return pond(x, y, z, 1, N.lava, N.basalt);
      if (p <= 66) return single(x, y, z, N.dryShrub);
      return null;
    case 'atoll':
      if (p <= 30) return single(x, y, z, r.pick(MARRAM));
      if (p <= 40) return column(x, y, z, N.papyrus, r.int(2, 3));
      if (p <= 48) return boulder(x, y, z, id('dw_nodes:coral_skeleton'), 1);
      if (p <= 58) return pond(x, y, z, r.int(1, 2), N.water, N.sand, 0.3);
      return null;
    case 'swamp':
      if (p <= 22) return pond(x, y, z, r.int(1, 2), N.water, N.mud, 0.3);
      if (p <= 42) return column(x, y, z, N.papyrus, r.int(2, 4));
      if (p <= 56) return single(x, y, z, r.pick(SWAMP_MUSH));
      if (p <= 66) return single(x, y, z, r.pick(FERNS));
      if (p <= 72) return boulder(x, y, z, id('doggiowars:mossy_stone'), r.int(1, 2));
      return null;
    case 'desert':
      if (p <= 14) return column(x, y, z, N.cactus, r.int(2, 4));
      if (p <= 40) return single(x, y, z, N.dryShrub);
      if (p <= 55) return single(x, y, z, r.pick(DRY_GRASS));
      if (p <= 62) return boulder(x, y, z, id('dw_nodes:desert_sandstone'), r.int(1, 2));
      return null;
    case 'savanna':
      if (p <= 8) return acacia(x, y, z);
      if (p <= 55) return single(x, y, z, r.pick(DRY_GRASS));
      if (p <= 68) return single(x, y, z, N.dryShrub);
      if (p <= 73) return bush(x, y, z, id('dw_nodes:acacia_bush_leaves'));
      return null;
    case 'mycelial':
      if (p <= 40) return single(x, y, z, r.pick(SWAMP_MUSH));
      if (p <= 55) return single(x, y, z, r.pick(FERNS));
      return null;
    case 'barren':
      if (p <= 12) return boulder(x, y, z, id('dw_nodes:stone'), r.int(1, 2));
      if (p <= 20) return boulder(x, y, z, id('dw_nodes:gravel'), 1);
      if (p <= 32) return single(x, y, z, N.dryShrub);
      return null;
  }
  return null;
}

// --- globální prvky ostrova (decorate_global) -----------------------------
function waterfall(isl: Island, x: number, z: number, water: number, t: TerrainQuery): Shape | null {
  const top = t.surfaceY(isl, x, z);
  if (top === null) return null;
  const ys: number[] = [];
  for (let y = top + 1; y >= top - 34; y--) {
    if (!t.solid(x, y, z)) ys.push(y);
    else if (y < top) break;
  }
  return (put) => { for (const y of ys) put(x, y, z, water, true); };
}

function river(isl: Island, r: Rng, t: TerrainQuery): Shape {
  const cells: number[] = [];
  let ang = r.next() * Math.PI * 2;
  let x = isl.x, z = isl.z;
  const steps = Math.floor(isl.radius * 1.4);
  let fall: Shape | null = null;
  for (let i = 0; i < steps; i++) {
    ang += (r.next() - 0.5) * 0.6;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    x += dx; z += dz;
    const ix = Math.floor(x), iz = Math.floor(z);
    const sy = t.surfaceY(isl, ix, iz);
    if (sy === null) break;
    for (let w = -1; w <= 1; w++) {
      const px = ix + Math.floor(-dz * w + 0.5), pz = iz + Math.floor(dx * w + 0.5);
      cells.push(px, t.surfaceY(isl, px, pz) ?? sy, pz);
    }
    if (Math.hypot(ix - isl.x, iz - isl.z) > isl.radius * 0.85) { fall = waterfall(isl, ix, iz, N.riverFlow, t); break; }
  }
  return (put, rr) => {
    for (let i = 0; i < cells.length; i += 3) put(cells[i], cells[i + 1], cells[i + 2], N.riverWater, false);
    fall?.(put, rr);
  };
}

function volcano(isl: Island, r: Rng, t: TerrainQuery): Shape | null {
  const cx = isl.x, cz = isl.z, R = isl.radius;
  const mr = Math.max(18, Math.min(Math.floor(R * 0.42), 34));
  const craterR = Math.max(4, Math.floor(mr * 0.22));
  const mh = Math.max(11, Math.floor(mr * 0.5));
  const samples: number[] = [];
  for (let a = 0; a < 8; a++) {
    const ang = a * Math.PI / 4;
    const s = t.surfaceY(isl, cx + Math.floor(Math.cos(ang) * mr * 0.65), cz + Math.floor(Math.sin(ang) * mr * 0.65));
    if (s !== null) samples.push(s);
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  const baseY = samples[Math.ceil(samples.length / 2) - 1];
  const topY = baseY + mh;
  // sloupce homole: [x, z, coneY, clearTo] — co nad homolí, se odstraní
  const cols: number[] = [];
  for (let dx = -mr; dx <= mr; dx++) for (let dz = -mr; dz <= mr; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > mr) continue;
    const h = d <= craterR ? mh : Math.max(0, Math.floor(mh * (1 - (d - craterR) / (mr - craterR)) ** 1.5 + 0.5));
    const coneY = baseY + h;
    const s = t.surfaceY(isl, cx + dx, cz + dz);
    cols.push(cx + dx, cz + dz, coneY, s !== null && s > coneY ? Math.min(s, baseY + mh + mr + 8) : coneY);
  }
  // lávový proud po +X svahu: povrch = homole (spočítaná výše) nebo terén za ní
  const coneAt = (x: number): number | null => {
    const d = Math.abs(x - cx);
    if (d <= mr) {
      const h = d <= craterR ? mh : Math.max(0, Math.floor(mh * (1 - (d - craterR) / (mr - craterR)) ** 1.5 + 0.5));
      return baseY + h;
    }
    const s = t.surfaceY(isl, x, cz);
    return s !== null && s <= topY ? s : null;
  };
  const flow: number[] = [];
  for (let x = cx + craterR + 1; x <= cx + mr + 2; x++) {
    const sy = coneAt(x);
    if (sy === null) break;
    flow.push(x, sy);
  }
  const vx = cx + mr + 3;
  const vy = t.surfaceY(isl, vx, cz);
  const poolR = r.int(3, 5);
  return (put, rr) => {
    for (let i = 0; i < cols.length; i += 4) {
      const x = cols[i], z = cols[i + 1], coneY = cols[i + 2], clearTo = cols[i + 3];
      for (let y = baseY - 6; y <= coneY; y++) put(x, y, z, N.basalt, false);
      for (let y = coneY + 1; y <= clearTo; y++) put(x, y, z, N.air, false);
    }
    // kráter: hladina lávy top-1, dno top-3
    for (let dx = -craterR; dx <= craterR; dx++) for (let dz = -craterR; dz <= craterR; dz++) {
      if (dx * dx + dz * dz > craterR * craterR) continue;
      put(cx + dx, topY, cz + dz, N.air, false);
      put(cx + dx, topY - 1, cz + dz, N.lava, false);
      put(cx + dx, topY - 2, cz + dz, N.lava, false);
      put(cx + dx, topY - 3, cz + dz, N.basalt, false);
    }
    // žhavý val s přepadem na +X
    for (let dx = -craterR - 1; dx <= craterR + 1; dx++) for (let dz = -craterR - 1; dz <= craterR + 1; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > craterR * craterR && d2 <= (craterR + 1) ** 2 + 1 && !(dx >= craterR - 1 && Math.abs(dz) <= 1)) {
        put(cx + dx, topY, cz + dz, N.magma, false); put(cx + dx, topY + 1, cz + dz, N.magma, false);
      }
    }
    for (let dx = craterR - 1; dx <= craterR + 3; dx++) for (let dz = -1; dz <= 1; dz++) {
      put(cx + dx, topY, cz + dz, N.air, false); put(cx + dx, topY - 1, cz + dz, N.lava, false);
    }
    for (let i = 0; i < flow.length; i += 2) {
      const x = flow[i], sy = flow[i + 1];
      for (let dz = -1; dz <= 1; dz++) put(x, sy, cz + dz, N.lava, false);
      put(x, sy + 1, cz + 2, N.basalt, false); put(x, sy + 1, cz - 2, N.basalt, false);
    }
    if (vy !== null) pond(vx, vy, cz, poolR, N.lava, N.basalt)(put, rr);
  };
}

function icicles(isl: Island, r: Rng, t: TerrainQuery): Shape {
  const list: number[] = [];
  for (let i = r.int(6, 16); i > 0; i--) {
    const a = r.next() * Math.PI * 2, rad = isl.radius * (0.7 + r.next() * 0.3);
    const ix = Math.floor(isl.x + Math.cos(a) * rad), iz = Math.floor(isl.z + Math.sin(a) * rad);
    let bottom: number | null = null;
    for (let y = isl.y; y >= isl.y - Math.floor(isl.radius * 1.5); y--) {
      if (t.solid(ix, y, iz)) bottom = y;
      else if (bottom !== null) break;
    }
    list.push(ix, bottom ?? isl.y, iz, r.int(3, 8));
  }
  return (put) => {
    for (let i = 0; i < list.length; i += 4)
      for (let dy = 1; dy <= list[i + 3]; dy++) put(list[i], list[i + 1] - dy, list[i + 2], N.iceCrystal, true);
  };
}

function giantMushroom(isl: Island, r: Rng, t: TerrainQuery): Shape | null {
  const a = r.next() * Math.PI * 2, rad = r.int(0, Math.floor(isl.radius * 0.6));
  const mx = Math.floor(isl.x + Math.cos(a) * rad), mz = Math.floor(isl.z + Math.sin(a) * rad);
  const sy = t.surfaceY(isl, mx, mz);
  if (sy === null) return null;
  const stem = r.int(4, 9), cap = r.int(2, 4);
  return (put) => {
    for (let dy = 1; dy <= stem; dy++) put(mx, sy + dy, mz, N.tree, true);
    const top = sy + stem + 1;
    for (let dx = -cap; dx <= cap; dx++) for (let dz = -cap; dz <= cap; dz++)
      if (dx * dx + dz * dz <= cap * cap) put(mx + dx, top, mz + dz, N.spore, true);
  };
}

function globalFeatures(isl: Island, kind: string, r: Rng, t: TerrainQuery): Shape[] {
  const out: (Shape | null)[] = [];
  const R = isl.radius;
  const fallAt = (): Shape | null => {
    const a = r.next() * Math.PI * 2;
    return waterfall(isl, Math.floor(isl.x + Math.cos(a) * (R - 2)), Math.floor(isl.z + Math.sin(a) * (R - 2)), N.waterFlow, t);
  };
  switch (kind) {
    case 'verdant':
      if (R > 90 && r.next() < 0.5) out.push(river(isl, r, t));
      if (r.next() < 0.3) out.push(fallAt());
      break;
    case 'jungle':
      if (R > 90 && r.next() < 0.5) out.push(river(isl, r, t));
      if (r.next() < 0.25) out.push(fallAt());
      break;
    case 'volcanic': out.push(volcano(isl, r, t)); break;
    case 'atoll': {
      const sy = t.surfaceY(isl, isl.x, isl.z);
      if (sy !== null) out.push(pond(isl.x, sy, isl.z, Math.max(3, Math.floor(R * 0.3)), N.water, N.sand, 0.04));
      break;
    }
    case 'glacial': out.push(icicles(isl, r, t)); break;
    case 'mycelial':
      for (let i = r.int(3, 8); i > 0; i--) out.push(giantMushroom(isl, r, t));
      break;
  }
  return out.filter((s): s is Shape => s !== null);
}

/** Seznam prvků ostrova; volá se jednou za ostrov (výsledek se cachuje) */
export function buildFeatures(isl: Island, seed: number, t: TerrainQuery): Feature[] {
  const r = new Rng(hash2d(isl.cx * 7 + 3, isl.cz * 13 + 5, seed) ^ 0x5bd1e995);
  const kind = isl.biome.name;
  const shapes: Shape[] = [];
  // globální prvky napřed (Lua: try_global po rozptylu prvního chunku —
  // pořadí se liší, ale řeky/sopka mají přednost před drobnostmi)
  shapes.push(...globalFeatures(isl, kind, r, t));
  // rozptyl: hustota jako decorate_chunk (1 vzorek na 22 m² čtverce ostrova)
  const R = isl.radius;
  const n = Math.floor((2 * R + 1) ** 2 / 22);
  for (let i = 0; i < n; i++) {
    const x = isl.x + r.int(-R, R), z = isl.z + r.int(-R, R);
    const sub = new Rng(r.seed());
    if ((x - isl.x) ** 2 + (z - isl.z) ** 2 > R * R) continue;
    const y = t.surfaceY(isl, x, z);
    if (y === null) continue;
    const s = placeFeature(kind, x, y, z, sub);
    if (s) shapes.push(s);
  }
  // každý tvar dostane vlastní seed a AABB (spočítá se prvním průchodem)
  return shapes.map((s) => {
    const fseed = r.seed();
    const f: Feature = {
      emit: (put) => s(put, new Rng(fseed)),
      minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    };
    f.emit((x, y, z) => {
      if (x < f.minX) f.minX = x; if (y < f.minY) f.minY = y; if (z < f.minZ) f.minZ = z;
      if (x > f.maxX) f.maxX = x; if (y > f.maxY) f.maxY = y; if (z > f.maxZ) f.maxZ = z;
    });
    return f;
  }).filter((f) => f.minX !== Infinity);
}

/**
 * Rezerva, o kterou prvky přesahují obálku ostrova z yExtents: homole sopky
 * stojí na mediánu povrchu a přidá až mh (≤ 17) + val; rampouchy visí ≤ 8
 * pod spodkem; koruny stromů ≤ 10 nad povrchem.
 */
export const FEATURE_PAD = 24;


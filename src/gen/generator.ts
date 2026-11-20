// Generátor objemu chunku (mapgen.lua register_on_generated, po sloupcích).
// Čistá funkce (cx, cy, cz, lod, seed) → voxely; běží ve workeru.
// Objem má lem 1 voxel kolem chunku, aby mesher nepotřeboval sousedy.

import { nodeId, AIR, NODE_DRAW } from '../voxel/registry';
import { buildFeatures, FEATURE_PAD, type Feature, type TerrainQuery } from './features';
import { CHUNK, VOL, volIndex } from '../voxel/coords';
import { type Island, islandProfile, islandsTouching, yExtents, TUNNEL_R2 } from './islands';
import { NP_EDGE, NP_HILLS, NP_T1, NP_T2, noise2, noise3 } from './noise';

function surfLimit(isl: Island, yRel: number, hillShift: number, edgeBoost: number): number {
  const profY = yRel >= 0 ? yRel - hillShift : yRel;
  const prof = islandProfile(isl, profY);
  if (prof <= 0) return 0;
  const fade = Math.min(1, prof / (isl.radius * 0.3));
  return prof + edgeBoost * fade;
}

// Cache id materiálů podle jména (surface() vrací jména)
const idCache = new Map<string, number>();
const idOf = (name: string): number => {
  let id = idCache.get(name);
  if (id === undefined) { id = nodeId(name); idCache.set(name, id); }
  return id;
};

const tmpIslands: Island[] = [];
export const NO_TOP = -1e9;

/** Velikost chunku ve světě pro daný LOD (voxel = 2^lod bloků) */
export const chunkWorldSize = (lod: number): number => CHUNK << lod;

/**
 * Vyplní `vol` (VOL³, index volIndex) pro chunk (cx,cy,cz) v mřížce LOD
 * a `top` (VOL², index k*VOL+i) = nejvyšší plný blok terénu ve sloupci
 * (pro analytické světlo; −1e9 = nic). Vrací počet plných voxelů uvnitř
 * (bez lemu) — 0 znamená prázdný chunk.
 */
export function generateChunk(vol: Uint16Array, cx: number, cy: number, cz: number, lod: number, seed: number,
  top?: Int32Array, decorate = true): number {
  vol.fill(AIR);
  top?.fill(NO_TOP);
  const s = 1 << lod;
  const size = CHUNK * s;
  const ox = cx * size - s, oy = cy * size - s, oz = cz * size - s; // svět pro index 0 (lem)
  const maxW = (VOL - 1) * s;
  const islands = islandsTouching(ox, oy, oz, ox + maxW, oy + maxW, oz + maxW, seed, tmpIslands);
  // bez terénu může chunk pořád nést dekorace (vrchol sopky nad obálkou ostrova)

  let filled = 0;
  for (const isl of islands) {
    const [up, down] = yExtents(isl);
    const yMin = Math.floor(isl.y - down), yMax = Math.ceil(isl.y + up);
    const rExt = isl.radius * 1.2;
    const edgeAmp = isl.radius * 0.14;
    const hillAmp = Math.max(4, isl.radius * 0.16);
    const midBand = isl.radius * 0.5;
    const maxReach = isl.radius + edgeAmp + 1;

    const j0 = Math.max(0, Math.ceil((yMin - oy) / s));
    const j1 = Math.min(VOL - 1, Math.floor((yMax - oy) / s));
    if (j1 < j0) continue;

    for (let k = 0; k < VOL; k++) {
      const wz = oz + k * s;
      if (Math.abs(wz - isl.z) > rExt) continue;
      const dz = wz - isl.z;
      for (let i = 0; i < VOL; i++) {
        const wx = ox + i * s;
        const dx = wx - isl.x;
        if (Math.abs(dx) > rExt) continue;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > maxReach) continue;
        const edgeBoost = noise2(NP_EDGE, wx, wz, seed) * edgeAmp;
        const hillShift = noise2(NP_HILLS, wx, wz, seed) * hillAmp;
        const solidAt = (wy: number): boolean => {
          if (wy < yMin || wy > yMax) return false;
          const lim = surfLimit(isl, wy - isl.y, hillShift, edgeBoost);
          return lim > 0 && dist <= lim;
        };
        if (top) {
          const y = scanTop(solidAt, yMin, yMax);
          const ti = k * VOL + i;
          if (y !== null && y > top[ti]) top[ti] = y;
        }

        // hloubka pod povrchem odshora (calc_depth: souvislé plné nad y, max 6)
        const topY = oy + j1 * s;
        let depthAbove = 0; // hloubka voxelu o 1 blok výš
        if (lod === 0) {
          // nasaď počítadlo nad horním okrajem rozsahu
          for (let y = topY + 6; y > topY; y--) depthAbove = solidAt(y + 1) ? 1 + Math.min(depthAbove, 5) : 0;
        }
        let prevSolid = lod === 0 ? solidAt(topY + 1) : false;

        for (let j = j1; j >= j0; j--) {
          const wy = oy + j * s;
          const solid = solidAt(wy);
          let depth: number;
          if (lod === 0) {
            depth = prevSolid ? 1 + Math.min(depthAbove, 5) : 0;
            depthAbove = depth;
            prevSolid = solid;
          } else {
            depth = 0;
            if (solid) for (let y = wy + 1; y <= wy + 6 && solidAt(y); y++) depth++;
          }
          if (!solid) continue;
          const vi = volIndex(i, j, k);
          if (vol[vi] !== AIR) continue;
          const yRel = wy - isl.y;
          if (isl.tunnels && Math.abs(yRel) < midBand) {
            const a = noise3(NP_T1, wx, wy, wz, seed);
            const b = noise3(NP_T2, wx, wy, wz, seed);
            if (a * a + b * b < TUNNEL_R2) continue;
          }
          vol[vi] = idOf(isl.biome.surface(depth));
          if (i > 0 && i < VOL - 1 && j > 0 && j < VOL - 1 && k > 0 && k < VOL - 1) filled++;
        }
      }
    }
  }
  if (decorate) filled += stampFeatures(vol, top, ox, oy, oz, s, seed);
  return filled;
}

// horní plocha sloupce: hrubě po 4 shora, pak zpřesni
function scanTop(solidAt: (y: number) => boolean, yMin: number, yMax: number): number | null {
  let y = yMax;
  while (y >= yMin && !solidAt(y)) y -= 4;
  if (y < yMin) {
    // hrubý krok mohl přeskočit tenkou vrstvu u dna — dojeď po jedné
    for (y = Math.min(yMax, yMin + 3); y >= yMin; y--) if (solidAt(y)) break;
    if (y < yMin) return null;
  }
  while (y + 1 <= yMax && solidAt(y + 1)) y++;
  return y;
}

/** Nejvyšší plný blok sloupce ostrova (bez tunelů a dekorací) */
export function islandColumnTop(isl: Island, x: number, z: number, seed: number): number | null {
  const [up, down] = yExtents(isl);
  const yMin = Math.floor(isl.y - down), yMax = Math.ceil(isl.y + up);
  const edgeAmp = isl.radius * 0.14;
  const dist = Math.hypot(x - isl.x, z - isl.z);
  if (dist > isl.radius + edgeAmp + 1) return null;
  const edgeBoost = noise2(NP_EDGE, x, z, seed) * edgeAmp;
  const hillShift = noise2(NP_HILLS, x, z, seed) * Math.max(4, isl.radius * 0.16);
  return scanTop((wy) => {
    const lim = surfLimit(isl, wy - isl.y, hillShift, edgeBoost);
    return lim > 0 && dist <= lim;
  }, yMin, yMax);
}

// --- dekorace: seznam prvků per ostrov (LRU 64) a razítkování do chunku ---
const featureCache = new Map<string, Feature[]>();
function featuresOf(isl: Island, seed: number): Feature[] {
  const key = `${seed}:${isl.cx}:${isl.cz}`;
  let f = featureCache.get(key);
  if (f) { featureCache.delete(key); featureCache.set(key, f); return f; }
  const t: TerrainQuery = {
    surfaceY: (i, x, z) => islandColumnTop(i, x, z, seed),
    solid: (x, y, z) => solidAtWorld(x, y, z, seed),
  };
  f = buildFeatures(isl, seed, t);
  featureCache.set(key, f);
  if (featureCache.size > 64) featureCache.delete(featureCache.keys().next().value!);
  return f;
}

const tmpFeatIslands: Island[] = [];

function stampFeatures(vol: Uint16Array, top: Int32Array | undefined, ox: number, oy: number, oz: number,
  s: number, seed: number): number {
  const maxW = (VOL - 1) * s;
  const P = FEATURE_PAD;
  const islands = islandsTouching(ox - P, oy - P, oz - P, ox + maxW + P, oy + maxW + P, oz + maxW + P, seed, tmpFeatIslands);
  let placed = 0;
  const put = (x: number, y: number, z: number, id: number, ifAir: boolean): void => {
    const di = x - ox, dk = z - oz;
    if (di % s !== 0 || dk % s !== 0) return;
    const i = di / s, k = dk / s;
    if (i < 0 || k < 0 || i >= VOL || k >= VOL) return;
    const dj = y - oy;
    // stín pod korunami stromů: horní plocha sloupce i nad chunkem
    if (top && id !== AIR && NODE_DRAW[id] !== 'liquid' && y > top[k * VOL + i]) top[k * VOL + i] = y;
    if (dj % s !== 0) return;
    const j = dj / s;
    if (j < 0 || j >= VOL) return;
    const vi = volIndex(i, j, k);
    if (ifAir && vol[vi] !== AIR) return;
    vol[vi] = id;
    if (id !== AIR) placed++;
  };
  for (const isl of islands) {
    for (const f of featuresOf(isl, seed)) {
      // v xz se musí protínat; ve y stačí, aby prvek sahal nad spodek chunku (kvůli stínu)
      if (f.maxX < ox || f.minX > ox + maxW || f.maxZ < oz || f.minZ > oz + maxW || f.maxY < oy) continue;
      if (!top && f.minY > oy + maxW) continue;
      f.emit(put);
    }
  }
  return placed;
}

const tmpPoint: Island[] = [];

/**
 * Je node (x,y,z) plný podle generátoru (bez editací)? Pro dotazy mimo
 * načtené chunky — stejná logika jako generateChunk pro jeden voxel.
 */
export function solidAtWorld(x: number, y: number, z: number, seed: number): boolean {
  for (const isl of islandsTouching(x, y, z, x, y, z, seed, tmpPoint)) {
    const [up, down] = yExtents(isl);
    if (y < Math.floor(isl.y - down) || y > Math.ceil(isl.y + up)) continue;
    const dx = x - isl.x, dz = z - isl.z;
    const edgeAmp = isl.radius * 0.14;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > isl.radius + edgeAmp + 1) continue;
    const edgeBoost = noise2(NP_EDGE, x, z, seed) * edgeAmp;
    const hillShift = noise2(NP_HILLS, x, z, seed) * Math.max(4, isl.radius * 0.16);
    const lim = surfLimit(isl, y - isl.y, hillShift, edgeBoost);
    if (!(lim > 0 && dist <= lim)) continue;
    if (isl.tunnels && Math.abs(y - isl.y) < isl.radius * 0.5) {
      const a = noise3(NP_T1, x, y, z, seed), b = noise3(NP_T2, x, y, z, seed);
      if (a * a + b * b < TUNNEL_R2) continue;
    }
    return true;
  }
  return false;
}

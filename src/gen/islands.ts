// Rozmístění a tvary ostrovů — port mapgen.lua (island_for_cell,
// island_profile, y_extents). Čísla musí sedět se seedem přesně (golden test).

import { BIOMES, BIOME_COUNT, type Biome } from './biomes';
import { hash2d, nexth, unit } from './lcg';

export type IslandShape = 'avatar' | 'disc' | 'cone' | 'mesa' | 'spire';

export const ISLAND_LAYER_MIN = 140;
export const ISLAND_LAYER_MAX = 760;
export const CLOUD_FLOOR = -500;
export const CLOUD_CEIL = 1500;
export const ISLAND_GRID = 340;
export const RADIUS_MIN = 72;
export const RADIUS_MAX = 165;
export const ISLAND_DENSITY = 82;
export const TUNNEL_MIN_R = 36;
export const TUNNEL_CHANCE = 55;
export const TUNNEL_R2 = 0.055;
export const HILL_AMP_MAX = 42;

export const HOME = { x: 0, y: 320, z: 0, radius: 190, heightScale: 1.0, capFrac: 0.6, tailFrac: 0.6 } as const;

export interface Island {
  cx: number; cz: number;
  x: number; y: number; z: number;
  radius: number;
  biomeIdx: number;
  biome: Biome;
  shape: IslandShape;
  heightScale: number;
  capFrac: number;
  tailFrac: number;
  tunnels: boolean;
}

export function islandForCell(cx: number, cz: number, seed: number): Island | null {
  if (cx === 0 && cz === 0) {
    const hidx = Math.floor(unit(nexth(hash2d(777, 333, seed))) * BIOME_COUNT);
    const b = BIOMES[hidx] ?? BIOMES[0];
    return {
      cx, cz, x: HOME.x, y: HOME.y, z: HOME.z, radius: HOME.radius,
      biomeIdx: hidx, biome: b, shape: 'avatar',
      heightScale: HOME.heightScale, capFrac: HOME.capFrac, tailFrac: HOME.tailFrac, tunnels: false,
    };
  }

  let h = hash2d(cx, cz, seed);
  if (unit(h) * 100 >= ISLAND_DENSITY) return null;
  h = nexth(h);

  const frac = unit(h);
  const radius = Math.floor(RADIUS_MIN + Math.pow(frac, 1.2) * (RADIUS_MAX - RADIUS_MIN));
  h = nexth(h);

  const biomeIdx = Math.floor(unit(h) * BIOME_COUNT);
  h = nexth(h);
  const biome = BIOMES[biomeIdx];
  if (!biome) return null;

  const pad = Math.min(radius, Math.floor(ISLAND_GRID / 2) - 4);
  const span = Math.max(1, ISLAND_GRID - 2 * pad);
  const x = cx * ISLAND_GRID + pad + Math.floor(unit(h) * span); h = nexth(h);
  const z = cz * ISLAND_GRID + pad + Math.floor(unit(h) * span); h = nexth(h);

  const y = ISLAND_LAYER_MIN + Math.floor(unit(h) * (ISLAND_LAYER_MAX - ISLAND_LAYER_MIN));
  h = nexth(h);

  const heightScale = 0.7 + unit(h) * 0.7; h = nexth(h);
  const capFrac = 0.45 + unit(h) * 0.5; h = nexth(h);
  const tailFrac = 0.40 + unit(h) * 0.6; h = nexth(h);
  const tunnels = radius >= TUNNEL_MIN_R && unit(h) * 100 < TUNNEL_CHANCE;

  return { cx, cz, x, y, z, radius, biomeIdx, biome, shape: biome.shape, heightScale, capFrac, tailFrac, tunnels };
}

/** Horizontální poloměr masivu ve výšce yRel nad středem ostrova */
export function islandProfile(isl: Island, yRel: number): number {
  const r = isl.radius, hs = isl.heightScale;
  switch (isl.shape) {
    case 'avatar': {
      if (yRel >= 0) {
        const capH = r * isl.capFrac * hs;
        if (capH <= 0) return 0;
        return r * Math.max(0, 1 - (yRel / capH) ** 2);
      }
      const tail = r * isl.tailFrac;
      if (tail <= 0) return 0;
      return r * Math.exp(yRel / tail);
    }
    case 'disc': {
      const halfH = Math.max(r * 0.12 * hs, 3);
      return r * Math.max(0, 1 - Math.abs(yRel) / halfH);
    }
    case 'cone': {
      if (yRel >= 0) return r * Math.max(0, 1 - yRel / Math.max(r * hs, 1));
      return r * Math.max(0, 1 - Math.abs(yRel) / Math.max(r * 0.6 * hs, 1));
    }
    case 'mesa': {
      const topH = r * 0.30 * hs;
      if (yRel >= 0) {
        if (yRel <= topH) return r;
        return r * Math.max(0, 1 - (yRel - topH) / Math.max(r * 0.25, 1));
      }
      return r * Math.max(0.15, 1 - Math.abs(yRel) / Math.max(r * 1.1, 1));
    }
    case 'spire': {
      const peakH = Math.max(r * 1.15 * hs, 1);
      if (yRel >= 0) return r * Math.max(0, 1 - yRel / peakH);
      return r * Math.max(0.1, 1 - Math.abs(yRel) / Math.max(r * 0.8, 1));
    }
  }
}

/** Vertikální rozsah masivu [nahoru, dolů] od středu, včetně rezervy na kopce */
export function yExtents(isl: Island): [number, number] {
  const r = isl.radius, hs = isl.heightScale;
  let up: number, down: number;
  switch (isl.shape) {
    case 'spire': up = r * 1.6 * hs; down = r * 0.9; break;
    case 'cone': up = r * 1.1 * hs; down = r * 0.7 * hs; break;
    case 'mesa': up = r * 0.5; down = r * 1.2; break;
    case 'disc': up = r * 0.4; down = r * 0.4; break;
    default: up = r * isl.capFrac * hs + 8; down = r * isl.tailFrac + 4;
  }
  return [up + HILL_AMP_MAX, down];
}

// Cache buněk — island_for_cell je čistá funkce (cx, cz, seed)
const cellCache = new Map<string, Island | null>();
export function cachedIsland(cx: number, cz: number, seed: number): Island | null {
  const k = `${seed}:${cx}:${cz}`;
  let v = cellCache.get(k);
  if (v === undefined) {
    v = islandForCell(cx, cz, seed);
    if (cellCache.size > 4096) cellCache.clear();
    cellCache.set(k, v);
  }
  return v;
}

/** Ostrovy, jejichž obálka zasahuje do AABB (mapgen.lua get_islands_for_chunk) */
export function islandsTouching(
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, seed: number,
  out: Island[] = [],
): Island[] {
  out.length = 0;
  const margin = RADIUS_MAX * 1.4;
  const cx0 = Math.floor((minX - margin) / ISLAND_GRID), cx1 = Math.floor((maxX + margin) / ISLAND_GRID);
  const cz0 = Math.floor((minZ - margin) / ISLAND_GRID), cz1 = Math.floor((maxZ + margin) / ISLAND_GRID);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const isl = cachedIsland(cx, cz, seed);
      if (!isl) continue;
      const rExt = isl.radius * 1.2;
      const [up, down] = yExtents(isl);
      if (isl.x + rExt >= minX && isl.x - rExt <= maxX && isl.z + rExt >= minZ && isl.z - rExt <= maxZ
        && isl.y + up >= minY && isl.y - down <= maxY) out.push(isl);
    }
  }
  return out;
}

/** Spawn kus vedle ostrova, s výhledem na něj (mapgen.lua frame_spawn) */
export function frameSpawn(isl: Island, fromX?: number, fromZ?: number): { x: number; y: number; z: number; yaw: number } {
  let dx = (fromX ?? isl.x) - isl.x;
  let dz = (fromZ ?? isl.z + 1) - isl.z;
  let d = Math.hypot(dx, dz);
  if (d < 1) { dx = 0; dz = 1; d = 1; }
  dx /= d; dz /= d;
  const dist = isl.radius + 90;
  const surf = isl.y + isl.radius * 0.55;
  // yaw v naší konvenci: 0 = +Z, kladně k +X; díváme se zpátky na ostrov
  return {
    x: Math.floor(isl.x + dx * dist), y: Math.floor(surf + 18), z: Math.floor(isl.z + dz * dist),
    yaw: Math.atan2(-dx, -dz),
  };
}

/** Nejbližší ostrov daného biomu (mapgen.lua nearest_island_of_biome) */
export function nearestIslandOfBiome(x: number, z: number, biome: string, seed: number, maxCells = 12): { isl: Island; dist: number } | null {
  const ccx = Math.floor(x / ISLAND_GRID), ccz = Math.floor(z / ISLAND_GRID);
  let best: Island | null = null, bestd = Infinity;
  for (let dcx = -maxCells; dcx <= maxCells; dcx++) for (let dcz = -maxCells; dcz <= maxCells; dcz++) {
    const isl = cachedIsland(ccx + dcx, ccz + dcz, seed);
    if (!isl || isl.biome.name !== biome) continue;
    const d = Math.hypot(isl.x - x, isl.z - z);
    if (d < bestd) { bestd = d; best = isl; }
  }
  return best ? { isl: best, dist: bestd } : null;
}

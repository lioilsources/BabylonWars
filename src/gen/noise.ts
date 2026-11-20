// Vlastní value noise (2D/3D, oktávy). Záměrně NE port src/noise.cpp z Luanti
// (LGPL) — kopce a pobřeží se proto v detailu liší, rozmístění ostrovů ne.

export interface NoiseParams {
  offset: number; scale: number;
  spread: [number, number, number];
  seed: number; octaves: number; persistence: number; lacunarity: number;
}

// mapgen.lua:55–62
export const NP_HILLS: NoiseParams = { offset: 0, scale: 1, spread: [56, 56, 56], seed: 4771, octaves: 3, persistence: 0.5, lacunarity: 2 };
export const NP_EDGE: NoiseParams = { offset: 0, scale: 1, spread: [34, 34, 34], seed: 9123, octaves: 2, persistence: 0.5, lacunarity: 2 };
export const NP_T1: NoiseParams = { offset: 0, scale: 1, spread: [30, 26, 30], seed: 2207, octaves: 2, persistence: 0.5, lacunarity: 2 };
export const NP_T2: NoiseParams = { offset: 0, scale: 1, spread: [30, 26, 30], seed: 8842, octaves: 2, persistence: 0.5, lacunarity: 2 };

// Celočíselný hash mřížkového bodu → [-1, 1]
function lattice2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(seed, 0x6c8e9cf5);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h & 0xffffff) / 8388607.5 - 1;
}
function lattice3(x: number, y: number, z: number, seed: number): number {
  return lattice2(x ^ Math.imul(y, 0x5bd1e995), z, seed);
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

function value2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = fade(x - x0), tz = fade(z - z0);
  const a = lattice2(x0, z0, seed), b = lattice2(x0 + 1, z0, seed);
  const c = lattice2(x0, z0 + 1, seed), d = lattice2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * tx, cd = c + (d - c) * tx;
  return ab + (cd - ab) * tz;
}

function value3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const tx = fade(x - x0), ty = fade(y - y0), tz = fade(z - z0);
  const l = (dx: number, dy: number, dz: number): number => lattice3(x0 + dx, y0 + dy, z0 + dz, seed);
  const x00 = l(0, 0, 0) + (l(1, 0, 0) - l(0, 0, 0)) * tx;
  const x10 = l(0, 1, 0) + (l(1, 1, 0) - l(0, 1, 0)) * tx;
  const x01 = l(0, 0, 1) + (l(1, 0, 1) - l(0, 0, 1)) * tx;
  const x11 = l(0, 1, 1) + (l(1, 1, 1) - l(0, 1, 1)) * tx;
  const y0v = x00 + (x10 - x00) * ty, y1v = x01 + (x11 - x01) * ty;
  return y0v + (y1v - y0v) * tz;
}

export function noise2(np: NoiseParams, x: number, z: number, worldSeed: number): number {
  let f = 1, g = 1, sum = 0;
  const seed = (np.seed + worldSeed) | 0;
  for (let o = 0; o < np.octaves; o++) {
    sum += g * value2(x / np.spread[0] * f, z / np.spread[2] * f, seed + o * 131);
    f *= np.lacunarity; g *= np.persistence;
  }
  return np.offset + np.scale * sum;
}

export function noise3(np: NoiseParams, x: number, y: number, z: number, worldSeed: number): number {
  let f = 1, g = 1, sum = 0;
  const seed = (np.seed + worldSeed) | 0;
  for (let o = 0; o < np.octaves; o++) {
    sum += g * value3(x / np.spread[0] * f, y / np.spread[1] * f, z / np.spread[2] * f, seed + o * 131);
    f *= np.lacunarity; g *= np.persistence;
  }
  return np.offset + np.scale * sum;
}

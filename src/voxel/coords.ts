// Chunk 32³; objem pro generátor/mesher má lem 1 → 34³.
export const CHUNK = 32;
export const VOL = CHUNK + 2;
export const VOL_SIZE = VOL * VOL * VOL;

/** Index do objemu VOL³ (i = x, j = y, k = z; 0 a VOL-1 jsou lem) */
export const volIndex = (i: number, j: number, k: number): number => (j * VOL + k) * VOL + i;

export interface ChunkKey { cx: number; cy: number; cz: number; lod: number }
export const keyStr = (cx: number, cy: number, cz: number, lod: number): string => `${lod}:${cx}:${cy}:${cz}`;

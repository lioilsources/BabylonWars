// Zprávy main thread ↔ chunk worker (jen transferable ArrayBuffery, žádný SAB)
export interface ChunkJob {
  type: 'job';
  id: number;
  cx: number; cy: number; cz: number; lod: number;
  seed: number;
}

export interface ChunkResult {
  type: 'result';
  id: number;
  empty: boolean;
  positions?: Float32Array;
  colors?: Float32Array;
  indices?: Uint32Array;
  quads: number;
  ms: number;
}

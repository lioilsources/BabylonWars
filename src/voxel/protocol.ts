// Zprávy main thread ↔ chunk worker (jen transferable ArrayBuffery, žádný SAB)
import type { PassMesh } from './mesher';

export interface ChunkJob {
  type: 'job';
  id: number;
  cx: number; cy: number; cz: number; lod: number;
  seed: number;
  /** editace hráče v objemu chunku vč. lemu: dvojice [volIndex, id]… (na mřížce LOD) */
  edits?: Int32Array;
}

export interface ChunkResult {
  type: 'result';
  id: number;
  empty: boolean;
  passes: (PassMesh | null)[];
  /** id nodů vnitřku chunku (jen LOD 0) pro dotazy simulace a ničení terénu */
  nodes?: Uint16Array;
  quads: number;
  ms: number;
}

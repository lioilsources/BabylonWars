// Chunk worker: job (cx,cy,cz,lod,seed) → mesh. Čistá funkce, bez sousedů.
import { generateChunk } from '../gen/generator';
import { VOL_SIZE } from '../voxel/coords';
import { meshChunk } from '../voxel/mesher';
import type { ChunkJob, ChunkResult } from '../voxel/protocol';

const vol = new Uint8Array(VOL_SIZE);

self.onmessage = (ev: MessageEvent<ChunkJob>) => {
  const job = ev.data;
  const t0 = performance.now();
  const filled = generateChunk(vol, job.cx, job.cy, job.cz, job.lod, job.seed);
  if (filled === 0) {
    const res: ChunkResult = { type: 'result', id: job.id, empty: true, quads: 0, ms: performance.now() - t0 };
    postMessage(res);
    return;
  }
  const m = meshChunk(vol, 1 << job.lod);
  const res: ChunkResult = {
    type: 'result', id: job.id, empty: m.quads === 0, quads: m.quads,
    positions: m.positions, colors: m.colors, indices: m.indices, ms: performance.now() - t0,
  };
  postMessage(res, { transfer: [m.positions.buffer, m.colors.buffer, m.indices.buffer] });
};

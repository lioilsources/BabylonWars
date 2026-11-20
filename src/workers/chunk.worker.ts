// Chunk worker: job (cx,cy,cz,lod,seed,edits) → mesh. Čistá funkce, bez sousedů.
import { generateChunk } from '../gen/generator';
import { VOL, VOL_SIZE } from '../voxel/coords';
import { meshChunk } from '../voxel/mesher';
import type { ChunkJob, ChunkResult } from '../voxel/protocol';

const vol = new Uint16Array(VOL_SIZE);
const top = new Int32Array(VOL * VOL);

self.onmessage = (ev: MessageEvent<ChunkJob>) => {
  const job = ev.data;
  const t0 = performance.now();
  const s = 1 << job.lod;
  let filled = generateChunk(vol, job.cx, job.cy, job.cz, job.lod, job.seed, top);
  if (job.edits) {
    for (let i = 0; i < job.edits.length; i += 2) vol[job.edits[i]] = job.edits[i + 1];
    filled += job.edits.length; // i jen editace může chunk zaplnit
  }
  const empty = (): void => {
    const res: ChunkResult = { type: 'result', id: job.id, empty: true, passes: [], quads: 0, ms: performance.now() - t0 };
    postMessage(res);
  };
  if (filled === 0) { empty(); return; }
  const m = meshChunk(vol, { scale: s, originY: job.cy * 32 * s - s, top });
  if (m.quads === 0 && !m.solidBits?.some((w) => w !== 0)) { empty(); return; }
  const res: ChunkResult = {
    type: 'result', id: job.id, empty: false, quads: m.quads, passes: m.passes, solidBits: m.solidBits,
    ms: performance.now() - t0,
  };
  const transfer: ArrayBuffer[] = [];
  for (const p of m.passes) if (p) transfer.push(p.positions.buffer as ArrayBuffer, p.data.buffer as ArrayBuffer, p.indices.buffer as ArrayBuffer);
  if (m.solidBits) transfer.push(m.solidBits.buffer as ArrayBuffer);
  postMessage(res, { transfer });
};

// Editace hráče (výbuchy, tunely) — jen v paměti (v1). Klíčem je LOD-0 chunk.
import { CHUNK, VOL, keyStr, volIndex } from './coords';

const fl = Math.floor;

export class EditStore {
  private chunks = new Map<string, Map<number, number>>();

  /** id nodu v (x,y,z), nebo undefined, když tu hráč nic neměnil */
  get(x: number, y: number, z: number): number | undefined {
    const m = this.chunks.get(keyStr(fl(x / CHUNK), fl(y / CHUNK), fl(z / CHUNK), 0));
    return m?.get(localIndex(x, y, z));
  }

  /** Zapíše dávku [x,y,z,id,…]; vrátí klíče dotčených LOD-0 chunků (i sousedů na hraně) */
  setNodes(batch: ArrayLike<number>): Set<string> {
    const dirty = new Set<string>();
    for (let i = 0; i + 3 < batch.length; i += 4) {
      const x = batch[i], y = batch[i + 1], z = batch[i + 2], id = batch[i + 3];
      const cx = fl(x / CHUNK), cy = fl(y / CHUNK), cz = fl(z / CHUNK);
      const k = keyStr(cx, cy, cz, 0);
      let m = this.chunks.get(k);
      if (!m) { m = new Map(); this.chunks.set(k, m); }
      m.set(localIndex(x, y, z), id);
      // sousedé, kterým node leží v lemu
      const lx = x - cx * CHUNK, ly = y - cy * CHUNK, lz = z - cz * CHUNK;
      for (const ox of lx === 0 ? [-1, 0] : lx === CHUNK - 1 ? [0, 1] : [0])
        for (const oy of ly === 0 ? [-1, 0] : ly === CHUNK - 1 ? [0, 1] : [0])
          for (const oz of lz === 0 ? [-1, 0] : lz === CHUNK - 1 ? [0, 1] : [0])
            dirty.add(keyStr(cx + ox, cy + oy, cz + oz, 0));
    }
    return dirty;
  }

  /**
   * Editace pro objem chunku vč. lemu jako dvojice [volIndex, id]. Chunk LOD L
   * vzorkuje svět po s = 2^L blocích (generator.ts) — bere jen editace, které
   * leží na jeho mřížce, takže díra je vidět i z dálky (zhruba).
   */
  collect(cx: number, cy: number, cz: number, lod = 0): Int32Array | undefined {
    const s = 1 << lod, size = CHUNK * s;
    const ox = cx * size - s, oy = cy * size - s, oz = cz * size - s;
    const maxW = (VOL - 1) * s;
    const out: number[] = [];
    for (let kx = fl(ox / CHUNK); kx <= fl((ox + maxW) / CHUNK); kx++)
      for (let ky = fl(oy / CHUNK); ky <= fl((oy + maxW) / CHUNK); ky++)
        for (let kz = fl(oz / CHUNK); kz <= fl((oz + maxW) / CHUNK); kz++) {
          const m = this.chunks.get(keyStr(kx, ky, kz, 0));
          if (!m) continue;
          for (const [li, id] of m) {
            const x = kx * CHUNK + li % CHUNK - ox, z = kz * CHUNK + fl(li / CHUNK) % CHUNK - oz, y = ky * CHUNK + fl(li / (CHUNK * CHUNK)) - oy;
            if (x % s || y % s || z % s) continue;
            const i = x / s, j = y / s, k = z / s;
            if (i < 0 || j < 0 || k < 0 || i >= VOL || j >= VOL || k >= VOL) continue;
            out.push(volIndex(i, j, k), id);
          }
        }
    return out.length ? Int32Array.from(out) : undefined;
  }

  get size(): number { let n = 0; for (const m of this.chunks.values()) n += m.size; return n; }
}

function localIndex(x: number, y: number, z: number): number {
  const lx = x - fl(x / CHUNK) * CHUNK, ly = y - fl(y / CHUNK) * CHUNK, lz = z - fl(z / CHUNK) * CHUNK;
  return (ly * CHUNK + lz) * CHUNK + lx;
}

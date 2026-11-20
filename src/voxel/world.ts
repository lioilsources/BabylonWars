// Dotazy na svět pro simulaci: editace → načtené bity chunku → generátor.
// Čisté (bez Babylonu), takže jde i do testů a později na server.
import { solidAtWorld } from '../gen/generator';
import { CHUNK, keyStr } from './coords';
import { EditStore } from './edits';
import { NODE_WALKABLE } from './registry';

const fl = Math.floor;

export class VoxelWorld {
  readonly edits = new EditStore();
  private bits = new Map<string, Uint32Array>();
  readonly isSolid: (x: number, y: number, z: number) => boolean;

  constructor(readonly seed: number) {
    this.isSolid = (x, y, z) => this.solidAt(x, y, z);
  }

  setBits(cx: number, cy: number, cz: number, bits: Uint32Array | undefined): void {
    const k = keyStr(cx, cy, cz, 0);
    if (bits) this.bits.set(k, bits); else this.bits.delete(k);
  }

  dropBits(cx: number, cy: number, cz: number): void { this.bits.delete(keyStr(cx, cy, cz, 0)); }

  solidAt(x: number, y: number, z: number): boolean {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    const e = this.edits.get(x, y, z);
    if (e !== undefined) return NODE_WALKABLE[e] === 1;
    const cx = fl(x / CHUNK), cy = fl(y / CHUNK), cz = fl(z / CHUNK);
    const b = this.bits.get(keyStr(cx, cy, cz, 0));
    if (b) {
      const idx = ((y - cy * CHUNK) * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK);
      return (b[idx >>> 5] & (1 << (idx & 31))) !== 0;
    }
    return solidAtWorld(x, y, z, this.seed);
  }

  /** Zapíše dávku [x,y,z,id,…], vrátí dotčené LOD-0 chunky k přestavbě */
  setNodes(batch: ArrayLike<number>): Set<string> { return this.edits.setNodes(batch); }

  get loadedChunks(): number { return this.bits.size; }
}

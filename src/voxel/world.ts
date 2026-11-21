// Dotazy na svět pro simulaci: editace → načtené bity chunku → generátor.
// Čisté (bez Babylonu), takže jde i do testů a později na server.
import { solidAtWorld } from '../gen/generator';
import { CHUNK, keyStr } from './coords';
import { EditStore } from './edits';
import { AIR, NODE_WALKABLE, nodeId } from './registry';

const fl = Math.floor;
const STONE = nodeId('dw_nodes:stone');

export class VoxelWorld {
  readonly edits = new EditStore();
  /** id nodů načtených LOD-0 chunků (CHUNK³, index (ly·C + lz)·C + lx) */
  private nodes = new Map<string, Uint16Array>();
  readonly isSolid: (x: number, y: number, z: number) => boolean;

  constructor(readonly seed: number) {
    this.isSolid = (x, y, z) => this.solidAt(x, y, z);
  }

  setChunkNodes(cx: number, cy: number, cz: number, nodes: Uint16Array | undefined): void {
    const k = keyStr(cx, cy, cz, 0);
    if (nodes) this.nodes.set(k, nodes); else this.nodes.delete(k);
  }

  dropChunk(cx: number, cy: number, cz: number): void { this.nodes.delete(keyStr(cx, cy, cz, 0)); }

  /** id nodu: editace → načtený chunk → generátor (ten zná jen pevné/vzduch → kámen) */
  nodeAt(x: number, y: number, z: number): number {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    const e = this.edits.get(x, y, z);
    if (e !== undefined) return e;
    const cx = fl(x / CHUNK), cy = fl(y / CHUNK), cz = fl(z / CHUNK);
    const n = this.nodes.get(keyStr(cx, cy, cz, 0));
    if (n) return n[((y - cy * CHUNK) * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)];
    return solidAtWorld(x, y, z, this.seed) ? STONE : AIR;
  }

  solidAt(x: number, y: number, z: number): boolean {
    return NODE_WALKABLE[this.nodeAt(x, y, z)] === 1;
  }

  /** Zapíše dávku [x,y,z,id,…], vrátí dotčené LOD-0 chunky k přestavbě */
  setNodes(batch: ArrayLike<number>): Set<string> { return this.edits.setNodes(batch); }

  get loadedChunks(): number { return this.nodes.size; }
}

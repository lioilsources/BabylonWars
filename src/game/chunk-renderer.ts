// Stream chunků kolem hráče: strom LOD (voxel = 2^lod bloků), worker pool,
// max N nahrání meshe za frame. Starý mesh zmizí, až je hotová náhrada,
// takže při přepnutí LOD nevznikají díry.

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import { islandsTouching, type Island } from '../gen/islands';
import { FEATURE_PAD } from '../gen/features';
import { CHUNK, keyStr } from '../voxel/coords';
import type { PassMesh } from '../voxel/mesher';
import type { ChunkJob, ChunkResult } from '../voxel/protocol';
import type { VoxelWorld } from '../voxel/world';

export interface StreamSettings {
  /** Poloměr LOD 0 (bloky); LOD L končí na r0 · 2^L */
  r0: number;
  maxLod: number;
  uploadsPerFrame: number;
}

interface Node {
  key: string;
  cx: number; cy: number; cz: number; lod: number;
  state: 'queued' | 'running' | 'ready' | 'empty';
  meshes: Mesh[];
  quads: number;
  dist: number;
  /** po editaci: přestavět, starý mesh drž, dokud nedorazí nový */
  rebuild: boolean;
  /** běží job pro přestavbu (stav zůstává ready/empty) */
  rebuilding: boolean;
}

const tmpIsl: Island[] = [];

export class ChunkRenderer {
  private nodes = new Map<string, Node>();
  private desired = new Set<string>();
  private queue: Node[] = [];
  private results: ChunkResult[] = [];
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private byJob = new Map<number, Node>();
  private nextJob = 1;
  private lastUpdate = { x: Infinity, y: Infinity, z: Infinity };
  dirty = true;

  stats = { meshes: 0, quads: 0, queued: 0, running: 0, jobMs: 0, uploadMs: 0 };

  constructor(private scene: Scene, private materials: Material[], private world: VoxelWorld, public settings: StreamSettings) {
    const n = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 4));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../workers/chunk.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<ChunkResult>) => { this.results.push(ev.data); this.idle.push(w); this.pump(); };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  get viewDistance(): number { return this.settings.r0 * (1 << this.settings.maxLod); }

  /** Volat každý frame s pozicí kamery */
  update(px: number, py: number, pz: number): void {
    const lu = this.lastUpdate;
    if (this.dirty || Math.abs(px - lu.x) + Math.abs(py - lu.y) + Math.abs(pz - lu.z) > 6) {
      lu.x = px; lu.y = py; lu.z = pz;
      this.dirty = false;
      this.select(px, py, pz);
    }
    this.pump();
    this.applyResults();
  }

  private select(px: number, py: number, pz: number): void {
    const { r0, maxLod } = this.settings;
    const desired = new Set<string>();
    const top = CHUNK << maxLod;
    const R = r0 * (1 << maxLod);
    const x0 = Math.floor((px - R) / top), x1 = Math.floor((px + R) / top);
    const y0 = Math.floor((py - R) / top), y1 = Math.floor((py + R) / top);
    const z0 = Math.floor((pz - R) / top), z1 = Math.floor((pz + R) / top);

    const visit = (cx: number, cy: number, cz: number, lod: number, top: boolean): void => {
      const size = CHUNK << lod;
      const minX = cx * size, minY = cy * size, minZ = cz * size;
      const dist = aabbDist(px, py, pz, minX, minY, minZ, size);
      // dosah se ořezává jen na nejvyšší úrovni; potomek rozděleného uzlu
      // musí svou část pokrýt vždy (jinak vznikne díra na přechodu LOD)
      if (top && dist > r0 * (1 << lod)) return;
      // rezerva: dekorace (sopka, rampouchy) přesahují obálku ostrova
      const P = FEATURE_PAD + 1;
      if (islandsTouching(minX - P, minY - P, minZ - P, minX + size + P, minY + size + P, minZ + size + P, this.world.seed, tmpIsl).length === 0) return;
      if (lod > 0 && dist < r0 * (1 << (lod - 1))) {
        for (let i = 0; i < 8; i++) visit(cx * 2 + (i & 1), cy * 2 + ((i >> 1) & 1), cz * 2 + ((i >> 2) & 1), lod - 1, false);
        return;
      }
      const key = keyStr(cx, cy, cz, lod);
      desired.add(key);
      let n = this.nodes.get(key);
      if (!n) {
        n = { key, cx, cy, cz, lod, state: 'queued', meshes: [], quads: 0, dist, rebuild: false, rebuilding: false };
        this.nodes.set(key, n);
        this.queue.push(n);
      }
      n.dist = dist;
    };
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (let cz = z0; cz <= z1; cz++) visit(cx, cy, cz, maxLod, true);
    this.desired = desired;

    // fronta: jen žádané; přestavby po editaci první, pak blízké a hrubé
    this.queue = this.queue.filter((n) => desired.has(n.key) && (n.state === 'queued' || n.rebuild));
    const prio = (n: Node): number => (n.rebuild ? -1e9 : 0) + n.dist / (1 << n.lod);
    this.queue.sort((a, b) => prio(a) - prio(b));
    this.prune();
  }

  /** Uvolni nežádané uzly, jakmile je jejich oblast pokrytá hotovými náhradami */
  private prune(): void {
    const pendingUnder = new Map<string, number>();
    const hasDesc = new Set<string>();
    for (const k of this.desired) {
      const n = this.nodes.get(k)!;
      const done = n.state === 'ready' || n.state === 'empty';
      let { cx, cy, cz } = n;
      for (let l = n.lod + 1; l <= this.settings.maxLod; l++) {
        cx = Math.floor(cx / 2); cy = Math.floor(cy / 2); cz = Math.floor(cz / 2);
        const ak = keyStr(cx, cy, cz, l);
        hasDesc.add(ak);
        if (!done) pendingUnder.set(ak, (pendingUnder.get(ak) ?? 0) + 1);
      }
    }
    for (const [k, n] of this.nodes) {
      if (this.desired.has(k)) continue;
      if (n.state === 'queued' || n.state === 'running') {
        if (n.state === 'queued') this.nodes.delete(k);
        continue; // běžící job dojede a zahodí se v applyResults
      }
      let remove: boolean;
      if (hasDesc.has(k)) {
        remove = (pendingUnder.get(k) ?? 0) === 0;
      } else {
        // hledej žádaného předka
        let { cx, cy, cz } = n;
        let anc: Node | undefined;
        for (let l = n.lod + 1; l <= this.settings.maxLod && !anc; l++) {
          cx = Math.floor(cx / 2); cy = Math.floor(cy / 2); cz = Math.floor(cz / 2);
          const ak = keyStr(cx, cy, cz, l);
          if (this.desired.has(ak)) anc = this.nodes.get(ak);
        }
        remove = !anc || anc.state === 'ready' || anc.state === 'empty';
      }
      if (remove) this.dispose(n);
    }
  }

  private dispose(n: Node): void {
    this.dropMeshes(n);
    if (n.lod === 0) this.world.dropChunk(n.cx, n.cy, n.cz);
    this.nodes.delete(n.key);
  }

  private dropMeshes(n: Node): void {
    for (const m of n.meshes) m.dispose();
    this.stats.meshes -= n.meshes.length; this.stats.quads -= n.quads;
    n.meshes = []; n.quads = 0;
  }

  /** Po world.setNodes: přestav dotčené LOD-0 chunky (nenačtené se přeskočí) */
  /** Editace (klíče LOD-0 chunků) → přestavět i hrubší chunky, které je obsahují */
  invalidate(keys: Iterable<string>): void {
    const all = new Set<string>();
    for (const k of keys) {
      all.add(k);
      const [, x, y, z] = k.split(':').map(Number);
      for (let l = 1; l <= this.settings.maxLod; l++) all.add(keyStr(x >> l, y >> l, z >> l, l));
    }
    for (const k of all) {
      const n = this.nodes.get(k);
      if (!n) continue;
      if (n.state === 'queued') continue;           // job ještě nevyrazil → vezme nové editace
      n.rebuild = true;
      if (!this.queue.includes(n)) this.queue.unshift(n);
    }
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const n = this.queue.shift()!;
      if (!this.desired.has(n.key)) continue;
      if (n.rebuild) {
        if (n.rebuilding || n.state === 'running') continue; // dojede a pak znovu
        n.rebuild = false; n.rebuilding = true;
      } else if (n.state !== 'queued') continue;
      else n.state = 'running';
      const w = this.idle.pop()!;
      const id = this.nextJob++;
      this.byJob.set(id, n);
      const edits = this.world.edits.collect(n.cx, n.cy, n.cz, n.lod);
      const job: ChunkJob = { type: 'job', id, cx: n.cx, cy: n.cy, cz: n.cz, lod: n.lod, seed: this.world.seed, edits };
      w.postMessage(job, edits ? { transfer: [edits.buffer] } : undefined);
    }
    this.stats.queued = this.queue.length;
    this.stats.running = this.workers.length - this.idle.length;
  }

  private applyResults(): void {
    let uploads = 0, changed = false;
    while (this.results.length) {
      const r = this.results[0];
      const n = this.byJob.get(r.id);
      if (!n) { this.results.shift(); continue; }
      if (!r.empty && uploads >= this.settings.uploadsPerFrame) break;
      this.results.shift();
      this.byJob.delete(r.id);
      this.stats.jobMs = this.stats.jobMs * 0.9 + r.ms * 0.1;
      if (this.nodes.get(n.key) !== n) continue; // mezitím zahozen
      changed = true;
      n.rebuilding = false;
      if (n.rebuild && !this.queue.includes(n)) this.queue.unshift(n); // další editace mezitím
      const t0 = performance.now();
      this.dropMeshes(n);
      if (n.lod === 0) this.world.setChunkNodes(n.cx, n.cy, n.cz, r.nodes);
      if (r.empty) { n.state = 'empty'; continue; }
      uploads++;
      r.passes.forEach((p, i) => { if (p) n.meshes.push(this.buildMesh(n, p, i)); });
      n.quads = r.quads;
      n.state = 'ready';
      this.stats.meshes += n.meshes.length; this.stats.quads += r.quads;
      this.stats.uploadMs = Math.max(this.stats.uploadMs, performance.now() - t0);
    }
    if (changed) this.prune();
  }

  private buildMesh(n: Node, p: PassMesh, pass: number): Mesh {
    const size = CHUNK << n.lod;
    const m = new Mesh(n.key, this.scene);
    m.setVerticesData(VertexBuffer.PositionKind, p.positions, false, 3);
    m.setVerticesData('data', p.data, false, 4);
    m.setIndices(p.indices);
    // node (x,y,z) zabírá [x−0.5, x+0.5] jako v Luanti; voxel 0 objemu je lem (−s)
    m.position.set(n.cx * size - 0.5, n.cy * size - 0.5, n.cz * size - 0.5);
    // nejhrubší chunky sahají za dohled — dostanou variantu s ořezem koulí
    // (předává hranici impostorům); bližší zůstávají bez discard
    m.material = this.materials[pass + (n.lod === this.settings.maxLod && this.materials.length > 3 ? 3 : 0)];
    m.isPickable = false;
    m.doNotSyncBoundingInfo = true;
    m.computeWorldMatrix(true);
    m.freezeWorldMatrix();
    return m;
  }

  /** Změna nastavení (poloměr, LOD) — přepočítá výběr */
  configure(s: Partial<StreamSettings>): void {
    Object.assign(this.settings, s);
    this.dirty = true;
  }
}

function aabbDist(px: number, py: number, pz: number, x: number, y: number, z: number, size: number): number {
  const dx = Math.max(x - px, 0, px - (x + size));
  const dy = Math.max(y - py, 0, py - (y + size));
  const dz = Math.max(z - pz, 0, pz - (z + size));
  return Math.hypot(dx, dy, dz);
}

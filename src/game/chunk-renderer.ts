// Stream chunků kolem hráče: strom LOD (voxel = 2^lod bloků), worker pool,
// max N nahrání meshe za frame. Starý mesh zmizí, až je hotová náhrada,
// takže při přepnutí LOD nevznikají díry.

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import { islandsTouching, type Island } from '../gen/islands';
import { CHUNK, keyStr } from '../voxel/coords';
import type { ChunkJob, ChunkResult } from '../voxel/protocol';

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
  mesh?: Mesh;
  quads: number;
  dist: number;
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

  stats = { meshes: 0, quads: 0, queued: 0, running: 0, jobMs: 0 };

  constructor(private scene: Scene, private material: Material, private seed: number, public settings: StreamSettings) {
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

    const visit = (cx: number, cy: number, cz: number, lod: number): void => {
      const size = CHUNK << lod;
      const minX = cx * size, minY = cy * size, minZ = cz * size;
      const dist = aabbDist(px, py, pz, minX, minY, minZ, size);
      if (dist > r0 * (1 << lod)) return;
      if (islandsTouching(minX, minY, minZ, minX + size, minY + size, minZ + size, this.seed, tmpIsl).length === 0) return;
      if (lod > 0 && dist < r0 * (1 << (lod - 1))) {
        for (let i = 0; i < 8; i++) visit(cx * 2 + (i & 1), cy * 2 + ((i >> 1) & 1), cz * 2 + ((i >> 2) & 1), lod - 1);
        return;
      }
      const key = keyStr(cx, cy, cz, lod);
      desired.add(key);
      let n = this.nodes.get(key);
      if (!n) {
        n = { key, cx, cy, cz, lod, state: 'queued', quads: 0, dist };
        this.nodes.set(key, n);
        this.queue.push(n);
      }
      n.dist = dist;
    };
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (let cz = z0; cz <= z1; cz++) visit(cx, cy, cz, maxLod);
    this.desired = desired;

    // fronta: jen žádané; blízké a hrubé napřed
    this.queue = this.queue.filter((n) => desired.has(n.key) && n.state === 'queued');
    for (const n of this.queue) n.dist = n.dist / (1 << n.lod);
    this.queue.sort((a, b) => a.dist - b.dist);
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
    if (n.mesh) { n.mesh.dispose(); this.stats.meshes--; this.stats.quads -= n.quads; }
    this.nodes.delete(n.key);
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const n = this.queue.shift()!;
      if (n.state !== 'queued' || !this.desired.has(n.key)) continue;
      const w = this.idle.pop()!;
      const id = this.nextJob++;
      n.state = 'running';
      this.byJob.set(id, n);
      const job: ChunkJob = { type: 'job', id, cx: n.cx, cy: n.cy, cz: n.cz, lod: n.lod, seed: this.seed };
      w.postMessage(job);
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
      if (r.empty || !r.positions) { n.state = 'empty'; continue; }
      uploads++;
      n.mesh = this.buildMesh(n, r);
      n.quads = r.quads;
      n.state = 'ready';
      this.stats.meshes++; this.stats.quads += r.quads;
    }
    if (changed) this.prune();
  }

  private buildMesh(n: Node, r: ChunkResult): Mesh {
    const size = CHUNK << n.lod;
    const m = new Mesh(n.key, this.scene);
    m.setVerticesData(VertexBuffer.PositionKind, r.positions!, false, 3);
    m.setVerticesData(VertexBuffer.ColorKind, r.colors!, false, 4);
    m.setIndices(r.indices!);
    m.position.set(n.cx * size, n.cy * size, n.cz * size);
    m.material = this.material;
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

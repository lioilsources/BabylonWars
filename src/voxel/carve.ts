// Ničení terénu — port weapons.lua carve_capsule. Kapsle = úsečka a→b
// nafouknutá o r (a == b → koule). Kapaliny zůstávají, co stálo na vykopaném
// nodu a nedrží samo (kytky, tráva), zmizí s ním. Sypké nody se nesypou —
// tekutiny ani písek v1 nesimulujeme.
import { AIR, NODE_DRAW, NODE_WALKABLE } from './registry';

export interface NodeAccess {
  nodeAt(x: number, y: number, z: number): number;
}

export interface CarveResult {
  /** dávka [x,y,z,id,…] pro VoxelWorld.setNodes */
  batch: number[];
  /** vykopané nody [x,y,z,id,…] (sutina, zvuk materiálu) */
  removed: number[];
}

const isLiquid = (id: number): boolean => NODE_DRAW[id] === 'liquid';
/** neprůchozí rostlinky apod. — v Luanti attached_node */
const isAttached = (id: number): boolean => id !== AIR && !NODE_WALKABLE[id] && !isLiquid(id);

export function carveCapsule(w: NodeAccess, ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  r: number, out: CarveResult = { batch: [], removed: [] }): CarveResult {
  const minx = Math.floor(Math.min(ax, bx) - r), maxx = Math.ceil(Math.max(ax, bx) + r);
  const miny = Math.floor(Math.min(ay, by) - r), maxy = Math.ceil(Math.max(ay, by) + r);
  const minz = Math.floor(Math.min(az, bz) - r), maxz = Math.ceil(Math.max(az, bz) + r);
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  const r2 = r * r;
  for (let z = minz; z <= maxz; z++) for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const px = x - ax, py = y - ay, pz = z - az;
    let t = 0;
    if (ab2 > 0) { t = (px * abx + py * aby + pz * abz) / ab2; t = t < 0 ? 0 : t > 1 ? 1 : t; }
    const ex = px - t * abx, ey = py - t * aby, ez = pz - t * abz;
    if (ex * ex + ey * ey + ez * ez > r2) continue;
    const id = w.nodeAt(x, y, z);
    if (id === AIR || isLiquid(id)) continue;
    out.batch.push(x, y, z, AIR);
    out.removed.push(x, y, z, id);
    // co leželo nahoře a nedrží samo, shoří s ním
    const above = w.nodeAt(x, y + 1, z);
    if (isAttached(above)) out.batch.push(x, y + 1, z, AIR);
  }
  return out;
}

/** Úsečková koule podél bodů (race.lua carve_batch): každý vzorek koule r */
export function carveAlong(w: NodeAccess, pts: ArrayLike<number>, r: number, out: CarveResult = { batch: [], removed: [] }): CarveResult {
  const seen = new Set<string>();
  const ri = Math.ceil(r), r2 = r * r;
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const sx = Math.round(pts[i]), sy = Math.round(pts[i + 1]), sz = Math.round(pts[i + 2]);
    for (let dz = -ri; dz <= ri; dz++) for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      const x = sx + dx, y = sy + dy, z = sz + dz;
      const k = `${x},${y},${z}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const id = w.nodeAt(x, y, z);
      if (id === AIR) continue;
      out.batch.push(x, y, z, AIR);
      out.removed.push(x, y, z, id);
    }
  }
  return out;
}

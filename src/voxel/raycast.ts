// Amanatides–Woo DDA nad mřížkou nodů. Node (x,y,z) zabírá [x−0.5, x+0.5]
// jako v Luanti, takže buňka bodu p = round(p).

export type SolidFn = (x: number, y: number, z: number) => boolean;

export interface RayHit {
  hit: boolean;
  x: number; y: number; z: number;      // zasažený node
  nx: number; ny: number; nz: number;   // normála plochy (směr ven z nodu)
  t: number;                            // vzdálenost podél paprsku
}

export const newHit = (): RayHit => ({ hit: false, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, t: 0 });

export function raycast(solid: SolidFn, ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number, maxDist: number, out: RayHit = newHit()): RayHit {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  // posun do prostoru, kde buňky začínají na celých číslech
  const px = ox + 0.5, py = oy + 0.5, pz = oz + 0.5;
  let x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0, sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
  let tmx = sx > 0 ? (x + 1 - px) * tdx : sx < 0 ? (px - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - py) * tdy : sy < 0 ? (py - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - pz) * tdz : sz < 0 ? (pz - z) * tdz : Infinity;
  let t = 0, nx = 0, ny = 0, nz = 0;
  out.hit = false;
  while (t <= maxDist) {
    if (solid(x, y, z)) {
      out.hit = true; out.x = x; out.y = y; out.z = z; out.nx = nx; out.ny = ny; out.nz = nz; out.t = t;
      return out;
    }
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  out.t = maxDist;
  return out;
}

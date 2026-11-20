// Tažená koule (kolize lodi): koule poloměru r se posouvá z `from` do `to`
// po krocích ≤ step; první dotyk s plným nodem vrátí poslední volnou pozici.
import type { SolidFn } from './raycast';

export interface SweepHit {
  hit: boolean;
  x: number; y: number; z: number;      // poslední volná pozice středu
  nx: number; ny: number; nz: number;   // normála odrazu (od překážky ke kouli)
  frac: number;                         // 0..1 podíl uražené dráhy
}

export const newSweep = (): SweepHit => ({ hit: false, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, frac: 1 });

/** Překrývá koule (cx,cy,cz,r) nějaký plný node? Zapíše normálu do out. */
export function sphereOverlaps(solid: SolidFn, cx: number, cy: number, cz: number, r: number, out?: SweepHit): boolean {
  const x0 = Math.round(cx - r), x1 = Math.round(cx + r);
  const y0 = Math.round(cy - r), y1 = Math.round(cy + r);
  const z0 = Math.round(cz - r), z1 = Math.round(cz + r);
  let best = Infinity;
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!solid(x, y, z)) continue;
    // nejbližší bod krychle [x±0.5] ke středu koule
    const qx = Math.max(x - 0.5, Math.min(cx, x + 0.5));
    const qy = Math.max(y - 0.5, Math.min(cy, y + 0.5));
    const qz = Math.max(z - 0.5, Math.min(cz, z + 0.5));
    const d2 = (cx - qx) ** 2 + (cy - qy) ** 2 + (cz - qz) ** 2;
    if (d2 < r * r && d2 < best) {
      best = d2;
      if (out) {
        const d = Math.sqrt(d2);
        if (d > 1e-6) { out.nx = (cx - qx) / d; out.ny = (cy - qy) / d; out.nz = (cz - qz) / d; }
        else { out.nx = 0; out.ny = 1; out.nz = 0; } // střed uvnitř nodu
      }
    }
  }
  return best < Infinity;
}

export function sweepSphere(solid: SolidFn, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number,
  r: number, step = 0.5, out: SweepHit = newSweep()): SweepHit {
  const dx = tx - fx, dy = ty - fy, dz = tz - fz;
  const dist = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.ceil(dist / step));
  out.hit = false; out.x = fx; out.y = fy; out.z = fz; out.frac = 1;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const x = fx + dx * f, y = fy + dy * f, z = fz + dz * f;
    if (sphereOverlaps(solid, x, y, z, r, out)) {
      out.hit = true; out.frac = (i - 1) / n;
      return out;
    }
    out.x = x; out.y = y; out.z = z;
  }
  return out;
}

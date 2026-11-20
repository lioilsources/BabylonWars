// Minimální vektorová matematika bez alokací v ticku.
// Konvence jako Babylon/Luanti: levotočivý systém, Y nahoru.
// Kvaternion q = (x, y, z, w), rotace vektoru v: q * v * conj(q).

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const quat = (x = 0, y = 0, z = 0, w = 1): Quat => ({ x, y, z, w });

export function v3set(o: Vec3, x: number, y: number, z: number): Vec3 {
  o.x = x; o.y = y; o.z = z; return o;
}
export function v3copy(o: Vec3, a: Vec3): Vec3 { o.x = a.x; o.y = a.y; o.z = a.z; return o; }
export const v3dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const v3len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export function v3normalize(o: Vec3, a: Vec3 = o): Vec3 {
  const l = v3len(a) || 1;
  o.x = a.x / l; o.y = a.y / l; o.z = a.z / l; return o;
}
export function v3cross(o: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  o.x = x; o.y = y; o.z = z; return o;
}
export function v3addScaled(o: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  o.x = a.x + b.x * s; o.y = a.y + b.y * s; o.z = a.z + b.z * s; return o;
}

export function qcopy(o: Quat, a: Quat): Quat { o.x = a.x; o.y = a.y; o.z = a.z; o.w = a.w; return o; }
export const qlen = (q: Quat): number => Math.hypot(q.x, q.y, q.z, q.w);
export function qnormalize(o: Quat, a: Quat = o): Quat {
  const l = qlen(a) || 1;
  o.x = a.x / l; o.y = a.y / l; o.z = a.z / l; o.w = a.w / l; return o;
}
export function qconj(o: Quat, a: Quat): Quat { o.x = -a.x; o.y = -a.y; o.z = -a.z; o.w = a.w; return o; }

/** o = a ⊗ b (nejdřív b, potom a) */
export function qmul(o: Quat, a: Quat, b: Quat): Quat {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  o.x = x; o.y = y; o.z = z; o.w = w; return o;
}

export function qfromAxisAngle(o: Quat, ax: number, ay: number, az: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  o.x = ax * s; o.y = ay * s; o.z = az * s; o.w = Math.cos(angle / 2); return o;
}

/** Rotace vektoru v kvaternionem q (o smí být v). */
export function qrotate(o: Vec3, q: Quat, v: Vec3): Vec3 {
  // t = 2 * cross(q.xyz, v); v' = v + w*t + cross(q.xyz, t)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  o.x = x; o.y = y; o.z = z; return o;
}

/** Rotace jednotkového vektoru osy (0..2 = X, Y, Z) — rychlá varianta. */
export function qaxis(o: Vec3, q: Quat, axis: 0 | 1 | 2): Vec3 {
  return qrotate(o, q, axis === 0 ? UNIT_X : axis === 1 ? UNIT_Y : UNIT_Z);
}

/**
 * Přírůstek orientace z úhlových rychlostí v osách tělesa.
 * Kladné rychlosti (po testech chování): pitch zvedá nos, yaw stáčí doprava,
 * roll pokládá pravé křídlo. V levotočivém systému s +Z dopředu to znamená:
 * pitch = rotace kolem +X o −úhel, yaw = kolem +Y o +úhel, roll = kolem +Z o −úhel.
 */
export function qfromBodyRates(o: Quat, pitchRate: number, yawRate: number, rollRate: number, dt: number): Quat {
  const rx = -pitchRate * dt, ry = yawRate * dt, rz = -rollRate * dt;
  const ang = Math.hypot(rx, ry, rz);
  if (ang < 1e-12) { o.x = 0; o.y = 0; o.z = 0; o.w = 1; return o; }
  return qfromAxisAngle(o, rx / ang, ry / ang, rz / ang, ang);
}

/** Orientace se zadaným dopředu (+Z) a přibližným nahoru (+Y). */
export function qlookRotation(o: Quat, fwd: Vec3, up: Vec3): Quat {
  // ortonormální báze: z = fwd, x = up × z (levotočivě: right), y = z × x
  const zx = fwd.x, zy = fwd.y, zz = fwd.z;
  let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
  const xl = Math.hypot(xx, xy, xz);
  if (xl < 1e-9) { xx = 1; xy = 0; xz = 0; } else { xx /= xl; xy /= xl; xz /= xl; }
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  // matice se sloupci x, y, z → kvaternion
  const m00 = xx, m11 = yy, m22 = zz;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    o.w = 0.25 * s; o.x = (yz - zy) / s; o.y = (zx - xz) / s; o.z = (xy - yx) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    o.w = (yz - zy) / s; o.x = 0.25 * s; o.y = (yx + xy) / s; o.z = (zx + xz) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    o.w = (zx - xz) / s; o.x = (yx + xy) / s; o.y = 0.25 * s; o.z = (zy + yz) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    o.w = (xy - yx) / s; o.x = (zx + xz) / s; o.y = (zy + yz) / s; o.z = 0.25 * s;
  }
  return qnormalize(o);
}

export function qslerp(o: Quat, a: Quat, b: Quat, t: number): Quat {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let c = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let ka: number, kb: number;
  if (c > 0.9995) { ka = 1 - t; kb = t; } else {
    const th = Math.acos(c), s = Math.sin(th);
    ka = Math.sin((1 - t) * th) / s; kb = Math.sin(t * th) / s;
  }
  o.x = a.x * ka + bx * kb; o.y = a.y * ka + by * kb; o.z = a.z * ka + bz * kb; o.w = a.w * ka + bw * kb;
  return qnormalize(o);
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const UNIT_X: Readonly<Vec3> = Object.freeze(vec3(1, 0, 0));
export const UNIT_Y: Readonly<Vec3> = Object.freeze(vec3(0, 1, 0));
export const UNIT_Z: Readonly<Vec3> = Object.freeze(vec3(0, 0, 1));

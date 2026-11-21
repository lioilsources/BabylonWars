// Střely — port weapons.lua. Kulka letí rovně (bez gravitace), zásah terénu
// hlásí událostí 'impact' se směrem letu; tunel vrtá klient (VoxelWorld),
// simulace drží jen kulky. Předalokovaný pool, žádné alokace v ticku.
import { raycast, newHit, type SolidFn } from '../voxel/raycast';
import type { ShipState } from './flight';
import { qaxis, vec3 } from './math';
import type { SimEvent } from './tricks';

export const WEAPON = {
  BULLET_SPEED: 120,     // m/s (3× max rychlost)
  BULLET_TTL: 2.5,
  COOLDOWN: 0.15,
  MUZZLE: 6,             // m před středem lodi (před kamerou na nose)
  TUNNEL_RADIUS: 4,      // Ø 8 jako závodní tunely — stíhačka proletí
  TUNNEL_LENGTH: 12,
  TUNNEL_BACKSET: 2,     // začátek kapsle kus před povrchem (plné ústí)
  DEBRIS_MAX: 140,
} as const;

const MAX_BULLETS = 64;

export interface Bullet {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ttl: number;
}

export class Weapons {
  readonly bullets: Bullet[] = Array.from({ length: MAX_BULLETS }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ttl: 0 }));
  cooldown = 0;
  private nose = vec3();
  private hit = newHit();

  /** Výstřel z lodi (respektuje cooldown); vrátí true, když vyletěla kulka */
  fire(s: ShipState, ev: SimEvent[]): boolean {
    if (this.cooldown > 0) return false;
    const b = this.bullets.find((q) => !q.alive);
    if (!b) return false;
    this.cooldown = WEAPON.COOLDOWN;
    const n = qaxis(this.nose, s.att, 2);
    b.alive = true;
    b.ttl = WEAPON.BULLET_TTL;
    b.x = s.pos.x + n.x * WEAPON.MUZZLE; b.y = s.pos.y + n.y * WEAPON.MUZZLE; b.z = s.pos.z + n.z * WEAPON.MUZZLE;
    // rychlost letadla navíc, ať kulka při střemhlavém letu nezůstává pozadu
    b.vx = n.x * WEAPON.BULLET_SPEED + s.vel.x;
    b.vy = n.y * WEAPON.BULLET_SPEED + s.vel.y;
    b.vz = n.z * WEAPON.BULLET_SPEED + s.vel.z;
    ev.push({ type: 'shot', x: b.x, y: b.y, z: b.z });
    return true;
  }

  step(dt: number, solid: SolidFn, ev: SimEvent[]): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const h = this.hit;
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.ttl -= dt;
      if (b.ttl <= 0) { b.alive = false; continue; }
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      const dist = sp * dt;
      raycast(solid, b.x, b.y, b.z, b.vx, b.vy, b.vz, dist, h);
      if (h.hit) {
        const k = h.t / sp;
        b.alive = false;
        ev.push({ type: 'impact', x: b.x + b.vx * k, y: b.y + b.vy * k, z: b.z + b.vz * k, dx: b.vx / sp, dy: b.vy / sp, dz: b.vz / sp });
        continue;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    }
  }

  clear(): void { for (const b of this.bullets) b.alive = false; }
}

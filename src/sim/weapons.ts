// Střely — port weapons.lua. Kulka letí rovně (bez gravitace), zásah terénu
// hlásí událostí 'impact' se směrem letu a rozměrem díry; tunel vrtá klient
// (VoxelWorld), simulace drží jen kulky. Předalokovaný pool, žádné alokace v ticku.
// Dvě zbraně (kolečko myši): kanón dělá malé krátery bez omezení, vrták
// prorazí širokou díru, kterou loď proletí, ale nabíjí se a vydrží krátce (jako nitro).
import { raycast, newHit, type SolidFn } from '../voxel/raycast';
import type { ShipState } from './flight';
import { qaxis, vec3 } from './math';
import type { SimEvent } from './tricks';

export const WEAPON = {
  BULLET_SPEED: 120,     // m/s (3× max rychlost)
  BULLET_TTL: 2.5,
  COOLDOWN: 0.15,
  MUZZLE: 6,             // m před středem lodi (před kamerou na nose)
  GUN_RADIUS: 2,         // kanón: kráter
  GUN_LENGTH: 3,
  DRILL_RADIUS: 5,       // vrták: Ø 10 (loď má Ø 3) — proletí se i v plné rychlosti
  DRILL_LENGTH: 14,
  DRILL_COOLDOWN: 0.11,
  DRILL_DRAIN: 1 / 2.2,  // plná nádrž vydrží 2,2 s palby
  DRILL_RECHARGE: 1 / 9, // a nabije se za 9 s
  DRILL_DELAY: 0.6,      // nabíjení začne až po pauze v palbě
  DRILL_MIN: 0.2,        // novou dávku nejde začít s téměř prázdnou nádrží
  TUNNEL_BACKSET: 2,     // začátek kapsle kus před povrchem (plné ústí)
  DEBRIS_MAX: 140,
} as const;

const MAX_BULLETS = 64;

export interface Bullet {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ttl: number;
  drill: boolean;
}

export type WeaponKind = 'gun' | 'drill';

export class Weapons {
  readonly bullets: Bullet[] = Array.from({ length: MAX_BULLETS }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ttl: 0, drill: false }));
  cooldown = 0;
  weapon: WeaponKind = 'gun';
  /** nádrž vrtáku 0…1 */
  drill = 1;
  private drillIdle = 0;
  private drilling = false;
  private nose = vec3();
  private hit = newHit();

  cycle(): WeaponKind { this.weapon = this.weapon === 'gun' ? 'drill' : 'gun'; return this.weapon; }

  /** Spoušť jednou za tick: palba vybranou zbraní + nádrž vrtáku */
  trigger(firing: boolean, s: ShipState, dt: number, ev: SimEvent[]): void {
    const drill = this.weapon === 'drill';
    if (firing && drill && this.drill > 0 && (this.drilling || this.drill >= WEAPON.DRILL_MIN)) {
      this.drilling = true;
      this.drill = Math.max(0, this.drill - WEAPON.DRILL_DRAIN * dt);
      this.drillIdle = 0;
      this.fire(s, ev, true);
      return;
    }
    if (!firing || !drill) this.drilling = false;
    if (firing && !drill) this.fire(s, ev, false);
    this.drillIdle += dt;
    if (this.drillIdle >= WEAPON.DRILL_DELAY) this.drill = Math.min(1, this.drill + WEAPON.DRILL_RECHARGE * dt);
  }

  /** Výstřel z lodi (respektuje cooldown); vrátí true, když vyletěla kulka */
  fire(s: ShipState, ev: SimEvent[], drill = false): boolean {
    if (this.cooldown > 0) return false;
    const b = this.bullets.find((q) => !q.alive);
    if (!b) return false;
    this.cooldown = drill ? WEAPON.DRILL_COOLDOWN : WEAPON.COOLDOWN;
    b.drill = drill;
    const n = qaxis(this.nose, s.att, 2);
    b.alive = true;
    b.ttl = WEAPON.BULLET_TTL;
    b.x = s.pos.x + n.x * WEAPON.MUZZLE; b.y = s.pos.y + n.y * WEAPON.MUZZLE; b.z = s.pos.z + n.z * WEAPON.MUZZLE;
    // rychlost letadla navíc, ať kulka při střemhlavém letu nezůstává pozadu
    b.vx = n.x * WEAPON.BULLET_SPEED + s.vel.x;
    b.vy = n.y * WEAPON.BULLET_SPEED + s.vel.y;
    b.vz = n.z * WEAPON.BULLET_SPEED + s.vel.z;
    ev.push({ type: 'shot', x: b.x, y: b.y, z: b.z, drill });
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
        ev.push({ type: 'impact', x: b.x + b.vx * k, y: b.y + b.vy * k, z: b.z + b.vz * k, dx: b.vx / sp, dy: b.vy / sp, dz: b.vz / sp,
          r: b.drill ? WEAPON.DRILL_RADIUS : WEAPON.GUN_RADIUS, len: b.drill ? WEAPON.DRILL_LENGTH : WEAPON.GUN_LENGTH });
        continue;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    }
  }

  clear(): void { for (const b of this.bullets) b.alive = false; this.drill = 1; this.drilling = false; }
}

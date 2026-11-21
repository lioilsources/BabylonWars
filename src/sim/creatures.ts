// Dekorativní monstra — port monsters.lua. Hadí draci pěti živlů, písečný
// červ, kamenný strážce, medúzy a toulavá nebeská velryba. „Čínský drak":
// hlava + řetěz zmenšujících se kostek, které pružinově následují předchůdce.
// Čistě dekorativní (žádné poškození), deterministické (vlastní PRNG).
// Výšky povrchu bere z analytického profilu ostrova (islandColumnTop) —
// levné a nezávislé na načtených chunkcích.
import { Rng } from '../gen/features';
import { islandColumnTop } from '../gen/generator';
import { cachedIsland, ISLAND_GRID, nearestIsland, type Island } from '../gen/islands';
import { wrapAngle } from './flight';
import { clamp, vec3, type Vec3 } from './math';

export const CREATURE = {
  SPAWN_DIST: 200,       // 3D vzdálenost hráč–střed ostrova pro spawn
  DESPAWN_DIST: 420,     // Luanti maže entity mimo aktivní bloky
  CELL_SCAN: 2,
  SCAN_INTERVAL: 3,
  WHALE_CHANCE: 20,      // 1/N za průchod spawneru
  WHALE_DESPAWN: 800,
  SEG_PULL: 6,
  SEG_MAX_SPEED: 60,
  SCALE: 2,
} as const;
const S = CREATURE.SCALE;
const DRAGON_CLEARANCE = 8 + 6 * S;

export type Behavior = 'orbit' | 'worm' | 'drift' | 'hover' | 'roam';
export type Fx = 'fire' | 'ice' | 'water' | 'mud' | 'electric' | 'dust' | 'spore' | 'blow';

export interface SpeciesDef {
  tint: string | null;
  bodyTex: string; faceTex: string;
  glow: number;
  segCount: number; spacing: number; headSize: number;
  segSizes?: number[];
  chainHang?: boolean; fluke?: boolean; roaming?: boolean; stunts?: boolean;
  speed: number;
  behavior: Behavior;
  altFrac?: number; alt?: number;
  fx?: Fx; fxInterval?: number;
  hear: number;
}

const BODY = 'doggiowars_monster_body.png', HEAD = 'doggiowars_monster_head.png';
const dragon = (tint: string, o: { glow?: number; fx: Fx; speed?: number; altFrac?: number; alt?: number; fxInterval?: number }): SpeciesDef => ({
  tint, bodyTex: BODY, faceTex: HEAD, glow: o.glow ?? 6, segCount: 7, spacing: 1.7 * S, headSize: 1.5 * S,
  speed: o.speed ?? 12, altFrac: o.altFrac, alt: o.alt, behavior: 'orbit', stunts: true, fx: o.fx, fxInterval: o.fxInterval, hear: 250,
});
const jelly = (tint: string | null, glow: number, speed: number, fx?: Fx): SpeciesDef => ({
  tint, bodyTex: 'doggiowars_jelly.png', faceTex: 'doggiowars_jelly.png', glow, segCount: 4, spacing: 0.8 * S, headSize: 1.2 * S,
  segSizes: [0.4, 0.35, 0.3, 0.25].map((v) => v * S), chainHang: true, speed, behavior: 'drift', fx, fxInterval: 0.6, hear: 250,
});

export const SPECIES = {
  dragon_fire: dragon('#e0512e', { glow: 8, fx: 'fire' }),
  dragon_ice: dragon('#bfe6ff', { glow: 6, fx: 'ice' }),
  dragon_water: dragon('#35c8c0', { glow: 4, fx: 'water', altFrac: 0.2, alt: 6 }),
  dragon_mud: dragon('#8a6a3a', { glow: 0, fx: 'mud', speed: 9 }),
  dragon_electric: dragon('#ffe94a', { glow: 11, fx: 'electric', speed: 16, fxInterval: 0.15 }),
  worm: { tint: '#d8c07a', bodyTex: BODY, faceTex: HEAD, glow: 0, segCount: 8, spacing: 1.3 * S, headSize: 1.2 * S, speed: 11, behavior: 'worm', hear: 250 },
  guardian: { tint: null, bodyTex: 'doggiowars_basalt.png', faceTex: 'doggiowars_guardian.png', glow: 7, segCount: 0, spacing: 0, headSize: 3.2 * S, speed: 0, behavior: 'hover', hear: 250 },
  jelly: jelly(null, 4, 2.5),
  jelly_glow: jelly('#d8a8ff', 12, 2.2, 'spore'),
  whale: {
    tint: '#8fa6ba', bodyTex: BODY, faceTex: HEAD, glow: 0, segCount: 4, spacing: 3.2 * S, headSize: 3.0 * S,
    segSizes: [2.6, 2.0, 1.4, 0.9].map((v) => v * S), fluke: true, speed: 6, behavior: 'roam', roaming: true, hear: 400,
  },
} satisfies Record<string, SpeciesDef>;
export type Species = keyof typeof SPECIES;
export const SPECIES_NAMES = Object.keys(SPECIES) as Species[];

const BIOME_CREW: Record<string, Species[]> = {
  volcanic: ['dragon_fire', 'dragon_fire', 'dragon_fire'],
  ashen: ['dragon_fire', 'dragon_fire', 'worm'],
  glacial: ['dragon_ice', 'dragon_ice', 'dragon_ice'],
  atoll: ['dragon_water', 'dragon_water', 'jelly', 'jelly', 'jelly'],
  swamp: ['dragon_mud', 'dragon_mud', 'jelly_glow', 'jelly_glow'],
  crystal: ['dragon_electric', 'dragon_electric', 'dragon_electric', 'jelly_glow', 'jelly_glow'],
  desert: ['worm', 'worm', 'worm'],
  savanna: ['worm', 'worm', 'jelly', 'jelly'],
  barren: ['guardian', 'dragon_electric', 'worm'],
  verdant: ['jelly', 'jelly', 'jelly', 'jelly', 'jelly', 'jelly', 'dragon_water'],
  jungle: ['jelly', 'jelly', 'jelly', 'jelly', 'dragon_mud'],
  mycelial: ['jelly_glow', 'jelly_glow', 'jelly_glow', 'jelly_glow', 'jelly_glow', 'jelly_glow'],
};

export interface Segment { pos: Vec3; vel: Vec3; yaw: number; pitch: number; sx: number; sy: number; sz: number }

export interface Creature {
  id: number;
  species: Species;
  def: SpeciesDef;
  island: Island | null;
  pos: Vec3; vel: Vec3;
  yaw: number; pitch: number; roll: number;
  segs: Segment[];
  // stav chování (jako self.* v Lua)
  phase: number; orbitK: number; altOff: number;
  rollS: number; lastYaw: number | null;
  stunt: { a: number; dx: number; dz: number } | null; stuntCd: number;
  floorT: number; floorY: number | null;
  surfT: number; surfY: number | null; wasAbove: boolean | null;
  wp: Vec3 | null; wpT: number; bob: number;
  anchorY: number | null; idleYaw: number;
  lookT: number; blocked: boolean; blowT: number;
  fxT: number;
}

export interface FxEvent { fx: Fx; x: number; y: number; z: number; tint: string | null }

export class Creatures {
  readonly list: Creature[] = [];
  /** efekty k vykreslení (vyprázdní klient) */
  readonly fx: FxEvent[] = [];
  private groups = new Map<string, Creature[]>();
  private whale: Creature | null = null;
  private scanT = 0;
  private nextId = 1;
  private rng: Rng;

  constructor(private solid: (x: number, y: number, z: number) => boolean, private seed: number) {
    this.rng = new Rng((seed ^ 0x5eed) >>> 0);
  }

  private surfaceY(isl: Island, x: number, z: number): number | null {
    const t = islandColumnTop(isl, x, z, this.seed);
    return t === null ? null : t + 1;
  }

  private create(sp: Species, isl: Island | null, x: number, y: number, z: number): Creature {
    const def: SpeciesDef = SPECIES[sp];
    const segs: Segment[] = [];
    for (let i = 1; i <= def.segCount; i++) {
      const sc = def.segSizes ? def.segSizes[i - 1] ?? def.segSizes[def.segSizes.length - 1]
        : Math.max(0.35 * S, def.headSize * (0.85 - 0.07 * i));
      segs.push({ pos: vec3(x, y, z), vel: vec3(), yaw: 0, pitch: 0, sx: sc, sy: sc, sz: sc });
    }
    // velrybí ocasní ploutev: poslední článek plochý a široký
    if (def.fluke && segs.length) Object.assign(segs[segs.length - 1], { sx: 2.4 * S, sy: 0.5 * S, sz: 1.2 * S });
    const c: Creature = {
      id: this.nextId++, species: sp, def, island: isl, pos: vec3(x, y, z), vel: vec3(), yaw: 0, pitch: 0, roll: 0, segs,
      phase: this.rng.next() * 2 * Math.PI, orbitK: 1, altOff: 0, rollS: 0, lastYaw: null,
      stunt: null, stuntCd: this.rng.int(8, 20), floorT: 1, floorY: null, surfT: 1, surfY: null, wasAbove: null,
      wp: null, wpT: 0, bob: this.rng.next() * 6, anchorY: null, idleYaw: 0, lookT: 1, blocked: false,
      blowT: this.rng.int(8, 20), fxT: 0,
    };
    this.list.push(c);
    return c;
  }

  private spawnCrew(isl: Island, key: string): void {
    const crew = BIOME_CREW[isl.biome.name];
    if (!crew) return;
    const objs: Creature[] = [];
    crew.forEach((sp, idx) => {
      const i = idx + 1;
      const ang = this.rng.next() * 2 * Math.PI;
      const x = isl.x + Math.cos(ang) * isl.radius * 0.6, z = isl.z + Math.sin(ang) * isl.radius * 0.6;
      let y = isl.y + isl.radius * 0.5 + i * 4;
      const surf = this.surfaceY(isl, x, z);
      if (surf !== null) y = Math.max(y, surf + 6 + i * 4);
      const c = this.create(sp, isl, x, y, z);
      // stejný druh vícekrát: rozprostřít do pater a poloměrů
      c.altOff = (objs.length % 3) * 6 * S;
      c.orbitK = 0.7 + this.rng.next() * 0.35;
      objs.push(c);
    });
    this.groups.set(key, objs);
  }

  /** Ruční spawn (příkaz /monster, obdoba chatbridge): přiváže se k nejbližšímu ostrovu */
  spawn(sp: Species, x: number, y: number, z: number): Creature | null {
    const isl = SPECIES[sp].behavior === 'roam' ? null : nearestIsland(x, z, this.seed)?.isl ?? null;
    if (!isl && !(SPECIES[sp] as SpeciesDef).roaming) return null;
    const c = this.create(sp, isl, x, y, z);
    c.orbitK = 0.7 + this.rng.next() * 0.35;
    const key = `manual:${c.id}`;
    this.groups.set(key, [c]);
    return c;
  }

  /** Odstraní tvora podle id (chatbridge TTL); true, když existoval */
  despawn(id: number): boolean {
    const c = this.list.find((q) => q.id === id);
    if (!c) return false;
    for (const [k, g] of this.groups) if (g.includes(c)) { const r = g.filter((q) => q !== c); if (r.length) this.groups.set(k, r); else this.groups.delete(k); }
    if (this.whale === c) this.whale = null;
    this.remove(new Set([c]));
    return true;
  }

  has(id: number): boolean { return this.list.some((c) => c.id === id); }

  private remove(set: Set<Creature>): void {
    for (let i = this.list.length - 1; i >= 0; i--) if (set.has(this.list[i])) this.list.splice(i, 1);
  }

  step(dt: number, player: Vec3): void {
    this.scanT += dt;
    if (this.scanT >= CREATURE.SCAN_INTERVAL) { this.scanT = 0; this.scan(player); }
    for (const c of this.list) {
      switch (c.def.behavior) {
        case 'orbit': this.orbit(c, dt); break;
        case 'worm': this.worm(c, dt); break;
        case 'drift': this.drift(c, dt); break;
        case 'hover': this.hover(c, dt, player); break;
        case 'roam': this.roam(c, dt); break;
      }
      if (c.segs.length) this.chain(c, dt);
      if (c.def.fx) {
        c.fxT += dt;
        if (c.fxT >= (c.def.fxInterval ?? 0.25)) { c.fxT = 0; this.fx.push({ fx: c.def.fx, x: c.pos.x, y: c.pos.y, z: c.pos.z, tint: c.def.tint }); }
      }
    }
  }

  private scan(p: Vec3): void {
    // úklid daleko od hráče (v Luanti je smaže engine mimo aktivní bloky)
    const gone = new Set<Creature>();
    for (const [key, grp] of this.groups) {
      const isl = grp[0]?.island;
      const far = isl ? Math.hypot(isl.x - p.x, isl.y - p.y, isl.z - p.z) > CREATURE.DESPAWN_DIST : true;
      if (far) { for (const c of grp) gone.add(c); this.groups.delete(key); }
    }
    if (this.whale && Math.hypot(this.whale.pos.x - p.x, this.whale.pos.z - p.z) > CREATURE.WHALE_DESPAWN) {
      gone.add(this.whale); this.whale = null;
    }
    if (gone.size) this.remove(gone);

    const pcx = Math.floor(p.x / ISLAND_GRID), pcz = Math.floor(p.z / ISLAND_GRID);
    for (let dx = -CREATURE.CELL_SCAN; dx <= CREATURE.CELL_SCAN; dx++) for (let dz = -CREATURE.CELL_SCAN; dz <= CREATURE.CELL_SCAN; dz++) {
      const key = `${pcx + dx}:${pcz + dz}`;
      if (this.groups.has(key)) continue;
      const isl = cachedIsland(pcx + dx, pcz + dz, this.seed);
      if (isl && Math.hypot(isl.x - p.x, isl.y - p.y, isl.z - p.z) < CREATURE.SPAWN_DIST) this.spawnCrew(isl, key);
    }
    // toulavá velryba: max jedna, vzácně
    if (!this.whale && this.rng.int(1, CREATURE.WHALE_CHANCE) === 1) {
      const ang = this.rng.next() * 2 * Math.PI;
      this.whale = this.create('whale', null, p.x + Math.cos(ang) * 250, clamp(p.y + 40, 150, 600), p.z + Math.sin(ang) * 250);
    }
  }

  // --- letové primitivy ------------------------------------------------------

  private setRotation(c: Creature, dt: number, banking: boolean): void {
    const v = c.vel, hl = Math.hypot(v.x, v.z);
    if (hl < 0.05) return;
    const yaw = Math.atan2(v.x, v.z);
    let roll = 0;
    if (banking) {
      const rate = wrapAngle(yaw - (c.lastYaw ?? yaw)) / Math.max(dt, 0.01);
      c.rollS += (clamp(rate * 0.5, -1, 1) - c.rollS) * Math.min(dt * 5, 1);
      roll = c.rollS;
    }
    c.lastYaw = yaw;
    c.yaw = yaw; c.pitch = Math.atan2(v.y, hl); c.roll = roll;
  }

  private flyToward(c: Creature, tx: number, ty: number, tz: number, speed: number, dt: number): void {
    const dx = tx - c.pos.x, dy = ty - c.pos.y, dz = tz - c.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d >= 0.05) { c.vel.x = dx * speed / d; c.vel.y = dy * speed / d; c.vel.z = dz * speed / d; }
    this.integrate(c, dt);
    this.setRotation(c, dt, true);
  }

  private integrate(c: Creature, dt: number): void {
    c.pos.x += c.vel.x * dt; c.pos.y += c.vel.y * dt; c.pos.z += c.vel.z * dt;
  }

  /** Řetěz článků: rozestup za předchůdcem pružinovým seekem */
  private chain(c: Creature, dt: number): void {
    const def = c.def;
    let pred: Vec3 = c.pos;
    for (const s of c.segs) {
      const ax = pred.x, ay = def.chainHang ? pred.y - def.spacing * 0.8 : pred.y, az = pred.z;
      const dx = ax - s.pos.x, dy = ay - s.pos.y, dz = az - s.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > def.spacing) {
        const k = Math.min((d - def.spacing) * CREATURE.SEG_PULL, CREATURE.SEG_MAX_SPEED);
        s.vel.x = dx * k / d; s.vel.y = dy * k / d; s.vel.z = dz * k / d;
      } else { s.vel.x *= 0.5; s.vel.y *= 0.5; s.vel.z *= 0.5; }
      s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
      const hl = Math.hypot(s.vel.x, s.vel.z);
      if (hl > 0.5) { s.yaw = Math.atan2(s.vel.x, s.vel.z); s.pitch = Math.atan2(s.vel.y, hl); }
      pred = s.pos;
    }
  }

  // --- chování -----------------------------------------------------------------

  /** Kroužení kolem ostrova + bob; draci si občas střihnou looping */
  private orbit(c: Creature, dt: number): void {
    const isl = c.island!, def = c.def;
    const orbitR = clamp(isl.radius * 0.8, 30, 110) * c.orbitK;
    const alt = isl.y + isl.radius * (def.altFrac ?? 0.35) + (def.alt ?? 10) + c.altOff;
    if (c.stunt) {
      c.stunt.a += dt * (2 * Math.PI / 2.6);
      const a = c.stunt.a;
      c.vel.x = c.stunt.dx * Math.cos(a) * def.speed; c.vel.y = Math.sin(a) * def.speed; c.vel.z = c.stunt.dz * Math.cos(a) * def.speed;
      this.integrate(c, dt);
      this.setRotation(c, dt, false);
      if (a >= 2 * Math.PI) c.stunt = null;
      return;
    }
    c.phase += dt * def.speed / orbitR;
    // podlaha letu: nejvyšší povrch pod drakem a kus dráhy před ním
    c.floorT += dt;
    if (c.floorT >= 0.5) {
      c.floorT = 0;
      let top: number | null = null;
      const ahead = 40 / orbitR;
      for (let k = 0; k <= 5; k++) {
        const ph = c.phase + ahead * k / 4;
        const x = k === 5 ? c.pos.x : isl.x + Math.cos(ph) * orbitR, z = k === 5 ? c.pos.z : isl.z + Math.sin(ph) * orbitR;
        const y = this.surfaceY(isl, x, z);
        if (y !== null && (top === null || y > top)) top = y;
      }
      c.floorY = top !== null ? top + DRAGON_CLEARANCE + c.altOff : null;
    }
    this.flyToward(c, isl.x + Math.cos(c.phase) * orbitR, Math.max(alt, c.floorY ?? alt) + Math.sin(c.phase * 2) * 6,
      isl.z + Math.sin(c.phase) * orbitR, def.speed, dt);
    if (def.stunts) {
      c.stuntCd -= dt;
      if (c.stuntCd <= 0) {
        c.stuntCd = this.rng.int(12, 30);
        const hl = Math.hypot(c.vel.x, c.vel.z);
        if (hl > 1) c.stunt = { a: 0, dx: c.vel.x / hl, dz: c.vel.z / hl };
      }
    }
  }

  /** Písečný červ: krouží po povrchu, delfíní oblouky pod povrch a zpět */
  private worm(c: Creature, dt: number): void {
    const isl = c.island!, def = c.def;
    const orbitR = Math.max(isl.radius * 0.45, 18) * c.orbitK;
    c.phase += dt * def.speed / orbitR;
    const tx = isl.x + Math.cos(c.phase) * orbitR, tz = isl.z + Math.sin(c.phase) * orbitR;
    c.surfT += dt;
    if (c.surfT >= 1) { c.surfT = 0; c.surfY = this.surfaceY(isl, tx, tz) ?? c.surfY ?? isl.y; }
    const dive = Math.sin(c.phase * 5) * 7;
    const sy = c.surfY ?? isl.y;
    this.flyToward(c, tx, sy + dive, tz, def.speed, dt);
    const above = dive > 0;
    if (c.wasAbove !== null && above !== c.wasAbove) this.fx.push({ fx: 'dust', x: tx, y: sy, z: tz, tint: null });
    c.wasAbove = above;
  }

  /** Medúza: líné bloudění mezi náhodnými waypointy nad ostrovem */
  private drift(c: Creature, dt: number): void {
    const isl = c.island!, def = c.def;
    if (!c.wp || Math.hypot(c.pos.x - c.wp.x, c.pos.y - c.wp.y, c.pos.z - c.wp.z) < 4 || c.wpT > 20) {
      const ang = this.rng.next() * 2 * Math.PI, r = this.rng.next() * isl.radius * 0.6;
      const wx = isl.x + Math.cos(ang) * r, wz = isl.z + Math.sin(ang) * r;
      let y = isl.y + isl.radius * (0.3 + this.rng.next() * 0.35);
      const surf = this.surfaceY(isl, wx, wz);
      if (surf !== null) y = Math.max(y, surf + 3 * S + this.rng.next() * 10);
      c.wp = vec3(wx, y, wz);
      c.wpT = 0;
    }
    c.wpT += dt;
    c.bob += dt * 2;
    this.flyToward(c, c.wp.x, c.wp.y + Math.sin(c.bob) * 1.5, c.wp.z, def.speed, dt);
  }

  /** Kamenný strážce: visí nad vrcholem a natáčí se za hráčem do 100 m */
  private hover(c: Creature, dt: number, player: Vec3): void {
    const isl = c.island!;
    if (c.anchorY === null) {
      const top = this.surfaceY(isl, isl.x, isl.z);
      c.anchorY = top !== null ? top + 4 + 2 * S : isl.y + isl.radius * 0.55 + 8;
    }
    c.bob += dt;
    const ty = c.anchorY + Math.sin(c.bob * 0.8) * 1.2;
    c.vel.x = (isl.x - c.pos.x) * 0.6; c.vel.y = (ty - c.pos.y) * 0.6; c.vel.z = (isl.z - c.pos.z) * 0.6;
    this.integrate(c, dt);
    let want: number;
    if (Math.hypot(player.x - c.pos.x, player.y - c.pos.y, player.z - c.pos.z) < 100) want = Math.atan2(player.x - c.pos.x, player.z - c.pos.z);
    else { c.idleYaw += dt * 0.15; want = c.idleYaw; }
    const step = 0.8 * dt;
    c.yaw += clamp(wrapAngle(want - c.yaw), -step, step);
    c.pitch = 0; c.roll = 0;
  }

  /** Velryba: pluje mezi vzdálenými waypointy, ostrovům se vyhne stoupáním */
  private roam(c: Creature, dt: number): void {
    const def = c.def, p = c.pos;
    if (!c.wp || Math.hypot(p.x - c.wp.x, p.y - c.wp.y, p.z - c.wp.z) < 25) {
      const ang = this.rng.next() * 2 * Math.PI, d = 300 + this.rng.next() * 300;
      c.wp = vec3(p.x + Math.cos(ang) * d, clamp(p.y + (this.rng.next() - 0.5) * 120, 150, 600), p.z + Math.sin(ang) * d);
    }
    c.lookT += dt;
    if (c.lookT >= 0.5) {
      c.lookT = 0;
      const dx = c.wp.x - p.x, dy = c.wp.y - p.y, dz = c.wp.z - p.z, l = Math.hypot(dx, dy, dz) || 1;
      c.blocked = false;
      for (const oy of [0, -6]) {
        for (let s = 1; s <= 60; s += 2) {
          const x = p.x + dx / l * s, y = p.y + oy + dy / l * s, z = p.z + dz / l * s;
          if (this.solid(x, y, z)) { c.blocked = true; c.wp.y = Math.max(c.wp.y, y + 30); break; }
        }
      }
    }
    if (c.blocked) {
      // strmé stoupání s dopřednou složkou
      const hx = c.wp.x - p.x, hz = c.wp.z - p.z, hl = Math.hypot(hx, hz) || 1;
      this.flyToward(c, p.x + hx / hl * 0.5, p.y + 1, p.z + hz / hl * 0.5, def.speed, dt);
      return;
    }
    c.bob += dt * 0.5;
    this.flyToward(c, c.wp.x, c.wp.y + Math.sin(c.bob) * 4, c.wp.z, def.speed, dt);
    c.blowT -= dt;
    if (c.blowT <= 0) { c.blowT = this.rng.int(15, 25); this.fx.push({ fx: 'blow', x: p.x, y: p.y, z: p.z, tint: null }); }
  }

  get count(): number { return this.list.length; }
}

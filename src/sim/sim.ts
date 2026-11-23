// Simulace jedné lodi: řízení, pohyb s kolizí (tažená koule), poškození,
// smrt a respawn, triky, boost a skóre. Pevný krok, žádné hodiny, žádný DOM
// ani Babylon — jde testovat headless a později pustit na serveru.

import { C, TICK_DT } from './constants';
import { createShip, steerFighter, stepSpace, stepSub, syncEuler, type ControlPreset, type ShipMode, type ShipState } from './flight';
import type { InputFrame } from './input';
import { v3copy, vec3, type Vec3 } from './math';
import { award, checkTriggers, createPilot, detectTricks, stepTrick, updateInput, updatePassive, type Pilot, type SimEvent, type TrickEvents } from './tricks';
import type { WorldQuery } from './world-query';
import { startRace, type Race } from './race';
import { Weapons } from './weapons';

export const SHIP_RADIUS = 1.5;
const RESPAWN_DELAY = 3;

export class Sim {
  ship: ShipState;
  pilot: Pilot = createPilot();
  time = 0;
  dead = false;
  respawnTimer = 0;
  readonly events: SimEvent[] = [];
  readonly weapons = new Weapons();
  race: Race | null = null;
  private te: TrickEvents = { tap: 0, double: 0, holdJump: 0 };
  private from: Vec3 = vec3();

  constructor(private world: WorldQuery, spawn: { x: number; y: number; z: number; yaw: number }, mode: ShipMode, control: ControlPreset, readonly seed = 0) {
    this.ship = createShip(vec3(spawn.x, spawn.y, spawn.z), spawn.yaw, mode);
    this.ship.control = control;
    this.liftClear();
  }

  /** Spawn z Lua (povrch kupole + 18) může skončit v kopci — vytáhni loď nad terén */
  private liftClear(): void {
    const p = this.ship.pos;
    for (let i = 0; i < 150; i++) {
      if (!this.world.sweep(p.x, p.y, p.z, p.x, p.y, p.z, SHIP_RADIUS + 1).hit) return;
      p.y += 2;
    }
  }

  /** Jeden tick (TICK_DT). Události se přidávají do `events` (čistí volající). */
  tick(inp: InputFrame, horizonTilt: number, dt = TICK_DT): void {
    this.time += dt;
    const s = this.ship, now = this.time, ev = this.events;
    this.weapons.step(dt, this.world.isSolid, ev);
    this.weapons.trigger(inp.fire && !this.dead, s, dt, ev);
    if (this.race && !this.race.step(dt, s.pos, this.pilot, ev)) this.race = null;
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }
    const e = updateInput(this.pilot, inp.buttons, now, this.te);
    s.iframes = Math.max(0, s.iframes - dt);
    s.crashCooldown = Math.max(0, s.crashCooldown - dt);

    if (s.trick) stepTrick(this.pilot, s, dt, now, ev);
    else if (s.mode === 'sub') stepSub(s, inp, dt);
    else if (s.mode === 'space') {
      const out = stepSpace(s, inp, dt);
      detectTricks(this.pilot, s, out.pitchRate, out.rollRate, dt, now, ev);
      checkTriggers(this.pilot, s, e, ev, !inp.stickThrottle);
    } else {
      const out = steerFighter(s, inp, dt, horizonTilt);
      if (out.drifting) this.pilot.score += 50 * dt;
      if (s.control !== 'classic') detectTricks(this.pilot, s, out.pitchRate, out.rollRate, dt, now, ev);
      checkTriggers(this.pilot, s, e, ev, !inp.stickThrottle);
    }

    this.move(dt);
    if (this.dead) return;
    updatePassive(this.pilot, s, dt, this.world.isSolid);
  }

  private move(dt: number): void {
    const s = this.ship, w = this.world;
    v3copy(this.from, s.pos);
    const tx = s.pos.x + s.vel.x * dt, ty = s.pos.y + s.vel.y * dt, tz = s.pos.z + s.vel.z * dt;
    const h = w.sweep(s.pos.x, s.pos.y, s.pos.z, tx, ty, tz, SHIP_RADIUS);
    if (!h.hit) { s.pos.x = tx; s.pos.y = ty; s.pos.z = tz; return; }
    s.pos.x = h.x; s.pos.y = h.y; s.pos.z = h.z;
    const nx = h.nx, ny = h.ny, nz = h.nz;
    // sklouznutí po ploše: zbytek dráhy bez složky do normály
    let rx = tx - s.pos.x, ry = ty - s.pos.y, rz = tz - s.pos.z;
    const rn = rx * nx + ry * ny + rz * nz;
    if (rn < 0) { rx -= nx * rn; ry -= ny * rn; rz -= nz * rn; }
    const h2 = w.sweep(s.pos.x, s.pos.y, s.pos.z, s.pos.x + rx, s.pos.y + ry, s.pos.z + rz, SHIP_RADIUS);
    s.pos.x = h2.x; s.pos.y = h2.y; s.pos.z = h2.z;
    // ponorka: zahoď rychlost do stěny
    const vn = s.vel.x * nx + s.vel.y * ny + s.vel.z * nz;
    if (vn < 0) { s.vel.x -= nx * vn; s.vel.y -= ny * vn; s.vel.z -= nz * vn; }

    // kolizní poškození (vehicle.lua): náraz nad 15 m/s bolí, škrtnutí ne
    if (s.crashCooldown <= 0 && s.speed > 15) {
      s.crashCooldown = 0.5;
      const dmg = Math.floor((s.speed - 10) * 2.5);
      s.speed = C.SPEED_MIN;
      this.events.push({ type: 'crash', damage: dmg });
      this.damage(dmg, true);
    }
  }

  /** Poškození lodi; výkrut dává krátkou nesmrtelnost vůči střelám */
  damage(amount: number, bypassIframes = false): void {
    const s = this.ship;
    if (this.dead || (!bypassIframes && s.iframes > 0)) return;
    s.hp = Math.max(0, s.hp - amount);
    if (s.hp <= 0) this.die();
  }

  private die(): void {
    this.dead = true;
    this.respawnTimer = RESPAWN_DELAY;
    const p = this.ship.pos;
    this.events.push(
      { type: 'explode', x: p.x, y: p.y, z: p.z, r: 5 },
      { type: 'died' },
      { type: 'flash', text: 'DESTROYED! Respawn…', color: '#FF6A50' },
    );
    // smrt během závodu = konec závodu
    if (this.race && !this.race.finished) {
      this.race = null;
      this.events.push({ type: 'flash', text: 'RACE FAILED', color: '#FF5040' }, { type: 'race_end', ok: false, time: 0, cp: 0, cpTotal: 0, score: 0 });
    }
  }

  respawn(at?: { x: number; y: number; z: number; yaw: number }): void {
    const s = this.ship;
    const sp = at ?? this.world.spawnNear(s.pos.x, s.pos.z);
    const n = createShip(vec3(sp.x, sp.y, sp.z), sp.yaw, s.mode);
    n.control = s.control;
    Object.assign(s, n);
    this.dead = false;
    this.liftClear();
    this.events.push({ type: 'respawned' });
  }

  setMode(mode: ShipMode): void {
    const s = this.ship;
    s.mode = mode;
    s.trick = null;
    s.stickX = 0; s.stickY = 0;
    syncEuler(s);
    if (mode === 'sub') { s.vel.x = 0; s.vel.y = 0; s.vel.z = 0; s.speed = 0; }
    else if (mode === 'fighter') s.speed = Math.max(s.speed, 15);
    s.lookH = s.heading; s.lookV = s.pitch;
  }

  setControl(c: ControlPreset): void {
    const s = this.ship;
    s.control = c;
    s.stickX = 0; s.stickY = 0;
    // Euler stav z aktuální orientace (přechod free → classic bez skoku)
    syncEuler(s);
  }

  /** /race: trať od lodi ve směru letu; v ponorce přepne na stíhačku */
  startRace(): void {
    if (this.dead) return;
    if (this.ship.mode === 'sub') this.setMode('fighter');
    const s = this.ship;
    const fx = 2 * (s.att.x * s.att.z + s.att.w * s.att.y), fz = 1 - 2 * (s.att.x * s.att.x + s.att.y * s.att.y);
    this.race = startRace(s.pos, fx, fz, this.seed, Math.floor(this.time * 1000), this.events);
  }

  stopRace(): boolean {
    const had = this.race !== null;
    this.race = null;
    return had;
  }

  /** Ruční ocenění (závod, zajíc …) */
  award(label: string, points: number, boost = 0): void {
    award(this.pilot, this.ship, this.time, label, points, boost, this.events);
  }
}

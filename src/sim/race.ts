// Chrtí závod — port race.lua + rabbit.lua. Trať je Catmull-Rom splajna přes
// řetěz ostrovů ve směru letu; zlatý zajíc ji letí před hráčem, rubber-banduje
// rychlost a když hráč moc zaostane, krouží a čeká. Tunely skrz ostrovy hlásí
// událostí 'carve' (vykope klient). Indexy bodů jsou od 0 (Lua od 1).
import { Rng } from '../gen/features';
import { ISLAND_GRID, islandForCell, type Island } from '../gen/islands';
import { attFromEuler, wrapAngle } from './flight';
import { clamp, quat, vec3, type Quat, type Vec3 } from './math';
import type { Pilot, SimEvent } from './tricks';

export const RACE = {
  CHECKPOINT_RADIUS: 15,
  FINISH_RADIUS: 20,
  CARVE_R: 4,
  // rabbit.lua
  WAIT_ENTER_DIST: 130,
  WAIT_LEAVE_DIST: 55,
  WAIT_RADIUS: 25,
  WAIT_SPEED: 12,
  CELEBRATE_TIME: 8,
  CHECKPOINT_SCORE: 50,
  FINISH_SCORE: 500,
} as const;

type SegType = 'slalom' | 'showcase' | 'orbit' | 'tunnel' | 'climb_dive';
const SEG_TYPES: SegType[] = ['slalom', 'showcase', 'orbit', 'slalom', 'tunnel', 'climb_dive'];

/** Texty hintů (anglicky jako v Lua; česky je přeloží tFlash) */
export const RACE_HINTS: Record<SegType, string> = {
  slalom: 'SLALOM! Stay on the hare',
  showcase: 'HARE: BARREL ROLL! (double-tap A/D)',
  orbit: 'HARD TURN! S+A/D = airbrake drift',
  tunnel: 'TUNNEL! Slow down (S) and fly clean',
  climb_dive: 'CLIMB + DIVE! Shift down for extra speed',
};

export interface RouteMeta {
  checkpoint?: boolean; finish?: boolean;
  speed?: number;
  trick?: 'barrel_roll';
  hint?: string; hintShown?: boolean;
}

export interface Route {
  points: Vec3[];
  meta: RouteMeta[];
  carves: { i0: number; i1: number; done: boolean }[];
}

// --- splajna ----------------------------------------------------------------

const cm = (a: number, b: number, c: number, d: number, t: number, t2: number, t3: number): number =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);

export function evalRoute(r: Route, seg: number, t: number, out: Vec3 = vec3()): Vec3 {
  const p = r.points, n = p.length;
  const ci = (i: number): number => Math.max(0, Math.min(i, n - 1));
  seg = Math.max(0, Math.min(seg, n - 2));
  const p0 = p[ci(seg - 1)], p1 = p[seg], p2 = p[ci(seg + 1)], p3 = p[ci(seg + 2)];
  const t2 = t * t, t3 = t2 * t;
  out.x = cm(p0.x, p1.x, p2.x, p3.x, t, t2, t3);
  out.y = cm(p0.y, p1.y, p2.y, p3.y, t, t2, t3);
  out.z = cm(p0.z, p1.z, p2.z, p3.z, t, t2, t3);
  return out;
}

const ta = vec3(), tb = vec3();
export function tangent(r: Route, seg: number, t: number, out: Vec3 = vec3()): Vec3 {
  const e = 0.001;
  evalRoute(r, seg, t, ta); evalRoute(r, seg, t + e, tb);
  out.x = (tb.x - ta.x) / e; out.y = (tb.y - ta.y) / e; out.z = (tb.z - ta.z) / e;
  return out;
}

export interface Cursor { seg: number; t: number; finished: boolean }

/** Posun po splajně o ds metrů (mění kurzor) */
export function advance(r: Route, c: Cursor, ds: number): Cursor {
  const n = r.points.length;
  const tg = vec3();
  for (let guard = 0; ds > 0 && guard < 32; guard++) {
    const tl = Math.max(Math.hypot(...xyz(tangent(r, c.seg, c.t, tg))), 0.05);
    const remain = (1 - c.t) * tl;
    if (ds < remain) { c.t += ds / tl; ds = 0; }
    else {
      ds -= remain; c.seg++; c.t = 0;
      if (c.seg > n - 2) { c.seg = n - 2; c.t = 1; c.finished = true; return c; }
    }
  }
  return c;
}
const xyz = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

// --- generátor trati ---------------------------------------------------------

export function buildRoute(start: Vec3, hx: number, hz: number, seed: number, rng: Rng): Route {
  const points: Vec3[] = [], meta: RouteMeta[] = [], carves: Route['carves'] = [];
  const add = (x: number, y: number, z: number, m: RouteMeta = {}): number => {
    points.push(vec3(x, clamp(y, 30, 700), z));
    meta.push(m);
    return points.length - 1;
  };
  let ux = hx, uz = hz;
  const ul = Math.hypot(ux, uz);
  if (ul < 0.1) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }

  add(start.x, start.y, start.z);
  add(start.x + ux * 80, start.y, start.z + uz * 80);

  let fx = start.x / ISLAND_GRID, fz = start.z / ISLAND_GRID;
  let curAlt = start.y, side = 1;
  const visited = new Set<string>();
  const nIslands = 10 + rng.int(0, 4);

  for (let k = 1; k <= nIslands; k++) {
    fx += ux * 1.2; fz += uz * 1.2;
    // z okolních buněk ostrov s nejmenším výškovým skokem
    const bx = Math.floor(fx + 0.5), bz = Math.floor(fz + 0.5);
    let best: Island | null = null, bestScore = Infinity, bestKey = '';
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const key = `${bx + dx}:${bz + dz}`;
      if (visited.has(key)) continue;
      const isl = islandForCell(bx + dx, bz + dz, seed);
      if (!isl) continue;
      const score = Math.abs(isl.y - curAlt) + rng.next() * 30;
      if (score < bestScore) { best = isl; bestScore = score; bestKey = key; }
    }
    if (!best) continue;
    visited.add(bestKey);
    const isl = best, prev = points[points.length - 1];
    let dvx = isl.x - prev.x, dvz = isl.z - prev.z;
    const dl = Math.max(Math.hypot(dvx, dvz), 0.1);
    dvx /= dl; dvz /= dl;
    const px = -dvz, pz = dvx;   // kolmice
    let type = SEG_TYPES[(k - 1) % SEG_TYPES.length];
    // tunel jen skrz dost velké plné ostrovy (disc je moc placatý)
    if (type === 'tunnel' && (isl.radius < 45 || isl.shape === 'disc')) type = 'slalom';
    const hint = RACE_HINTS[type];

    if (type === 'slalom') {
      side = -side;
      const off = isl.radius + 15;
      add(isl.x + px * off * side, isl.y + 12, isl.z + pz * off * side, { checkpoint: true, speed: 28, hint });
    } else if (type === 'showcase') {
      side = -side;
      const off = isl.radius + 25;
      add(isl.x + px * off * side, isl.y + 15, isl.z + pz * off * side, { checkpoint: true, speed: 26, trick: 'barrel_roll', hint });
    } else if (type === 'orbit') {
      const a0 = Math.atan2(prev.z - isl.z, prev.x - isl.x);
      const rr = isl.radius + 20, odir = side;
      side = -side;
      for (let i = 1; i <= 4; i++) {
        const a = a0 + odir * i * (1.5 * Math.PI / 4);
        add(isl.x + Math.cos(a) * rr, isl.y + 15, isl.z + Math.sin(a) * rr,
          i === 1 ? { checkpoint: true, speed: 24, hint } : { speed: 24 });
      }
    } else if (type === 'tunnel') {
      const off = isl.radius + 10;
      const i0 = add(isl.x - dvx * off, isl.y + 4, isl.z - dvz * off, { checkpoint: true, speed: 18, hint });
      add(isl.x, isl.y + 4, isl.z, { speed: 18 });
      const i1 = add(isl.x + dvx * off, isl.y + 4, isl.z + dvz * off, { speed: 22 });
      carves.push({ i0, i1, done: false });
    } else {
      add(isl.x, isl.y + isl.radius * 0.6 + 50, isl.z, { checkpoint: true, speed: 24, hint });
      add(isl.x + dvx * (isl.radius + 60), Math.max(isl.y - 60, 40), isl.z + dvz * (isl.radius + 60), { speed: 35 });
    }
    curAlt = points[points.length - 1].y;
  }
  const last = points[points.length - 1];
  add(last.x + ux * 120, last.y, last.z + uz * 120, { finish: true });
  return { points, meta, carves };
}

/** Vzorky tunelu à 1,5 m mezi body i0..i1 jako [x,y,z,…] */
export function tunnelSamples(r: Route, i0: number, i1: number): number[] {
  const out: number[] = [];
  const c: Cursor = { seg: i0, t: 0, finished: false };
  const p = vec3();
  for (let guard = 0; c.seg < i1 && guard < 600; guard++) {
    evalRoute(r, c.seg, c.t, p);
    out.push(p.x, p.y, p.z);
    advance(r, c, 1.5);
    if (c.finished) break;
  }
  const e = r.points[i1];
  out.push(e.x, e.y, e.z);
  return out;
}

// --- zajíc + stav závodu -----------------------------------------------------

export interface Rabbit {
  pos: Vec3; vel: Vec3; att: Quat;
  cur: Cursor;
  wait: boolean; waitCenter: Vec3; waitAngle: number;
  celebrate: boolean; celYaw: number; celA: number;
  yaw: number; rollS: number;
}

export class Race {
  readonly rabbit: Rabbit;
  readonly cpIndices: number[];
  cpHit = 0;
  time = 0;
  finished = false;
  /** po dojetí: zajíc ještě slaví, pak závod zmizí */
  doneTimer = 0;
  private tmp = vec3();
  private tmp2 = vec3();

  constructor(readonly route: Route, ev: SimEvent[]) {
    const c: Cursor = { seg: 0, t: 0, finished: false };
    advance(route, c, 40);   // zajíc 40 m před hráčem
    const pos = evalRoute(route, c.seg, c.t);
    this.rabbit = {
      pos, vel: vec3(), att: quat(), cur: c,
      wait: false, waitCenter: vec3(), waitAngle: 0,
      celebrate: false, celYaw: 0, celA: 0, yaw: 0, rollS: 0,
    };
    this.cpIndices = route.meta.flatMap((m, i) => (m.checkpoint ? [i] : []));
    // tunely na začátku trati vykopat hned
    for (const cv of route.carves) if (cv.i0 <= 9) this.carve(cv, ev);
  }

  get nextCheckpoint(): Vec3 {
    const i = this.cpIndices[this.cpHit];
    return this.route.points[i ?? this.route.points.length - 1];
  }

  get finishPoint(): Vec3 { return this.route.points[this.route.points.length - 1]; }

  private carve(cv: Route['carves'][number], ev: SimEvent[]): void {
    if (cv.done) return;
    cv.done = true;
    ev.push({ type: 'carve', pts: tunnelSamples(this.route, cv.i0, cv.i1), r: RACE.CARVE_R });
  }

  /** Krok závodu; vrací false, když závod skončil a má zmizet */
  step(dt: number, player: Vec3, pilot: Pilot, ev: SimEvent[]): boolean {
    if (this.finished) {
      this.doneTimer -= dt;
      this.stepRabbit(dt, player, ev);
      return this.doneTimer > 0;
    }
    this.time += dt;
    this.stepRabbit(dt, player, ev);

    const cp = this.cpIndices[this.cpHit];
    if (cp !== undefined && dist(player, this.route.points[cp]) < RACE.CHECKPOINT_RADIUS) {
      this.cpHit++;
      pilot.score += RACE.CHECKPOINT_SCORE;
      ev.push({ type: 'flash', text: `CHECKPOINT ${this.cpHit}/${this.cpIndices.length}`, color: '#66FF88' });
      ev.push({ type: 'checkpoint' });
    }
    if (dist(player, this.finishPoint) < RACE.FINISH_RADIUS) {
      this.finished = true;
      this.doneTimer = RACE.CELEBRATE_TIME;
      pilot.score += RACE.FINISH_SCORE;
      if (!this.rabbit.celebrate) this.startCelebrate();
      ev.push({ type: 'race_end', ok: true, time: this.time, cp: this.cpHit, cpTotal: this.cpIndices.length, score: Math.floor(pilot.score) });
      ev.push({ type: 'flash', text: `FINISH — ${formatTime(this.time)}  |  SCORE ${Math.floor(pilot.score)}`, color: '#66FF88' });
    }
    return true;
  }

  private startCelebrate(): void {
    const r = this.rabbit;
    r.celebrate = true; r.celYaw = r.yaw; r.celA = 0;
  }

  private stepRabbit(dt: number, player: Vec3, ev: SimEvent[]): void {
    const r = this.rabbit, route = this.route;
    if (r.celebrate) {
      // oslavné loopingy v cíli
      r.celA = (r.celA + dt * Math.PI) % (2 * Math.PI);    // 2 s na looping
      const fx = Math.sin(r.celYaw), fz = Math.cos(r.celYaw), a = r.celA;
      r.vel.x = fx * Math.cos(a) * 18; r.vel.y = Math.sin(a) * 18; r.vel.z = fz * Math.cos(a) * 18;
      r.pos.x += r.vel.x * dt; r.pos.y += r.vel.y * dt; r.pos.z += r.vel.z * dt;
      attFromEuler(r.att, r.celYaw, a, 0);
      return;
    }
    const d = dist(r.pos, player);
    if (r.wait) {
      r.waitAngle += dt * (RACE.WAIT_SPEED / RACE.WAIT_RADIUS);
      const c = r.waitCenter, tgt = this.tmp;
      tgt.x = c.x + Math.cos(r.waitAngle) * RACE.WAIT_RADIUS;
      tgt.y = c.y + Math.sin(r.waitAngle * 2) * 5;
      tgt.z = c.z + Math.sin(r.waitAngle) * RACE.WAIT_RADIUS;
      this.flyToward(tgt, RACE.WAIT_SPEED, dt, null);
      if (d < RACE.WAIT_LEAVE_DIST) r.wait = false;
      return;
    }
    if (d > RACE.WAIT_ENTER_DIST) {
      r.wait = true;
      evalRoute(route, r.cur.seg, r.cur.t, r.waitCenter);
      r.waitAngle = 0;
      ev.push({ type: 'flash', text: 'HARE WAITING — catch up!', color: '#FFD75E' });
      return;
    }
    // rubber-band: rychlost bodu trati škálovaná vzdáleností hráče
    const m = route.meta[r.cur.seg] ?? {};
    let speed = (m.speed ?? 25) * clamp(1 - (d - 60) / 200, 0.55, 1.15);
    if (d < 20) speed *= 1.2;
    const prevSeg = r.cur.seg;
    advance(route, r.cur, speed * dt);
    if (r.cur.finished) {
      this.startCelebrate();
      ev.push({ type: 'flash', text: 'HARE AT THE FINISH — fly to it!', color: '#FFD75E' });
      return;
    }
    if (r.cur.seg !== prevSeg) this.onSegment(r.cur.seg, ev);
    // korekce velké odchylky od splajny
    const cur = evalRoute(route, r.cur.seg, r.cur.t, this.tmp);
    if (dist(r.pos, cur) > 10) { r.pos.x = cur.x; r.pos.y = cur.y; r.pos.z = cur.z; }
    // leť k bodu ~0,15 s před sebou
    const ah: Cursor = { seg: r.cur.seg, t: r.cur.t, finished: false };
    advance(route, ah, Math.max(speed * 0.15, 3));
    const ahead = evalRoute(route, ah.seg, ah.t, this.tmp2);
    this.flyToward(ahead, speed, dt, m.trick === 'barrel_roll' ? 2 * Math.PI * r.cur.t : null);
  }

  private flyToward(tgt: Vec3, speed: number, dt: number, forcedRoll: number | null): void {
    const r = this.rabbit;
    const tx = tgt.x - r.pos.x, ty = tgt.y - r.pos.y, tz = tgt.z - r.pos.z;
    const l = Math.hypot(tx, ty, tz);
    if (l > 0.05) { r.vel.x = tx * speed / l; r.vel.y = ty * speed / l; r.vel.z = tz * speed / l; }
    r.pos.x += r.vel.x * dt; r.pos.y += r.vel.y * dt; r.pos.z += r.vel.z * dt;
    // orientace z rychlosti, náklon z rychlosti zatáčení (vyhlazený)
    const hl = Math.hypot(r.vel.x, r.vel.z);
    if (hl < 0.05) return;
    const yaw = Math.atan2(r.vel.x, r.vel.z);
    let roll: number;
    if (forcedRoll !== null) { roll = forcedRoll; r.rollS = 0; }
    else {
      const rate = wrapAngle(yaw - r.yaw) / Math.max(dt, 0.01);
      r.rollS += (clamp(rate * 0.6, -1.2, 1.2) - r.rollS) * Math.min(dt * 5, 1);
      roll = r.rollS;
    }
    r.yaw = yaw;
    attFromEuler(r.att, yaw, Math.atan2(r.vel.y, hl), roll);
  }

  /** Zajíc vstoupil do segmentu: hint, tunely v horizontu 6 bodů */
  private onSegment(seg: number, ev: SimEvent[]): void {
    const m = this.route.meta[seg];
    if (m?.hint && !m.hintShown) {
      m.hintShown = true;
      ev.push({ type: 'flash', text: m.hint, color: '#9FD8FF' });
    }
    for (const cv of this.route.carves) if (!cv.done && seg >= cv.i0 - 6) this.carve(cv, ev);
  }
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

/** Nový závod z pozice a kurzu lodi */
export function startRace(pos: Vec3, hx: number, hz: number, seed: number, salt: number, ev: SimEvent[]): Race {
  const route = buildRoute(pos, hx, hz, seed, new Rng((seed ^ salt) >>> 0));
  ev.push({ type: 'flash', text: 'RACE! Follow the golden hare!', color: '#FFD75E' });
  return new Race(route, ev);
}

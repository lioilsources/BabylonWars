import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/sim/constants';
import { Creatures, SPECIES_NAMES } from '../src/sim/creatures';
import { attFromEuler } from '../src/sim/flight';
import { emptyInput } from '../src/sim/input';
import { vec3 } from '../src/sim/math';
import { advance, buildRoute, evalRoute, formatTime, Race } from '../src/sim/race';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/tricks';
import { WEAPON } from '../src/sim/weapons';
import type { WorldQuery } from '../src/sim/world-query';
import { Rng } from '../src/gen/features';
import { cachedIsland, islandForCell } from '../src/gen/islands';
import { carveCapsule } from '../src/voxel/carve';
import { AIR, nodeId } from '../src/voxel/registry';
import { newSweep, sweepSphere } from '../src/voxel/sweep';

const STONE = nodeId('dw_nodes:stone'), WATER = nodeId('dw_nodes:water_source'), GRASS = nodeId('dw_nodes:grass_1');

function flatWorld(floorY = -1e9): WorldQuery {
  const solid = (_x: number, y: number): boolean => Math.round(y) <= floorY;
  const sw = newSweep();
  return {
    isSolid: solid,
    sweep: (fx, fy, fz, tx, ty, tz, r) => sweepSphere(solid, fx, fy, fz, tx, ty, tz, r, 0.5, sw),
    spawnNear: () => ({ x: 0, y: 500, z: 0, yaw: 0 }),
  };
}

describe('ničení terénu (carve_capsule)', () => {
  it('koule a kapsle vykopou pevné nody, kapaliny nechají', () => {
    // pod y=0 kámen, ve sloupci x=0,z=0 voda, nad kamenem tráva
    const w = { nodeAt: (x: number, y: number, z: number) => (y > 0 ? (y === 1 ? GRASS : AIR) : x === 0 && z === 0 ? WATER : STONE) };
    const ball = carveCapsule(w, 5, 0, 5, 5, 0, 5, 4);
    const n = ball.removed.length / 4;
    // polokoule r=4 pod povrchem (y ≤ 0): ~ 2/3·π·64 ≈ 134 ± mřížka
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThan(200);
    for (let i = 3; i < ball.removed.length; i += 4) expect([STONE, GRASS]).toContain(ball.removed[i]);
    // tráva nad vykopaným kamenem shoří s ním
    expect(ball.batch.some((_, i) => i % 4 === 1 && ball.batch[i] === 1)).toBe(true);
    const cap = carveCapsule(w, -20, 0, 0, 20, 0, 0, 2);
    for (let i = 0; i < cap.removed.length; i += 4) {
      expect(cap.removed[i] === 0 && cap.removed[i + 1] <= 0 && cap.removed[i + 2] === 0).toBe(false);   // voda zůstala
    }
    expect(cap.removed.length / 4).toBeGreaterThan(ball.removed.length / 4);
  });
});

describe('střely', () => {
  it('kulka letí z nosu a zásah hlásí bod a směr', () => {
    const sim = new Sim(flatWorld(400), { x: 0, y: 450, z: 0, yaw: 0 }, 'fighter', 'free');
    attFromEuler(sim.ship.att, 0, -Math.PI / 2 + 0.1, 0);   // nos skoro dolů
    const inp = emptyInput();
    inp.fire = true;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 60 && !ev.some((e) => e.type === 'impact'); i++) {
      sim.tick(inp, 1);
      ev.push(...sim.events);
      sim.events.length = 0;
      attFromEuler(sim.ship.att, 0, -Math.PI / 2 + 0.1, 0);
      sim.ship.pos.y = 450;
    }
    const shots = ev.filter((e) => e.type === 'shot');
    expect(shots.length).toBeGreaterThan(1);
    const hit = ev.find((e) => e.type === 'impact');
    expect(hit && hit.type === 'impact' && hit.dy < -0.9).toBe(true);
    if (hit?.type === 'impact') expect(hit.y).toBeGreaterThan(399.4);
    // cooldown 0.15 s → max ~7 ran za 1 s
    expect(shots.length).toBeLessThanOrEqual(Math.ceil(1 / WEAPON.COOLDOWN) + 1);
  });
});

describe('chrtí závod', () => {
  const seed = 42;
  const home = islandForCell(0, 0, seed)!;
  const start = vec3(home.x, home.y + 120, home.z);

  it('trať je deterministická a končí cílem', () => {
    const a = buildRoute(start, 1, 0.3, seed, new Rng(7)), b = buildRoute(start, 1, 0.3, seed, new Rng(7));
    expect(a.points).toEqual(b.points);
    expect(a.meta[a.meta.length - 1].finish).toBe(true);
    expect(a.meta.filter((m) => m.checkpoint).length).toBeGreaterThanOrEqual(8);
    for (const p of a.points) { expect(p.y).toBeGreaterThanOrEqual(30); expect(p.y).toBeLessThanOrEqual(700); }
    // splajna prochází body
    const p = evalRoute(a, 3, 0);
    expect(Math.hypot(p.x - a.points[3].x, p.y - a.points[3].y, p.z - a.points[3].z)).toBeLessThan(1e-6);
    const c = { seg: 0, t: 0, finished: false };
    advance(a, c, 1e6);
    expect(c.finished).toBe(true);
    expect(formatTime(83.44)).toBe('1:23.4');
  });

  it('/race dojede do cíle: hráč za zajícem projde všechny checkpointy', () => {
    const route = buildRoute(start, 0.6, -0.8, seed, new Rng(3));
    const ev: SimEvent[] = [];
    const race = new Race(route, ev);
    const pilot = { score: 0 } as Parameters<Race['step']>[2];
    const player = vec3(start.x, start.y, start.z);
    let ok = false;
    for (let i = 0; i < 60 * 600 && !ok; i++) {
      race.step(TICK_DT, player, pilot, ev);
      // hráč letí 10 m za zajícem (přesně po jeho dráze s malým zpožděním)
      const r = race.rabbit.pos;
      const dx = r.x - player.x, dy = r.y - player.y, dz = r.z - player.z, d = Math.hypot(dx, dy, dz);
      if (d > 8) { const k = Math.min(1, (d - 8) / d); player.x += dx * k; player.y += dy * k; player.z += dz * k; }
      ok = race.finished;
    }
    expect(ok).toBe(true);
    expect(race.cpHit).toBe(race.cpIndices.length);
    expect(ev.some((e) => e.type === 'race_end' && e.ok)).toBe(true);
    expect(pilot.score).toBe(race.cpIndices.length * 50 + 500);
    // tunely se vykopou (událost carve), pokud trať nějaký má
    expect(ev.filter((e) => e.type === 'carve').length).toBe(route.carves.length);
  });

  it('zajíc čeká, když hráč zaostane', () => {
    const route = buildRoute(start, 1, 0, seed, new Rng(1));
    const ev: SimEvent[] = [];
    const race = new Race(route, ev);
    const pilot = { score: 0 } as Parameters<Race['step']>[2];
    const player = vec3(start.x - 500, start.y, start.z);
    for (let i = 0; i < 60; i++) race.step(TICK_DT, player, pilot, ev);
    expect(race.rabbit.wait).toBe(true);
    expect(ev.some((e) => e.type === 'flash' && e.text.startsWith('HARE WAITING'))).toBe(true);
  });

  it('smrt během závodu závod ukončí', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'free', seed);
    sim.startRace();
    expect(sim.race).not.toBeNull();
    sim.damage(1000);
    expect(sim.race).toBeNull();
    expect(sim.events.some((e) => e.type === 'race_end' && !e.ok)).toBe(true);
  });
});

describe('monstra', () => {
  it('u ostrova se objeví osazenstvo biomu a létá bez NaN', () => {
    const seed = 42;
    let isl = null;
    for (let cx = -4; cx <= 4 && !isl; cx++) for (let cz = -4; cz <= 4 && !isl; cz++) {
      const i = cachedIsland(cx, cz, seed);
      if (i && i.biome.name === 'volcanic') isl = i;
    }
    const target = isl ?? islandForCell(0, 0, seed)!;
    const cr = new Creatures(() => false, seed);
    const p = vec3(target.x, target.y + 50, target.z);
    for (let i = 0; i < 60 * 20; i++) cr.step(TICK_DT, p);
    expect(cr.count).toBeGreaterThan(0);
    for (const c of cr.list) {
      expect(Number.isFinite(c.pos.x + c.pos.y + c.pos.z)).toBe(true);
      for (const s of c.segs) expect(Math.hypot(s.pos.x - c.pos.x, s.pos.y - c.pos.y, s.pos.z - c.pos.z)).toBeLessThan(c.def.spacing * (c.segs.length + 3) * 2);
    }
    // ruční spawn libovolného druhu
    for (const sp of SPECIES_NAMES) expect(cr.spawn(sp, p.x, p.y, p.z)).not.toBeNull();
    // daleko od hráče se uklidí (kromě velryby, ta má vlastní dosah)
    for (let i = 0; i < 60 * 4; i++) cr.step(TICK_DT, vec3(p.x + 5000, p.y, p.z));
    expect(cr.list.filter((c) => c.species !== 'whale').length).toBe(0);
  });
});

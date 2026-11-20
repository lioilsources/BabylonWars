import { describe, expect, it } from 'vitest';
import { integrateAttitude, cameraAttitude, bankAngle, attFromEuler, headingAngle, pitchAngle } from '../src/sim/flight';
import { BTN, emptyInput, type InputFrame } from '../src/sim/input';
import { qaxis, qlen, quat, vec3 } from '../src/sim/math';
import { Sim } from '../src/sim/sim';
import { sweepSphere, newSweep } from '../src/voxel/sweep';
import type { WorldQuery } from '../src/sim/world-query';
import { TICK_DT } from '../src/sim/constants';

const fwd = vec3(), right = vec3(), up = vec3();
const DT = TICK_DT;

// svět: podlaha y <= floorY, jinak vzduch
function flatWorld(floorY = -1e9): WorldQuery {
  const solid = (_x: number, y: number): boolean => Math.round(y) <= floorY;
  const sw = newSweep();
  return {
    isSolid: solid,
    sweep: (fx, fy, fz, tx, ty, tz, r) => sweepSphere(solid, fx, fy, fz, tx, ty, tz, r, 0.5, sw),
    spawnNear: () => ({ x: 0, y: 500, z: 0, yaw: 0 }),
  };
}
const run = (sim: Sim, n: number, f: (i: InputFrame, t: number) => void = () => {}): void => {
  const inp = emptyInput();
  for (let t = 0; t < n; t++) { Object.assign(inp, emptyInput()); f(inp, t); sim.tick(inp, 1); }
};

describe('let: znaménka podle chování', () => {
  it('kladný pitch zvedá nos', () => {
    const q = quat(); integrateAttitude(q, 1, 0, 0, 0.1);
    expect(qaxis(fwd, q, 2).y).toBeGreaterThan(0);
  });
  it('kladný roll pokládá pravé křídlo', () => {
    const q = quat(); integrateAttitude(q, 0, 0, 1, 0.1);
    expect(qaxis(right, q, 0).y).toBeLessThan(0);
    expect(bankAngle(q)).toBeGreaterThan(0);
  });
  it('kladný yaw stáčí nos doprava', () => {
    const q = quat(); integrateAttitude(q, 0, 1, 0, 0.1);
    expect(qaxis(fwd, q, 2).x).toBeGreaterThan(0);
  });
  it('looping a výkrut se vrátí do výchozí orientace', () => {
    for (const axis of [0, 2]) {
      const q = quat();
      const rate = 1.3, steps = 1000, dt = (2 * Math.PI / rate) / steps;
      for (let i = 0; i < steps; i++) integrateAttitude(q, axis === 0 ? rate : 0, 0, axis === 2 ? rate : 0, dt);
      const d = Math.min(Math.hypot(q.x, q.y, q.z, q.w - 1), Math.hypot(q.x, q.y, q.z, q.w + 1));
      expect(d).toBeLessThan(1e-6);
    }
  });
  it('|att| = 1 po 10^6 krocích', () => {
    const q = quat();
    for (let i = 0; i < 1_000_000; i++) integrateAttitude(q, 0.7, -0.3, 1.1, DT);
    expect(Math.abs(qlen(q) - 1)).toBeLessThan(1e-9);
  });
  it('Euler (classic) sedí s konvencemi kvaternionu', () => {
    const q = quat();
    attFromEuler(q, 0.7, 0.3, 0.4);
    expect(headingAngle(q)).toBeCloseTo(0.7, 9);
    expect(pitchAngle(q)).toBeCloseTo(0.3, 9);
    expect(bankAngle(q)).toBeCloseTo(0.4, 9);
  });
});

describe('free: looping tahem za myš', () => {
  it('stálý tah nahoru udělá celou smyčku a boduje LOOPING', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'free');
    let inverted = false;
    run(sim, 60 * 12, (i) => {
      i.aimDY = 1.6 * DT;
      qaxis(up, sim.ship.att, 1);
      if (up.y < -0.9) inverted = true;
    });
    expect(inverted).toBe(true);
    expect(sim.pilot.score).toBeGreaterThanOrEqual(200);
  });
  it('kamera s tilt=0 drží horizont, s tilt=1 kopíruje roll', () => {
    const q = quat(), cam = quat();
    integrateAttitude(q, 0, 0, 1, 0.8);
    cameraAttitude(cam, q, 0);
    expect(Math.abs(qaxis(right, cam, 0).y)).toBeLessThan(1e-9);
    cameraAttitude(cam, q, 1);
    expect(qaxis(right, cam, 0).y).toBeCloseTo(qaxis(up, q, 0).y, 9);
  });
  it('direct: ruční výkrut Q/E boduje BARREL ROLL', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'direct');
    run(sim, 60 * 4, (i) => { i.roll = 1; });
    expect(sim.pilot.score).toBeGreaterThanOrEqual(100);
  });
});

describe('classic (vehicle.lua 1:1)', () => {
  it('zaměřovač doprava → loď se dotáčí a naklání do zatáčky', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'classic');
    run(sim, 1, (i) => { i.aimDX = 1.0; });
    run(sim, 20);
    expect(sim.ship.heading).toBeGreaterThan(0);
    expect(bankAngle(sim.ship.att)).toBeGreaterThan(0.2);
    run(sim, 120);
    expect(sim.ship.heading).toBeCloseTo(1.0, 2);
  });
  it('sklon je omezený PITCH_MAX', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'classic');
    run(sim, 1, (i) => { i.aimDY = 1.5; });
    run(sim, 120);
    expect(pitchAngle(sim.ship.att)).toBeCloseTo(0.6, 3);
  });
  it('dvojťuk D = skriptovaný výkrut s nesmrtelností a bodováním', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'classic');
    const seq = [BTN.RIGHT, 0, 0, BTN.RIGHT];
    run(sim, 4, (i, t) => { i.buttons = seq[t]; });
    expect(sim.ship.trick?.name).toBe('barrel_roll');
    expect(sim.ship.iframes).toBeGreaterThan(0.9);
    run(sim, 60);
    expect(sim.ship.trick).toBeNull();
    expect(sim.pilot.score).toBe(100);
  });
  it('držet Space nad 25 m/s = looping; komba se násobí', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'classic');
    sim.ship.speed = 40; sim.ship.boostTime = 0;
    run(sim, 55, (i) => { i.buttons = BTN.JUMP; i.thrust = 1; });
    expect(sim.ship.trick?.name).toBe('loop');
    run(sim, 100);
    expect(sim.pilot.score).toBe(200);
    // druhý trik v okně komba → ×2
    const seq = [BTN.LEFT, 0, 0, BTN.LEFT];
    run(sim, 4, (i, t) => { i.buttons = seq[t]; });
    run(sim, 60);
    expect(sim.pilot.score).toBe(200 + 200);
  });
});

describe('boost, ponorka, kolize', () => {
  it('boost stojí 25 % metru a drží 60 m/s 2 s', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'free');
    run(sim, 2, (i, t) => { i.buttons = t === 0 ? BTN.PLACE : 0; });
    expect(sim.ship.boostMeter).toBe(25);
    expect(sim.ship.speed).toBe(60);
    run(sim, 130);
    expect(sim.ship.speed).toBeLessThan(60);
  });
  it('ponorka visí na místě bez vstupu a jede tahem', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'sub', 'free');
    run(sim, 60);
    expect(sim.ship.pos.z).toBeCloseTo(0, 6);
    run(sim, 120, (i) => { i.thrust = 1; });
    expect(sim.ship.speed).toBeCloseTo(20, 3);
    expect(sim.ship.pos.z).toBeGreaterThan(20);
    run(sim, 120);
    expect(sim.ship.speed).toBeLessThan(1e-6);
  });
  it('náraz do země v rychlosti = poškození, pomalé škrtnutí zdarma', () => {
    const sim = new Sim(flatWorld(400), { x: 0, y: 420, z: 0, yaw: 0 }, 'fighter', 'direct');
    sim.ship.speed = 40;
    run(sim, 120, (i, t) => { i.aimDY = t < 30 ? -0.03 : 0; });
    expect(sim.ship.hp).toBeLessThan(100);
    expect(sim.ship.pos.y).toBeGreaterThan(400.5 + 1.5 - 0.6);
  });
  it('zničení → exploze → respawn po 3 s', () => {
    const sim = new Sim(flatWorld(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'free');
    sim.pilot.score = 123;
    sim.damage(150, true);
    expect(sim.dead).toBe(true);
    expect(sim.events.some((e) => e.type === 'explode')).toBe(true);
    run(sim, 3 * 60 + 2);
    expect(sim.dead).toBe(false);
    expect(sim.ship.hp).toBe(100);
    expect(sim.pilot.score).toBe(123);
  });
});

describe('spawn', () => {
  it('spawn v terénu se vytáhne nad povrch', () => {
    const sim = new Sim(flatWorld(500), { x: 0, y: 480, z: 0, yaw: 0 }, 'sub', 'free');
    expect(sim.ship.pos.y).toBeGreaterThan(502);
  });
});

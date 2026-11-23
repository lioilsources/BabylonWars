// Řízení „myš jako joystick“, stíhačka 6DoF a vrták s nádrží.
import { describe, expect, it } from 'vitest';
import { STICK, SPACE } from '../src/sim/flight';
import { BTN, emptyInput, type InputFrame } from '../src/sim/input';
import { qaxis, vec3 } from '../src/sim/math';
import { Sim } from '../src/sim/sim';
import { WEAPON } from '../src/sim/weapons';
import { sweepSphere, newSweep } from '../src/voxel/sweep';
import type { WorldQuery } from '../src/sim/world-query';

const air = (): WorldQuery => {
  const solid = (): boolean => false;
  const sw = newSweep();
  return {
    isSolid: solid,
    sweep: (fx, fy, fz, tx, ty, tz, r) => sweepSphere(solid, fx, fy, fz, tx, ty, tz, r, 0.5, sw),
    spawnNear: () => ({ x: 0, y: 500, z: 0, yaw: 0 }),
  };
};
const run = (sim: Sim, n: number, f: (i: InputFrame, t: number) => void = () => {}): void => {
  const inp = emptyInput();
  for (let t = 0; t < n; t++) { Object.assign(inp, emptyInput()); f(inp, t); sim.tick(inp, 1); }
};
const fwd = vec3(), right = vec3();

describe('myš jako joystick', () => {
  it('jedno posunutí myší nahoru drží looping bez dalšího pohybu', () => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'stick');
    run(sim, 1, (i) => { i.aimDY = STICK.RANGE; });
    expect(sim.ship.stickY).toBeCloseTo(1);
    let minFy = 1, maxUpside = 0;
    run(sim, 150, () => {
      qaxis(fwd, sim.ship.att, 2); minFy = Math.min(minFy, fwd.z);
      maxUpside = Math.max(maxUpside, -qaxis(right, sim.ship.att, 1).y);
    });
    // nos se otočil dozadu a loď byla hlavou dolů = půl loopingu a víc
    expect(minFy).toBeLessThan(-0.9);
    expect(maxUpside).toBeGreaterThan(0.9);
  });
  it('rychlost otáčení roste s výchylkou, mrtvá zóna u středu', () => {
    const rate = (d: number): number => {
      const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'stick');
      run(sim, 1, (i) => { i.aimDX = d * STICK.RANGE; });
      run(sim, 20);
      return Math.atan2(qaxis(fwd, sim.ship.att, 2).x, fwd.z);
    };
    expect(rate(STICK.DEADZONE / 2)).toBeCloseTo(0, 5);
    expect(rate(1)).toBeGreaterThan(rate(0.5) * 1.5);
    expect(rate(0.5)).toBeGreaterThan(0);
  });
  it('výchylka je omezená na kruh', () => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'stick');
    run(sim, 1, (i) => { i.aimDX = 5; i.aimDY = 5; });
    expect(Math.hypot(sim.ship.stickX, sim.ship.stickY)).toBeCloseTo(1);
  });
});

describe('stíhačka 6DoF', () => {
  it('A/D úkrok posouvá do strany bez otáčení', () => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'space', 'direct');
    run(sim, 120, (i) => { i.strafe = 1; });
    const s = sim.ship;
    expect(s.pos.x).toBeGreaterThan(20);
    expect(Math.abs(s.pos.z)).toBeLessThan(0.5);
    expect(qaxis(fwd, s.att, 2).z).toBeCloseTo(1, 5);
    expect(Math.hypot(s.vel.x, s.vel.y, s.vel.z)).toBeCloseTo(SPACE.SWAY, 0);
  });
  it('Space/Shift heave po ose trupu, W vpřed, puštěné klávesy zabrzdí', () => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'space', 'direct');
    run(sim, 120, (i) => { i.vertical = 1; i.thrust = 1; });
    expect(sim.ship.pos.y).toBeGreaterThan(520);
    expect(sim.ship.pos.z).toBeGreaterThan(30);
    run(sim, 180);
    expect(sim.ship.speed).toBeLessThan(0.01);
  });
  it('Q/E výkrut bez auto-vyrovnání', () => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'space', 'direct');
    run(sim, 30, (i) => { i.roll = 1; });
    const r1 = qaxis(right, sim.ship.att, 0).y;
    run(sim, 120);
    expect(r1).toBeLessThan(-0.5);
    expect(qaxis(right, sim.ship.att, 0).y).toBeCloseTo(r1, 5);
  });
});

describe('vrták', () => {
  it('vydrží krátce, pak se nabije; dělá širší díry než kanón', () => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'space', 'direct');
    const w = sim.weapons;
    expect(w.weapon).toBe('gun');
    expect(w.cycle()).toBe('drill');
    let shots = 0;
    const count = (): void => { for (const e of sim.events) if (e.type === 'shot') shots++; sim.events.length = 0; };
    run(sim, 60 * 4, (i) => { i.fire = true; count(); });
    count();
    expect(w.drill).toBe(0);
    // po vyprázdnění nádrže už nestřílí (2,2 s palby ≈ 20 ran)
    expect(shots).toBeLessThan(Math.ceil(1 / WEAPON.DRILL_DRAIN / WEAPON.DRILL_COOLDOWN) + 2);
    run(sim, 60 * 12);
    expect(w.drill).toBe(1);
    expect(WEAPON.DRILL_RADIUS).toBeGreaterThan(WEAPON.GUN_RADIUS * 2);
  });
  it('kanón střílí bez omezení a nádrž neubírá', () => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'free');
    run(sim, 600, (i) => { i.fire = true; });
    expect(sim.weapons.drill).toBe(1);
  });
});

describe('boost omylem', () => {
  const pulses = (stick: boolean): number => {
    const sim = new Sim(air(), { x: 0, y: 500, z: 0, yaw: 0 }, 'fighter', 'free');
    // dvakrát rychle plyn dopředu (≈ dvojťuk W)
    run(sim, 40, (i, t) => {
      const on = t < 6 || (t >= 12 && t < 18);
      if (on) { i.thrust = 1; i.buttons |= BTN.UP; i.stickThrottle = stick; }
    });
    return sim.ship.boostTime;
  };
  it('dvojťuk W na klávesnici boostne, dvojí přitlačení páčky ne', () => {
    expect(pulses(false)).toBeGreaterThan(0);
    expect(pulses(true)).toBe(0);
  });
});

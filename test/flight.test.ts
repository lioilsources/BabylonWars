import { describe, expect, it } from 'vitest';
import { integrateAttitude, createShip, stepFighter, cameraAttitude, bankAngle } from '../src/sim/flight';
import { emptyInput } from '../src/sim/input';
import { qaxis, qlen, quat, vec3 } from '../src/sim/math';

const fwd = vec3(), right = vec3(), up = vec3();
const DT = 1 / 60;

describe('let: znaménka podle chování', () => {
  it('kladný pitch zvedá nos', () => {
    const q = quat();
    integrateAttitude(q, 1, 0, 0, 0.1);
    expect(qaxis(fwd, q, 2).y).toBeGreaterThan(0);
  });
  it('kladný roll pokládá pravé křídlo', () => {
    const q = quat();
    integrateAttitude(q, 0, 0, 1, 0.1);
    expect(qaxis(right, q, 0).y).toBeLessThan(0);
    expect(bankAngle(q)).toBeGreaterThan(0);
  });
  it('kladný yaw stáčí nos doprava', () => {
    const q = quat();
    integrateAttitude(q, 0, 1, 0, 0.1);
    expect(qaxis(fwd, q, 2).x).toBeGreaterThan(0);
  });
  it('looping a výkrut se vrátí do výchozí orientace', () => {
    for (const axis of [0, 2]) {
      const q = quat();
      const rate = 1.3, steps = 1000, dt = (2 * Math.PI / rate) / steps;
      for (let i = 0; i < steps; i++) integrateAttitude(q, axis === 0 ? rate : 0, 0, axis === 2 ? rate : 0, dt);
      // q a −q jsou stejná orientace
      const d = Math.min(Math.hypot(q.x, q.y, q.z, q.w - 1), Math.hypot(q.x, q.y, q.z, q.w + 1));
      expect(d).toBeLessThan(1e-6);
    }
  });
  it('|att| = 1 po 10^6 krocích', () => {
    const q = quat();
    for (let i = 0; i < 1_000_000; i++) integrateAttitude(q, 0.7, -0.3, 1.1, DT);
    expect(Math.abs(qlen(q) - 1)).toBeLessThan(1e-9);
  });
});

describe('free: looping tahem za myš', () => {
  it('stálý tah nahoru udělá celou smyčku', () => {
    const s = createShip(vec3(0, 300, 0));
    s.control = 'free';
    const inp = emptyInput();
    let maxUpY = 0, minUpY = 1, sawInverted = false;
    for (let t = 0; t < 60 * 12; t++) {
      inp.aimDY = 1.6 * DT;
      stepFighter(s, inp, DT, 1);
      qaxis(up, s.att, 1);
      maxUpY = Math.max(maxUpY, up.y); minUpY = Math.min(minUpY, up.y);
      if (up.y < -0.9) sawInverted = true;
    }
    expect(sawInverted).toBe(true);
  });
  it('kamera s tilt=0 drží horizont, s tilt=1 kopíruje roll', () => {
    const q = quat(), cam = quat();
    integrateAttitude(q, 0, 0, 1, 0.8);
    cameraAttitude(cam, q, 0);
    expect(Math.abs(qaxis(right, cam, 0).y)).toBeLessThan(1e-9);
    cameraAttitude(cam, q, 1);
    expect(qaxis(right, cam, 0).y).toBeCloseTo(qaxis(up, q, 0).y, 9);
  });
});

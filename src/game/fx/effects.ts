// Předvolby částic z Lua (weapons.lua fire_burst, tracer, monsters.lua FX,
// rabbit.lua trail, race.lua spawn_ring). Velikost částice: Luanti size × PSIZE m.
import type { Fx } from '../../sim/creatures';
import { colorize, ENGINE, hex, type Particles } from './particles';

const PSIZE = 0.3;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

type RGB = [number, number, number];
interface Spawner {
  amount: number;
  minpos: number; maxpos: number;       // rozptyl kolem středu (± v metrech; y může mít jiný)
  ymin?: number; ymax?: number;
  minvel: [number, number, number]; maxvel: [number, number, number];
  acc?: [number, number];               // min/max gravitace (y)
  exp: [number, number];
  size: [number, number];
  color: RGB;
}

export class Effects {
  constructor(private p: Particles) {}

  private spawn(x: number, y: number, z: number, s: Spawner): void {
    for (let i = 0; i < s.amount; i++) {
      const life = rnd(s.exp[0], s.exp[1]);
      this.p.emit({
        x: x + rnd(s.minpos, s.maxpos), y: y + rnd(s.ymin ?? s.minpos, s.ymax ?? s.maxpos), z: z + rnd(s.minpos, s.maxpos),
        vx: rnd(s.minvel[0], s.maxvel[0]), vy: rnd(s.minvel[1], s.maxvel[1]), vz: rnd(s.minvel[2], s.maxvel[2]),
        ay: s.acc ? rnd(s.acc[0], s.acc[1]) : 0,
        life, size: rnd(s.size[0], s.size[1]) * PSIZE,
        r: s.color[0], g: s.color[1], b: s.color[2],
      });
    }
  }

  private one(x: number, y: number, z: number, life: number, size: number, c: RGB, vx = 0, vy = 0, vz = 0, ay = 0): void {
    this.p.emit({ x, y, z, vx, vy, vz, ay, life, size: size * PSIZE, r: c[0], g: c[1], b: c[2] });
  }

  /** weapons.lua fire_burst: výbuch ohně */
  fireBurst(x: number, y: number, z: number): void {
    this.spawn(x, y, z, {
      amount: 60, minpos: -0.5, maxpos: 0.5, minvel: [-15, -10, -15], maxvel: [15, 22, 15], acc: [-14, -8],
      exp: [0.3, 1.5], size: [1.5, 5], color: ENGINE,
    });
  }

  tracer(x: number, y: number, z: number): void { this.one(x, y, z, 0.1, 0.8, ENGINE); }
  bullet(x: number, y: number, z: number): void { this.one(x, y, z, 0.02, 1.2, [1, 0.95, 0.7]); }
  muzzle(x: number, y: number, z: number): void { this.one(x, y, z, 0.08, 2, ENGINE); }
  /** dopad sutiny */
  puff(x: number, y: number, z: number): void { this.one(x, y, z, 0.4, 2.5, ENGINE, 0, 0, 0, -6); }

  /** rabbit.lua trail: zlatá stopa zajíce */
  trail(x: number, y: number, z: number): void {
    this.spawn(x, y, z, {
      amount: 6, minpos: -0.3, maxpos: 0.3, minvel: [0, -0.5, 0], maxvel: [0, 0.5, 0], exp: [0.5, 1.2], size: [1, 2.5],
      color: colorize(ENGINE, '#ffd75e', 180),
    });
  }

  /** race.lua spawn_ring: zelený prstenec kolmý na trať (tečna tx,ty,tz) */
  ring(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
    let tl = Math.hypot(tx, ty, tz);
    if (tl < 0.05) { tx = 1; ty = 0; tz = 0; tl = 1; }
    tx /= tl; ty /= tl; tz /= tl;
    // u = T × up, v = T × u
    let ux = -tz, uy = 0, uz = tx;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 0.1) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    const c = colorize(ENGINE, '#66ff88', 180);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * 2 * Math.PI, ca = Math.cos(a) * 7, sa = Math.sin(a) * 7;
      this.one(x + ux * ca + vx * sa, y + uy * ca + vy * sa, z + uz * ca + vz * sa, 2, 2.5, c);
    }
  }

  /** monsters.lua FX živlů */
  creature(fx: Fx, x: number, y: number, z: number): void {
    const base = { minpos: -0.6, maxpos: 0.6, ymin: -0.4, ymax: 0.6, exp: [0.4, 1.2] as [number, number], size: [1, 2.2] as [number, number] };
    const drop = (c: string, a: number): RGB => colorize(hex('#1a1b1b'), c, a);
    switch (fx) {
      case 'fire': this.spawn(x, y, z, { ...base, amount: 6, minvel: [-0.4, 0.8, -0.4], maxvel: [0.4, 2.2, 0.4], color: colorize(ENGINE, '#ff6a28', 200) }); break;
      case 'ice': this.spawn(x, y, z, { ...base, amount: 4, minvel: [-0.6, -0.8, -0.6], maxvel: [0.6, 0.2, 0.6], size: [1, 1.4], color: colorize(ENGINE, '#dff4ff', 220) }); break;
      case 'water': this.spawn(x, y, z, { ...base, amount: 4, minvel: [-0.3, -2.5, -0.3], maxvel: [0.3, -0.8, 0.3], size: [0.4, 0.9], color: drop('#4fd8e8', 160) }); break;
      case 'mud': this.spawn(x, y, z, { ...base, amount: 4, minvel: [-0.2, -3, -0.2], maxvel: [0.2, -1, 0.2], size: [0.5, 0.9], color: drop('#7a5c30', 220) }); break;
      case 'electric': this.spawn(x, y, z, { ...base, amount: 8, minvel: [-3, -3, -3], maxvel: [3, 3, 3], exp: [0.1, 0.3], size: [0.6, 1.2], color: colorize(ENGINE, '#ffe94a', 255) }); break;
      case 'dust': this.spawn(x, y, z, { ...base, amount: 10, minvel: [-1.5, 0.5, -1.5], maxvel: [1.5, 2.5, 1.5], exp: [0.4, 0.8], size: [1, 2.8], color: colorize(ENGINE, '#d8c07a', 180) }); break;
      case 'spore': this.spawn(x, y, z, { ...base, amount: 2, minvel: [-0.3, -0.6, -0.3], maxvel: [0.3, 0.1, 0.3], size: [1, 1.2], color: [120 / 255, 90 / 255, 140 / 255] }); break;
      case 'blow': this.spawn(x, y + 1.5, z, { ...base, amount: 20, minvel: [-0.5, 4, -0.5], maxvel: [0.5, 8, 0.5], exp: [0.4, 1], size: [1, 2.5], color: colorize(ENGINE, '#cfe8f8', 200) }); break;
    }
  }
}

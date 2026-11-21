// Letový HUD podle hud.lua: kompasová páska (±60° po 15°), kurz, panel
// SPD/ALT/VS, statbary trupu (20 dílků) a boostu (10), skóre s kombem,
// sklon/náklon, vodováha, radar a flash hlášky (1.2 s).
import type { Sim } from '../../sim/sim';
import { bankAngle, headingAngle, pitchAngle } from '../../sim/flight';
import { formatTime } from '../../sim/race';
import { t, tFlash } from '../i18n';
import { Level } from './level';
import { Radar, type Blip } from './radar';

// Záměrně bez překladu (hud.lua: páska se skládá po znacích)
const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

export function compassTape(heading: number): string {
  const base = Math.floor(heading / 15 + 0.5) * 15;
  let out = '';
  for (let off = -60; off <= 60; off += 15) {
    const a = (((base + off) % 360) + 360) % 360;
    let label = CARDINALS[a] ?? '·';
    if (label.length === 1) label += ' ';
    out += off === 0 ? `[${label}]` : ` ${label} `;
  }
  return out;
}

const COMBO_WINDOW = 4;

export class Hud {
  private flashEl: HTMLElement;
  private flashT = 0;
  private compass: HTMLElement;
  private heading: HTMLElement;
  private speed: HTMLElement;
  private score: HTMLElement;
  private bank: HTMLElement;
  private hull: HTMLElement[] = [];
  private boost: HTMLElement[] = [];
  private boostRow: HTMLElement;
  private level: Level;
  readonly radar: Radar;
  private raceTimer: HTMLElement;
  private raceInfo: HTMLElement;
  /** značka dalšího checkpointu (race_wp) */
  readonly raceWp: HTMLElement;
  private last = new Map<HTMLElement, string>();

  constructor(root: HTMLElement, seed: number) {
    const el = (id: string, cls = ''): HTMLElement => {
      const e = document.createElement('div');
      e.id = id; if (cls) e.className = cls;
      root.append(e);
      return e;
    };
    this.compass = el('compass');
    this.heading = el('heading');
    this.speed = el('speed');
    this.score = el('score');
    this.bank = el('bank');
    const bars = el('bars');
    const row = (n: number, cls: string, arr: HTMLElement[]): HTMLElement => {
      const r = document.createElement('div');
      r.className = `pips ${cls}`;
      for (let i = 0; i < n; i++) { const p = document.createElement('i'); arr.push(p); r.append(p); }
      bars.append(r);
      return r;
    };
    this.boostRow = row(10, 'boost', this.boost);
    row(20, 'hull', this.hull);
    this.flashEl = el('flash');
    this.raceTimer = el('race-timer');
    this.raceInfo = el('race-info');
    this.raceWp = el('race-wp', 'marker');
    this.level = new Level(root);
    this.radar = new Radar(root, seed);
  }

  private set(e: HTMLElement, text: string): void {
    if (this.last.get(e) === text) return;
    this.last.set(e, text);
    e.textContent = text;
  }

  flash(text: string, color = '#FFD75E'): void {
    this.flashEl.textContent = tFlash(text);
    this.flashEl.style.color = color;
    this.flashEl.classList.add('on');
    clearTimeout(this.flashT);
    this.flashT = window.setTimeout(() => this.flashEl.classList.remove('on'), 1200);
  }

  /** Každý frame: radar; text se přepisuje jen při změně */
  update(sim: Sim, opts: { radar: boolean; attitude: boolean }, blips: Blip[] = []): void {
    const s = sim.ship, sub = s.mode === 'sub';
    const H = headingAngle(s.att);
    const hdg = ((Math.round(H * 180 / Math.PI) % 360) + 360) % 360;
    this.set(this.compass, compassTape(hdg));
    this.set(this.heading, `${String(hdg).padStart(3, '0')}°`);
    const vy = s.vel.y;
    const vs = Math.abs(vy) > 1 ? `VS ${vy >= 0 ? '+' : '-'}${Math.abs(Math.round(vy))}` : 'VS  0';
    this.set(this.speed, `${sub ? 'SUB   ' : ''}SPD ${Math.round(s.speed)}   ALT ${Math.floor(s.pos.y)}   ${vs}`);

    const hp = Math.max(0, Math.ceil(s.hp / 5));
    for (let i = 0; i < 20; i++) this.hull[i].classList.toggle('on', i < hp);
    const bm = Math.round(s.boostMeter / 10);
    for (let i = 0; i < 10; i++) this.boost[i].classList.toggle('on', i < bm);
    this.boostRow.classList.toggle('active', s.boostTime > 0);
    this.boostRow.style.display = sub ? 'none' : '';

    const p = sim.pilot;
    let sc = `${t('hud.score')} ${Math.floor(p.score)}`;
    if (p.combo > 1 && sim.time - p.comboLast < COMBO_WINDOW) sc += `  ×${p.combo}`;
    this.set(this.score, sc);

    const pitch = pitchAngle(s.att), roll = bankAngle(s.att);
    const pdeg = Math.round(pitch * 180 / Math.PI), bdeg = Math.round(roll * 180 / Math.PI);
    let att = pdeg > 3 ? `▲ ${pdeg}°` : pdeg < -3 ? `▼ ${-pdeg}°` : '';
    if (!sub && Math.abs(bdeg) > 5) att += `${att ? '    ' : ''}${t('hud.bank')} ${bdeg > 0 ? '+' : ''}${bdeg}°`;
    this.set(this.bank, att);

    const race = sim.race;
    this.raceTimer.style.display = this.raceInfo.style.display = race && !race.finished ? '' : 'none';
    if (race && !race.finished) {
      this.set(this.raceTimer, formatTime(race.time));
      const r = race.rabbit.pos;
      this.set(this.raceInfo, t('race.info', Math.floor(Math.hypot(r.x - s.pos.x, r.y - s.pos.y, r.z - s.pos.z)), race.cpHit, race.cpIndices.length));
    }

    this.level.update(roll, pitch, opts.attitude && !sub && !sim.dead);
    this.radar.el.style.display = opts.radar ? '' : 'none';
    if (opts.radar) this.radar.draw(s.pos.x, s.pos.y, s.pos.z, H, blips);
  }
}

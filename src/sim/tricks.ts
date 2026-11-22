// Triky, boost a skóre — port tricks.lua. Čas je čas simulace (ticky),
// ne hodiny, takže je to deterministické.
//  classic: skriptované triky (dvojťuk A/D = výkrut, držet Space = looping,
//           dvojťuk S = Immelmann)
//  free/direct: navíc detekce z letu — naintegrovaný úhel ≥ 2π boduje stejně

import { C } from './constants';
import { attFromEuler, type ShipState, type ScriptedTrick } from './flight';
import { BTN } from './input';
import { qaxis } from './math';

const DOUBLE_TAP = 0.35;
const COMBO_WINDOW = 4.0;
const COMBO_MAX = 5;
const WATCHED = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT, BTN.JUMP, BTN.SNEAK, BTN.PLACE] as const;

export interface TrickEvents {
  tap: number; double: number;      // bitové masky BTN
  holdJump: number;                 // jak dlouho je držen Space (s), 0 = nedržen
}

export interface Pilot {
  score: number;
  combo: number;
  comboLast: number;
  proxTimer: number;
  prev: number;
  lastTap: Map<number, number>;
  heldSince: Map<number, number>;
}

export const createPilot = (): Pilot => ({
  score: 0, combo: 1, comboLast: -Infinity, proxTimer: 0, prev: 0, lastTap: new Map(), heldSince: new Map(),
});

export type SimEvent =
  | { type: 'flash'; text: string; color: string }
  | { type: 'boost' }
  | { type: 'crash'; damage: number }
  | { type: 'explode'; x: number; y: number; z: number; r: number }
  | { type: 'died' }
  | { type: 'respawned' }
  | { type: 'shot'; x: number; y: number; z: number; drill: boolean }
  | { type: 'impact'; x: number; y: number; z: number; dx: number; dy: number; dz: number; r: number; len: number }
  | { type: 'carve'; pts: number[]; r: number }
  | { type: 'checkpoint' }
  | { type: 'race_end'; ok: boolean; time: number; cp: number; cpTotal: number; score: number };

/** tricks.update_input: hrany tlačítek → ťuk / dvojťuk / držení */
export function updateInput(p: Pilot, buttons: number, now: number, out: TrickEvents): TrickEvents {
  out.tap = 0; out.double = 0; out.holdJump = 0;
  for (const k of WATCHED) {
    const pressed = (buttons & k) !== 0;
    if (pressed && !(p.prev & k)) {
      out.tap |= k;
      const lt = p.lastTap.get(k);
      if (lt !== undefined && now - lt < DOUBLE_TAP) { out.double |= k; p.lastTap.delete(k); }
      else p.lastTap.set(k, now);
      p.heldSince.set(k, now);
    } else if (!pressed) p.heldSince.delete(k);
    if (pressed && k === BTN.JUMP && p.heldSince.has(k)) out.holdJump = now - p.heldSince.get(k)!;
  }
  p.prev = buttons;
  return out;
}

export function award(p: Pilot, s: ShipState, now: number, label: string, points: number, boostAdd: number, ev: SimEvent[]): void {
  p.combo = now - p.comboLast < COMBO_WINDOW ? Math.min(p.combo + 1, COMBO_MAX) : 1;
  p.comboLast = now;
  p.score += points * p.combo;
  s.boostMeter = Math.min(s.boostMeter + boostAdd, 100);
  ev.push({ type: 'flash', text: p.combo > 1 ? `${label}  ×${p.combo}` : label, color: '#FFD75E' });
}

/** tricks.check_triggers (bez aktivního triku) */
export function checkTriggers(p: Pilot, s: ShipState, e: TrickEvents, ev: SimEvent[]): void {
  if (s.trick) return;
  const classic = s.control === 'classic' && s.mode === 'fighter';
  if (classic && e.double & (BTN.LEFT | BTN.RIGHT)) {
    start(s, 'barrel_roll', 0.6, e.double & BTN.LEFT ? -1 : 1);
    s.iframes = 1.0;
    return;
  }
  if (classic && e.holdJump >= 0.8 && s.speed > 25) {
    p.heldSince.delete(BTN.JUMP);
    start(s, 'loop', 1.6, 1);
    return;
  }
  if (classic && e.double & BTN.DOWN && s.speed > 20) {
    start(s, 'immelmann', 1.2, 1);
    return;
  }
  // boost: PLACE (E / pravé tlačítko / A) nebo dvojťuk W — ve všech presetech
  if ((e.tap & BTN.PLACE || e.double & BTN.UP) && s.boostMeter >= 25 && s.boostTime <= 0 && s.mode !== 'sub') {
    s.boostMeter -= 25;
    s.boostTime = 2.0;
    ev.push({ type: 'boost' }, { type: 'flash', text: 'BOOST!', color: '#66CCFF' });
  }
}

function start(s: ShipState, name: ScriptedTrick['name'], dur: number, dir: number): void {
  s.trick = { name, t: 0, dur, dir, heading: s.heading, pitch: s.pitch, speed: Math.max(s.speed, C.SPEED_MIN) };
}


/** Krok skriptovaného triku: nastaví att a vel; vrátí true po dokončení */
export function stepTrick(p: Pilot, s: ShipState, dt: number, now: number, ev: SimEvent[]): boolean {
  const tr = s.trick!;
  tr.t += dt / tr.dur;
  const t = Math.min(tr.t, 1);
  const sp = tr.speed;
  const fx = Math.sin(tr.heading), fz = Math.cos(tr.heading);
  if (tr.name === 'barrel_roll') {
    attFromEuler(s.att, tr.heading, tr.pitch, tr.dir * 2 * Math.PI * t);
    const cp = Math.cos(tr.pitch);
    // boční posun do strany výkrutu (8 m/s)
    s.vel.x = fx * cp * sp + fz * tr.dir * 8;
    s.vel.y = Math.sin(tr.pitch) * sp;
    s.vel.z = fz * cp * sp - fx * tr.dir * 8;
  } else if (tr.name === 'loop') {
    const a = 2 * Math.PI * t;
    attFromEuler(s.att, tr.heading, a, 0);
    s.vel.x = fx * Math.cos(a) * sp; s.vel.y = Math.sin(a) * sp; s.vel.z = fz * Math.cos(a) * sp;
  } else {
    if (t < 0.65) {
      const a = Math.PI * (t / 0.65);
      attFromEuler(s.att, tr.heading, a, 0);
      s.vel.x = fx * Math.cos(a) * sp; s.vel.y = Math.sin(a) * sp; s.vel.z = fz * Math.cos(a) * sp;
    } else {
      // na vrcholu hlavou dolů a obrácený kurz → dotočit náklon na 0
      const k = (t - 0.65) / 0.35;
      attFromEuler(s.att, tr.heading + Math.PI, 0, Math.PI * (1 - k));
      s.vel.x = -fx * sp; s.vel.y = 0; s.vel.z = -fz * sp;
    }
  }
  s.speed = sp;
  if (tr.t < 1) return false;
  s.trick = null;
  if (tr.name === 'barrel_roll') { s.roll = 0; award(p, s, now, 'BARREL ROLL!', 100, 15, ev); }
  else if (tr.name === 'loop') { s.pitch = 0; award(p, s, now, 'LOOPING!', 200, 20, ev); }
  else {
    s.pitch = 0; s.roll = 0;
    s.heading = tr.heading + Math.PI;
    s.speed = Math.max(C.SPEED_MIN + 5, tr.speed * 0.6);
    award(p, s, now, 'IMMELMANN!', 150, 10, ev);
  }
  s.lookH = s.heading; s.lookV = 0;
  attFromEuler(s.att, s.heading, s.pitch, s.roll);
  qaxis(s.aim, s.att, 2);
  return true;
}

/** free/direct: výkrut a looping uletěné ručně se boduje stejně jako skriptované */
export function detectTricks(p: Pilot, s: ShipState, pitchRate: number, rollRate: number, dt: number, now: number, ev: SimEvent[]): void {
  s.rollAccum += rollRate * dt;
  s.pitchAccum += pitchRate * dt;
  // klid (malé rychlosti) po 1.5 s nuluje rozpracovaný trik
  if (Math.abs(rollRate) < 0.4 && Math.abs(pitchRate) < 0.4) s.calmTime += dt; else s.calmTime = 0;
  if (s.calmTime > 1.5) { s.rollAccum = 0; s.pitchAccum = 0; }
  const full = 2 * Math.PI;
  if (Math.abs(s.rollAccum) >= full) {
    s.rollAccum -= Math.sign(s.rollAccum) * full;
    s.iframes = 1.0;
    award(p, s, now, 'BARREL ROLL!', 100, 15, ev);
  }
  if (Math.abs(s.pitchAccum) >= full) {
    s.pitchAccum -= Math.sign(s.pitchAccum) * full;
    award(p, s, now, 'LOOPING!', 200, 20, ev);
  }
}

const PROX = [[0, -6, 0], [6, 0, 0], [-6, 0, 0], [0, 0, 6], [0, 0, -6]];

/** Proximity charge: let těsně kolem terénu nad 30 m/s nabíjí boost */
export function updatePassive(p: Pilot, s: ShipState, dt: number, solid: (x: number, y: number, z: number) => boolean): void {
  p.proxTimer += dt;
  if (p.proxTimer < 0.2) return;
  p.proxTimer = 0;
  if (s.speed <= 30) return;
  for (const [x, y, z] of PROX) {
    if (solid(s.pos.x + x, s.pos.y + y, s.pos.z + z)) {
      s.boostMeter = Math.min(s.boostMeter + 8 * 0.2, 100);
      p.score += 10 * 0.2;
      return;
    }
  }
}


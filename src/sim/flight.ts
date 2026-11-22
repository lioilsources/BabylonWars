// Letový model. Orientace je jednotkový kvaternion `att` (těleso → svět);
// Eulerovy úhly drží jen preset `classic` a ponorka, protože portují
// Luanti model 1:1 (kurz, sklon, náklon jako rot.y / rot.x / rot.z).
// Rychlostní fyzika (plyn, střemhlav, stoupání) je z vehicle.lua:308–418.
//
// Konvence: kurz H = atan2(fwd.x, fwd.z), kladný doprava (Luanti look_h = −H);
// sklon kladný = nos nahoru; náklon kladný = pravé křídlo dolů.

import { C } from './constants';
import { BTN, type InputFrame } from './input';
import {
  type Quat, type Vec3, UNIT_Y, clamp, qaxis, qconj, qcopy, qfromAxisAngle, qfromBodyRates,
  qlookRotation, qmul, qnormalize, qrotate, qslerp, quat, v3addScaled, v3dot,
  v3normalize, vec3,
} from './math';

// stick = myš jako joystick: výchylka od středu určuje rychlost otáčení
export type ControlPreset = 'classic' | 'free' | 'direct' | 'stick';
// space = stíhačka 6DoF: A/D úkrok, Space/Shift nahoru/dolů, Q/E výkrut
export type ShipMode = 'sub' | 'fighter' | 'space';

export interface ScriptedTrick {
  name: 'barrel_roll' | 'loop' | 'immelmann';
  t: number; dur: number; dir: number;
  heading: number; pitch: number; speed: number;
}

export interface ShipState {
  pos: Vec3; vel: Vec3;
  att: Quat;
  speed: number;
  aim: Vec3;
  mode: ShipMode;
  control: ControlPreset;
  // Euler stav pro classic a ponorku (vehicle.lua)
  heading: number; pitch: number; roll: number;
  lookH: number; lookV: number;     // zaměřovač: kurz a sklon (lookV kladný = nahoru)
  /** virtuální knipl řízení `stick` (−1…1, kladné Y = nos nahoru) */
  stickX: number; stickY: number;
  hp: number;
  boostMeter: number;               // 0…100 (tricks.lua)
  boostTime: number;
  iframes: number;
  crashCooldown: number;
  trick: ScriptedTrick | null;
  /** detekce triků z letu (free/direct): naintegrovaný úhel */
  rollAccum: number; pitchAccum: number; calmTime: number;
  /** debug: poslední plyn */
  thr: number;
}

export function createShip(pos: Vec3, heading = 0, mode: ShipMode = 'fighter'): ShipState {
  const s: ShipState = {
    pos: vec3(pos.x, pos.y, pos.z), vel: vec3(), att: quat(), speed: mode === 'sub' ? 0 : 15, aim: vec3(),
    mode, control: 'free',
    heading, pitch: 0, roll: 0, lookH: heading, lookV: 0, stickX: 0, stickY: 0,
    hp: 100, boostMeter: 50, boostTime: 0, iframes: 0, crashCooldown: 0, trick: null,
    rollAccum: 0, pitchAccum: 0, calmTime: 0, thr: 0,
  };
  attFromEuler(s.att, heading, 0, 0);
  qaxis(s.aim, s.att, 2);
  return s;
}

const AIM_GAIN = 3.0;
const ROLL_GAIN = 3.0;
const AIM_MAX_ANGLE = 1.2;
const DIRECT_ROLL_RATE = C.ROLL_SPEED * 1.4;
export const BOOST_SPEED = 60;

/** Myš jako joystick (řízení `stick`) */
export const STICK = {
  RANGE: 0.45,          // rad pohybu myši (po citlivosti) na plnou výchylku
  DEADZONE: 0.08,       // mrtvá zóna u středu (podíl výchylky)
  PITCH_RATE: 2.4,      // rad/s při plné výchylce (looping ≈ 2,6 s)
  YAW_RATE: 1.8,
} as const;

/** Stíhačka 6DoF (režim `space`): cílové rychlosti v osách trupu, asistence letu */
export const SPACE = {
  SURGE: C.SPEED_MAX,   // W/S
  SWAY: 22,             // A/D
  HEAVE: 22,            // Space/Shift
  ACCEL: 32,            // m/s² k cílové rychlosti
  ROLL_RATE: 2.6,       // rad/s (Q/E)
} as const;

const tFwd = vec3(), tRight = vec3(), tUp = vec3(), tE = vec3();
const tCamAtt = quat(), tConj = quat(), tDq = quat(), tQ = quat();

export const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/** att = kurz (kolem Y) ⊗ sklon (kolem X tělesa) ⊗ náklon (kolem Z tělesa) */
export function attFromEuler(out: Quat, heading: number, pitch: number, roll: number): Quat {
  qfromAxisAngle(out, 0, 1, 0, heading);
  qfromAxisAngle(tQ, 1, 0, 0, -pitch);
  qmul(out, out, tQ);
  qfromAxisAngle(tQ, 0, 0, 1, -roll);
  qmul(out, out, tQ);
  return qnormalize(out);
}

export function levelAttitude(out: Quat, att: Quat): Quat {
  qaxis(tFwd, att, 2);
  return qlookRotation(out, tFwd, UNIT_Y);
}

/** Kamera: slerp mezi „bez rollu“ a plným rollem; u svislice plynule plný roll */
export function cameraAttitude(out: Quat, att: Quat, horizonTilt: number): Quat {
  qaxis(tFwd, att, 2);
  const v = Math.abs(tFwd.y);
  const s = clamp((v - 0.9) / 0.08, 0, 1);
  const tilt = horizonTilt + (1 - horizonTilt) * (s * s * (3 - 2 * s));
  if (tilt >= 0.9999) return qcopy(out, att);
  levelAttitude(out, att);
  return qslerp(out, out, att, tilt);
}

export function bankAngle(att: Quat): number {
  qaxis(tRight, att, 0);
  qaxis(tUp, att, 1);
  return Math.atan2(-tRight.y, tUp.y);
}
export function pitchAngle(att: Quat): number {
  qaxis(tFwd, att, 2);
  return Math.asin(clamp(tFwd.y, -1, 1));
}
export function headingAngle(att: Quat): number {
  qaxis(tFwd, att, 2);
  return Math.atan2(tFwd.x, tFwd.z);
}

/** Mrtvá zóna + přeškálování: čím dál od středu, tím rychleji */
const stickCurve = (v: number): number => {
  const a = Math.abs(v);
  return a <= STICK.DEADZONE ? 0 : Math.sign(v) * (a - STICK.DEADZONE) / (1 - STICK.DEADZONE);
};

/** Pohyb myši posouvá virtuální knipl (drží výchylku, dokud ho hráč nevrátí) */
export function updateStick(s: ShipState, inp: InputFrame): void {
  let x = s.stickX + inp.aimDX / STICK.RANGE, y = s.stickY + inp.aimDY / STICK.RANGE;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  s.stickX = x; s.stickY = y;
}

/** Výsledná výchylka kniplu (myš + gamepad), −1…1 */
function stickAxes(s: ShipState, inp: InputFrame): { x: number; y: number } {
  stickTmp.x = clamp(stickCurve(s.stickX) + inp.padX, -1, 1);
  stickTmp.y = clamp(stickCurve(s.stickY) + inp.padY, -1, 1);
  return stickTmp;
}
const stickTmp = { x: 0, y: 0 };

/** Eulerův stav (kurz, sklon) z orientace — přechod mezi presety a režimy bez skoku */
export function syncEuler(s: ShipState): void {
  s.heading = headingAngle(s.att);
  s.pitch = pitchAngle(s.att);
  s.roll = 0;
  s.lookH = Math.atan2(s.aim.x, s.aim.z);
  s.lookV = Math.asin(clamp(s.aim.y, -1, 1));
}

export function integrateAttitude(att: Quat, pitchRate: number, yawRate: number, rollRate: number, dt: number): void {
  qfromBodyRates(tDq, pitchRate, yawRate, rollRate, dt);
  qmul(att, att, tDq);
  qnormalize(att);
}

/** Výsledek kroku řízení, který potřebuje sim (detekce triků, drift) */
export interface SteerOut { pitchRate: number; rollRate: number; drifting: boolean }
const steerOut: SteerOut = { pitchRate: 0, rollRate: 0, drifting: false };

/** Fighter: řízení orientace podle presetu + rychlost. Pohyb (pos) řeší sim. */
export function steerFighter(s: ShipState, inp: InputFrame, dt: number, horizonTilt: number): SteerOut {
  steerOut.pitchRate = 0; steerOut.rollRate = 0; steerOut.drifting = false;
  if (s.control === 'classic') steerClassic(s, inp, dt);
  else if (s.control === 'stick') {
    updateStick(s, inp);
    const k = stickAxes(s, inp);
    const pr = k.y * STICK.PITCH_RATE + inp.vertical * C.PITCH_RATE;
    const rr = clamp(inp.strafe + inp.roll, -1, 1) * DIRECT_ROLL_RATE;
    integrateAttitude(s.att, pr, k.x * STICK.YAW_RATE, rr, dt);
    qaxis(s.aim, s.att, 2);
    steerOut.pitchRate = pr; steerOut.rollRate = rr;
  } else if (s.control === 'direct') {
    const pr = inp.aimDY / dt + inp.vertical * C.PITCH_RATE;
    const rr = clamp(inp.strafe + inp.roll, -1, 1) * DIRECT_ROLL_RATE;
    integrateAttitude(s.att, pr, inp.aimDX / dt, rr, dt);
    qaxis(s.aim, s.att, 2);
    steerOut.pitchRate = pr; steerOut.rollRate = rr;
  } else steerFree(s, inp, dt, horizonTilt);
  updateSpeed(s, inp, dt);
  qaxis(tFwd, s.att, 2);
  s.vel.x = tFwd.x * s.speed; s.vel.y = tFwd.y * s.speed; s.vel.z = tFwd.z * s.speed;
  return steerOut;
}

function steerFree(s: ShipState, inp: InputFrame, dt: number, horizonTilt: number): void {
  const att = s.att;
  const bankIn = clamp(inp.strafe + inp.roll, -1, 1);
  cameraAttitude(tCamAtt, att, horizonTilt);
  qaxis(tRight, tCamAtt, 0);
  qaxis(tUp, tCamAtt, 1);
  v3addScaled(s.aim, s.aim, tRight, inp.aimDX + bankIn * C.TURN_SPEED * C.BANK_TURN * dt);
  v3addScaled(s.aim, s.aim, tUp, inp.aimDY + inp.vertical * C.PITCH_RATE * dt);
  v3normalize(s.aim);
  qaxis(tFwd, att, 2);
  limitAimCone(s.aim, tFwd);

  qconj(tConj, att);
  qrotate(tE, tConj, s.aim);
  const yawErr = Math.atan2(tE.x, tE.z);
  const pitchErr = Math.atan2(tE.y, Math.hypot(tE.x, tE.z));
  const chase = Math.max(C.TURN_SPEED * 1.3, 2.0);
  const yawRate = clamp(yawErr * AIM_GAIN, -chase, chase);
  const pitchRate = clamp(pitchErr * AIM_GAIN, -C.PITCH_RATE * 1.5, C.PITCH_RATE * 1.5);

  const bank = bankAngle(att);
  let target = clamp(yawErr * 2.0, -1, 1) * C.ROLL_MAX * 0.7;
  if (bankIn !== 0) target = clamp(target + bankIn * C.BANK_ROLL, -C.BANK_ROLL_MAX, C.BANK_ROLL_MAX);
  // u svislice náklon vůči horizontu neexistuje; hlavou dolů (looping) se nesrovnává
  let gain = ROLL_GAIN * clamp((1 - Math.abs(tFwd.y)) / 0.05, 0, 1);
  if (Math.abs(bank) > Math.PI / 2) gain = 0;
  let rollRate = clamp((target - bank) * gain, -C.ROLL_SPEED, C.ROLL_SPEED);
  if (gain === 0) rollRate = clamp(inp.roll, -1, 1) * C.ROLL_SPEED;
  integrateAttitude(att, pitchRate, yawRate, rollRate, dt);
  steerOut.pitchRate = pitchRate; steerOut.rollRate = rollRate;
}

/** classic = vehicle.lua fighter větev 1:1 (Euler, look clamp, auto-bank, drift) */
function steerClassic(s: ShipState, inp: InputFrame, dt: number): void {
  // zaměřovač: myš / pravá páčka
  s.lookH = wrapAngle(s.lookH + inp.aimDX);
  s.lookV = clamp(s.lookV + inp.aimDY, -1.55, 1.55);

  let turn = C.TURN_SPEED;
  const b = inp.buttons;
  const drifting = (b & BTN.DOWN) !== 0 && (b & (BTN.LEFT | BTN.RIGHT)) !== 0;
  if (drifting) {
    turn = C.TURN_SPEED * 2.2;
    s.speed = Math.max(s.speed - 12 * dt, C.SPEED_MIN);
    steerOut.drifting = true;
  }
  // levá páčka = knipl do náklonu: zatáčí zlomkem rychlosti pohledu
  const xmag = Math.abs(inp.strafe) > 0.001 ? Math.abs(inp.strafe) : 1;
  let bank = 0;
  if (b & BTN.LEFT) bank = -xmag;
  if (b & BTN.RIGHT) bank = xmag;
  if (bank !== 0) s.lookH = wrapAngle(s.lookH + (drifting ? turn : turn * C.BANK_TURN) * dt * bank);
  if (b & BTN.JUMP) s.lookV = Math.min(s.lookV + C.PITCH_RATE * dt, 1.25);
  else if (b & BTN.SNEAK) s.lookV = Math.max(s.lookV - C.PITCH_RATE * dt, -1.25);

  const chase = Math.max(turn * 1.3, 2.0) * dt;
  const dy = wrapAngle(s.lookH - s.heading);
  s.heading = wrapAngle(s.heading + clamp(dy, -chase, chase));

  const targetPitch = clamp(s.lookV, -C.PITCH_MAX, C.PITCH_MAX);
  const pstep = C.PITCH_RATE * 1.5 * dt;
  s.pitch += clamp(targetPitch - s.pitch, -pstep, pstep);

  let targetRoll = clamp(dy * 2.0, -1, 1) * C.ROLL_MAX * 0.7;
  if (bank !== 0) targetRoll = clamp(targetRoll + bank * C.BANK_ROLL, -C.BANK_ROLL_MAX, C.BANK_ROLL_MAX);
  const rstep = C.ROLL_SPEED * dt;
  s.roll += clamp(targetRoll - s.roll, -rstep, rstep);

  attFromEuler(s.att, s.heading, s.pitch, s.roll);
  lookDir(s.aim, s.lookH, s.lookV);
}

/**
 * Stíhačka 6DoF: myš pitch/yaw (v `stick` jako knipl, jinak přímo), Q/E výkrut,
 * W/S A/D Space/Shift posun v osách trupu. Žádné auto-vyrovnání ani gravitace;
 * asistence letu dorovnává rychlost k cílové (puštěné klávesy = zastavení).
 */
export function stepSpace(s: ShipState, inp: InputFrame, dt: number): SteerOut {
  let pr: number, yr: number;
  if (s.control === 'stick') {
    updateStick(s, inp);
    const k = stickAxes(s, inp);
    pr = k.y * STICK.PITCH_RATE; yr = k.x * STICK.YAW_RATE;
  } else { pr = inp.aimDY / dt; yr = inp.aimDX / dt; }
  const rr = clamp(inp.roll, -1, 1) * SPACE.ROLL_RATE;
  integrateAttitude(s.att, pr, yr, rr, dt);

  const thr = clamp(inp.thrust, -1, 1);
  s.thr = thr;
  let surge = thr * SPACE.SURGE;
  if (s.boostTime > 0) { s.boostTime -= dt; surge = BOOST_SPEED; }
  qaxis(tFwd, s.att, 2); qaxis(tRight, s.att, 0); qaxis(tUp, s.att, 1);
  const sway = clamp(inp.strafe, -1, 1) * SPACE.SWAY, heave = clamp(inp.vertical, -1, 1) * SPACE.HEAVE;
  const v = s.vel;
  const dx = tFwd.x * surge + tRight.x * sway + tUp.x * heave - v.x;
  const dy = tFwd.y * surge + tRight.y * sway + tUp.y * heave - v.y;
  const dz = tFwd.z * surge + tRight.z * sway + tUp.z * heave - v.z;
  const dl = Math.hypot(dx, dy, dz), a = SPACE.ACCEL * (s.boostTime > 0 ? 3 : 1) * dt;
  const k = dl > a ? a / dl : 1;
  v.x += dx * k; v.y += dy * k; v.z += dz * k;
  s.speed = Math.hypot(v.x, v.y, v.z);
  v3copyAxis(s.aim, tFwd);
  steerOut.pitchRate = pr; steerOut.rollRate = rr; steerOut.drifting = false;
  return steerOut;
}

const v3copyAxis = (out: Vec3, a: Vec3): void => { out.x = a.x; out.y = a.y; out.z = a.z; };

/** Ponorka: 5DoF hover (vehicle.lua:236–298); v `direct` navíc výkrut Q/E */
export function stepSub(s: ShipState, inp: InputFrame, dt: number): void {
  s.lookH = wrapAngle(s.lookH + inp.aimDX);
  s.lookV = clamp(s.lookV + inp.aimDY, -1.55, 1.55);
  const chase = 2.0 * dt;
  s.heading = wrapAngle(s.heading + clamp(wrapAngle(s.lookH - s.heading), -chase, chase));
  const targetPitch = clamp(s.lookV, -C.SUB_PITCH_MAX, C.SUB_PITCH_MAX);
  const pstep = C.PITCH_RATE * 1.5 * dt;
  s.pitch += clamp(targetPitch - s.pitch, -pstep, pstep);
  if (s.control === 'direct' && inp.roll !== 0) {
    s.roll = wrapAngle(s.roll + clamp(inp.roll, -1, 1) * DIRECT_ROLL_RATE * dt);
  } else {
    const rstep = C.ROLL_DECAY * dt;
    s.roll -= clamp(wrapAngle(s.roll), -rstep, rstep);
  }

  const thr = clamp(inp.thrust, -1, 1), sway = clamp(inp.strafe, -1, 1), heave = clamp(inp.vertical, -1, 1);
  s.thr = thr;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
  // dopředu po skloněné ose trupu, úkrok vodorovně kolmo na kurz, heave svisle
  const tvx = fx * cp * thr * C.SUB_SPEED + fz * sway * C.SUB_STRAFE;
  const tvy = sp * thr * C.SUB_SPEED + heave * C.SUB_VERT_SPEED;
  const tvz = fz * cp * thr * C.SUB_SPEED - fx * sway * C.SUB_STRAFE;
  const a = C.SUB_ACCEL * dt, v = s.vel;
  v.x += clamp(tvx - v.x, -a, a);
  v.y += clamp(tvy - v.y, -a, a);
  v.z += clamp(tvz - v.z, -a, a);
  s.speed = Math.hypot(v.x, v.y, v.z);
  attFromEuler(s.att, s.heading, s.pitch, s.roll);
  lookDir(s.aim, s.lookH, s.lookV);
}

function lookDir(out: Vec3, h: number, v: number): void {
  out.x = Math.sin(h) * Math.cos(v); out.y = Math.sin(v); out.z = Math.cos(h) * Math.cos(v);
}

function limitAimCone(aim: Vec3, fwd: Vec3): void {
  const c = v3dot(aim, fwd);
  const cmin = Math.cos(AIM_MAX_ANGLE);
  if (c >= cmin) return;
  let px = aim.x - fwd.x * c, py = aim.y - fwd.y * c, pz = aim.z - fwd.z * c;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-9) { px = 0; py = 1; pz = 0; } else { px /= pl; py /= pl; pz /= pl; }
  const sn = Math.sin(AIM_MAX_ANGLE);
  aim.x = fwd.x * cmin + px * sn; aim.y = fwd.y * cmin + py * sn; aim.z = fwd.z * cmin + pz * sn;
}

// Plyn, boost, dive/climb — vehicle.lua:308–418 (boost spouští tricks)
function updateSpeed(s: ShipState, inp: InputFrame, dt: number): void {
  let thr = clamp(inp.thrust, -1, 1);
  if (Math.abs(thr) < 0.25) thr = ((inp.buttons & BTN.UP) ? 1 : 0) - ((inp.buttons & BTN.DOWN) ? 1 : 0);
  s.thr = thr;
  if (thr > 0 && s.speed < C.SPEED_MAX) s.speed = Math.min(s.speed + 8 * dt * thr, C.SPEED_MAX);
  else if (thr < 0) s.speed = Math.max(s.speed + 10 * dt * thr, C.SPEED_MIN);

  const pitch = pitchAngle(s.att);
  if (s.boostTime > 0) {
    s.boostTime -= dt;
    s.speed = BOOST_SPEED;
  } else if (pitch < -0.45) {
    s.speed = Math.min(s.speed + 80 * dt * (-pitch - 0.45), C.SPEED_MAX * 1.5);
  } else {
    if (pitch > 0.3) {
      const bleed = 40 * (pitch - 0.3) * (1 - 0.7 * Math.max(thr, 0));
      s.speed = Math.max(s.speed - bleed * dt, C.SPEED_MIN);
    }
    if (s.speed > C.SPEED_MAX) s.speed = Math.max(C.SPEED_MAX, s.speed - 12 * dt);
  }
}


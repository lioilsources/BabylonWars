// Letový model stíhačky. Orientace je jednotkový kvaternion `att`
// (těleso → svět); Eulerovy úhly se počítají jen pro HUD.
// Port rychlostní fyziky z vehicle.lua (fighter větev), jen s jinou
// reprezentací orientace.

import { C } from './constants';
import type { InputFrame } from './input';
import {
  type Quat, type Vec3, UNIT_Y, clamp, qaxis, qconj, qcopy, qfromBodyRates,
  qlookRotation, qmul, qnormalize, qrotate, qslerp, quat, v3addScaled, v3dot,
  v3normalize, vec3, v3copy,
} from './math';

export type ControlPreset = 'classic' | 'free' | 'direct';
export type ShipMode = 'sub' | 'fighter';

export interface ShipState {
  pos: Vec3; vel: Vec3;
  att: Quat;
  speed: number;
  aim: Vec3;
  mode: ShipMode;
  control: ControlPreset;
  hull: number; boostMeter: number; boostTime: number;
  crashCooldown: number;
}

export function createShip(pos: Vec3, yaw = 0): ShipState {
  const att = quat();
  qfromBodyRates(att, 0, yaw, 0, 1);
  const aim = vec3();
  qaxis(aim, att, 2);
  return {
    pos: vec3(pos.x, pos.y, pos.z), vel: vec3(), att, speed: 20, aim,
    mode: 'fighter', control: 'free', hull: 100, boostMeter: 1, boostTime: 0,
    crashCooldown: 0,
  };
}

// Zisk regulátoru, který honí zaměřovač
const AIM_GAIN = 3.0;
const ROLL_GAIN = 3.0;
// Zaměřovač nesmí utéct od nosu dál než tohle (rad) — jinak by chyba
// za zády neměla jednoznačný směr
const AIM_MAX_ANGLE = 1.2;
// Rychlosti v `direct` (rad/s při plné výchylce klávesy)
const DIRECT_ROLL_RATE = C.ROLL_SPEED * 1.4;
const BOOST_SPEED = 60;
const BOOST_TIME = 1.5;

// Předalokované temporáry — tick nealokuje
const tFwd = vec3(), tRight = vec3(), tUp = vec3(), tE = vec3();
const tCamAtt = quat(), tConj = quat(), tDq = quat();

/** Orientace bez rollu: stejný směr nosu, nahoru = světové Y. */
export function levelAttitude(out: Quat, att: Quat): Quat {
  qaxis(tFwd, att, 2);
  return qlookRotation(out, tFwd, UNIT_Y);
}

/**
 * Orientace kamery: slerp mezi „bez rollu“ a plným rollem lodi.
 * U svislice levelAtt degeneruje → plynule přejdi na plný roll.
 */
export function cameraAttitude(out: Quat, att: Quat, horizonTilt: number): Quat {
  qaxis(tFwd, att, 2);
  const v = Math.abs(tFwd.y);
  const s = clamp((v - 0.9) / 0.08, 0, 1);
  const tilt = horizonTilt + (1 - horizonTilt) * (s * s * (3 - 2 * s));
  if (tilt >= 0.9999) return qcopy(out, att);
  levelAttitude(out, att);
  return qslerp(out, out, att, tilt);
}

/** Náklon pravého křídla vůči horizontu (rad, kladný = pravé křídlo dolů). */
export function bankAngle(att: Quat): number {
  qaxis(tRight, att, 0);
  qaxis(tUp, att, 1);
  return Math.atan2(-tRight.y, tUp.y);
}

/** Sklon nosu nad horizont (rad). */
export function pitchAngle(att: Quat): number {
  qaxis(tFwd, att, 2);
  return Math.asin(clamp(tFwd.y, -1, 1));
}

/** Kurz (rad, 0 = +Z, kladný doprava k +X). */
export function headingAngle(att: Quat): number {
  qaxis(tFwd, att, 2);
  return Math.atan2(tFwd.x, tFwd.z);
}

/** Natočí orientaci o úhlové rychlosti v osách tělesa (násobení zprava). */
export function integrateAttitude(att: Quat, pitchRate: number, yawRate: number, rollRate: number, dt: number): void {
  qfromBodyRates(tDq, pitchRate, yawRate, rollRate, dt);
  qmul(att, att, tDq);
  qnormalize(att);
}

/**
 * Jeden krok fighteru. `horizonTilt` je nastavení kamery — zaměřovač se
 * posouvá v osách kamery, aby míření fungovalo i v náklonu a hlavou dolů.
 */
export function stepFighter(s: ShipState, inp: InputFrame, dt: number, horizonTilt: number): void {
  const att = s.att;
  let pitchRate = 0, yawRate = 0, rollRate = 0;

  if (s.control === 'direct') {
    // Vstupy jsou přímo úhlové rychlosti; žádný zaměřovač ani auto-level
    pitchRate = inp.aimDY / dt + inp.vertical * C.PITCH_RATE;
    yawRate = inp.aimDX / dt;
    rollRate = inp.roll * DIRECT_ROLL_RATE;
    integrateAttitude(att, pitchRate, yawRate, rollRate, dt);
    qaxis(s.aim, att, 2);
  } else {
    // Mouse-aim: posun zaměřovače v osách kamery
    cameraAttitude(tCamAtt, att, horizonTilt);
    qaxis(tRight, tCamAtt, 0);
    qaxis(tUp, tCamAtt, 1);
    const dx = inp.aimDX + inp.roll * C.TURN_SPEED * C.BANK_TURN * dt;
    const dy = inp.aimDY + inp.vertical * C.PITCH_RATE * dt;
    v3addScaled(s.aim, s.aim, tRight, dx);
    v3addScaled(s.aim, s.aim, tUp, dy);
    v3normalize(s.aim);

    qaxis(tFwd, att, 2);
    if (s.control === 'classic') clampAimClassic(s.aim);
    limitAimCone(s.aim, tFwd);

    // Chyba zaměřovače v osách tělesa
    qconj(tConj, att);
    qrotate(tE, tConj, s.aim);
    const yawErr = Math.atan2(tE.x, tE.z);
    const pitchErr = Math.atan2(tE.y, Math.hypot(tE.x, tE.z));
    const chase = Math.max(C.TURN_SPEED * 1.3, 2.0);
    yawRate = clamp(yawErr * AIM_GAIN, -chase, chase);
    pitchRate = clamp(pitchErr * AIM_GAIN, -C.PITCH_RATE * 1.5, C.PITCH_RATE * 1.5);

    // Auto-bank do zatáčky + páčka (vehicle.lua: target_roll)
    const bank = bankAngle(att);
    let target = clamp(yawErr * 2.0, -1, 1) * C.ROLL_MAX * 0.7;
    if (inp.roll !== 0) {
      target = clamp(target + inp.roll * C.BANK_ROLL, -C.BANK_ROLL_MAX, C.BANK_ROLL_MAX);
    }
    // U svislice „náklon vůči horizontu“ neexistuje → zisk plynule k nule.
    // Ve `free` se hlavou dolů (looping) nesrovnává — to by v půlce smyčky
    // přetočilo letadlo o 180°.
    const vert = Math.abs(tFwd.y);
    let gain = ROLL_GAIN * clamp((1 - vert) / 0.05, 0, 1);
    if (s.control === 'free' && Math.abs(bank) > Math.PI / 2) gain = 0;
    rollRate = clamp((target - bank) * gain, -C.ROLL_SPEED, C.ROLL_SPEED);
    if (gain === 0) rollRate = inp.roll * C.ROLL_SPEED;

    integrateAttitude(att, pitchRate, yawRate, rollRate, dt);
  }

  updateSpeed(s, inp, dt);
  qaxis(tFwd, att, 2);
  v3copy(s.vel, tFwd);
  s.vel.x *= s.speed; s.vel.y *= s.speed; s.vel.z *= s.speed;
  v3addScaled(s.pos, s.pos, s.vel, dt);
}

// classic: zaměřovač drží Luanti strop pohledu (look_v ±1.25 rad)
function clampAimClassic(aim: Vec3): void {
  const maxY = Math.sin(1.25);
  if (Math.abs(aim.y) > maxY) {
    const h = Math.hypot(aim.x, aim.z) || 1;
    const ny = Math.sign(aim.y) * maxY, k = Math.sqrt(1 - ny * ny) / h;
    aim.x *= k; aim.z *= k; aim.y = ny;
  }
}

function limitAimCone(aim: Vec3, fwd: Vec3): void {
  const c = v3dot(aim, fwd);
  const cmin = Math.cos(AIM_MAX_ANGLE);
  if (c >= cmin) return;
  // aim = fwd*cos + perp*sin (perp = složka kolmá k nosu)
  let px = aim.x - fwd.x * c, py = aim.y - fwd.y * c, pz = aim.z - fwd.z * c;
  const pl = Math.hypot(px, py, pz);
  if (pl < 1e-9) { px = 0; py = 1; pz = 0; } else { px /= pl; py /= pl; pz /= pl; }
  const sn = Math.sin(AIM_MAX_ANGLE);
  aim.x = fwd.x * cmin + px * sn; aim.y = fwd.y * cmin + py * sn; aim.z = fwd.z * cmin + pz * sn;
}

// Plyn, boost, dive/climb — vehicle.lua:308–418
function updateSpeed(s: ShipState, inp: InputFrame, dt: number): void {
  const thr = clamp(inp.thrust, -1, 1);
  if (thr > 0 && s.speed < C.SPEED_MAX) s.speed = Math.min(s.speed + 8 * dt * thr, C.SPEED_MAX);
  else if (thr < 0) s.speed = Math.max(s.speed + 10 * dt * thr, C.SPEED_MIN);

  if (inp.boost && s.boostTime <= 0 && s.boostMeter >= 1) {
    s.boostTime = BOOST_TIME; s.boostMeter = 0;
  }
  if (s.boostMeter < 1) s.boostMeter = Math.min(1, s.boostMeter + dt / 6);

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

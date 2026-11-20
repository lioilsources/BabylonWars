// 1:1 z mods/dw_core/init.lua (doggiowars.const) — jména i hodnoty
export const C = {
  SPEED_MAX: 40,
  SPEED_MIN: 5,
  TURN_SPEED: 1.5,
  BANK_TURN: 0.35,
  BANK_ROLL: 1.05,
  BANK_ROLL_MAX: 2.2,
  PITCH_RATE: 1.2,
  PITCH_MAX: 0.6,
  PITCH_DECAY: 0.8,
  ROLL_SPEED: 1.8,
  ROLL_MAX: Math.PI,
  ROLL_DECAY: 1.5,
  SPAWN_HEIGHT: 300,
  SUB_SPEED: 20,
  SUB_STRAFE: 14,
  SUB_VERT_SPEED: 12,
  SUB_ACCEL: 25,
  SUB_PITCH_MAX: 0.9,
} as const;

// vehicle.lua: kamera "na nose"
export const EYE_OFFSET = { x: 0, y: 0.5, z: 4 } as const;

// Pevný krok simulace
export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;

// Nastavení hráče + laditelné konstanty klienta (jediný zdroj).
import type { ControlPreset } from '../sim/flight';

export type ViewMode = 'nose' | 'chase';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  control: ControlPreset;
  horizonTilt: number;       // 0 … 1
  view: ViewMode;
  quality: Quality;
  mouseSens: number;         // rad / px
  invertY: boolean;
}

export const TUNING = {
  // Stream voxelů podle kvality: r0 = poloměr LOD 0, dohled = r0 · 2^maxLod
  quality: {
    low: { r0: 64, maxLod: 3, scaleCap: 1, uploads: 1 },
    medium: { r0: 96, maxLod: 3, scaleCap: 1.5, uploads: 2 },
    high: { r0: 128, maxLod: 3, scaleCap: 2, uploads: 2 },
  },
  gamepadDeadzone: 0.12,
  gamepadAimRate: 2.4,       // rad/s při plné výchylce pravé páčky
  touchAimSens: 0.006,       // rad / px
  chaseOffset: { x: 0, y: 2.5, z: -10 },
  chaseStiffness: 18,        // 1/s, kriticky tlumená pružina
  fov: 1.15,                 // rad (≈ 66°)
} as const;

const KEY = 'babylonwars.settings.v1';
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const defaults = (): Settings => ({
  control: 'free', horizonTilt: 1, view: 'chase',
  quality: isTouch ? 'low' : 'high', mouseSens: 0.0022, invertY: false,
});

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch { /* soukromé okno apod. */ }
  return defaults();
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignoruj */ }
}

export { isTouch };

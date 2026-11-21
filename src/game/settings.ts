// Nastavení hráče + laditelné konstanty klienta (jediný zdroj).
import type { ControlPreset, ShipMode } from '../sim/flight';
import { defaultLang, type Lang } from './i18n';

export type ViewMode = 'nose' | 'chase';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  mode: ShipMode;            // /mode: ponorka (výchozí jako v Luanti) / stíhačka
  control: ControlPreset;
  horizonTilt: number;       // 0 … 1 (stíhačka)
  subTilt: number;           // 0 … 1 (ponorka)
  view: ViewMode;
  quality: Quality;
  mouseSens: number;         // rad / px
  invertY: boolean;
  lang: Lang;
  music: boolean;
  musicVolume: number;       // 0 … 1 (dw_music_volume v Luanti = 0.6)
  sfxVolume: number;         // 0 … 1
  headlight: boolean;
  radar: boolean;
  attitude: boolean;         // vodováha (jen stíhačka)
  stats: boolean;
  /** chatbridge (Twitch chat → hra); prázdné = vypnuto */
  bridgeUrl: string;
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
  // Impostory vzdálených ostrovů (plán §10): dohled podle kvality
  impostorRange: { low: 1200, medium: 1600, high: 2000 },
  impostorSegments: { low: 20, medium: 28, high: 32 },
  impostorRings: 14,
  // Světlomet (headlight.lua: kužel 20°, dosah 32 m — u nás měkčí okraj)
  headlight: { range: 48, cosOuter: Math.cos(26 * Math.PI / 180), cosInner: Math.cos(14 * Math.PI / 180) },
  // Hudba (music.lua)
  music: { checkInterval: 1, enterMargin: 120, leaveMargin: 220, fade: 6 },
  // Radar (minimapa Luanti, surface 256) a mapa (map.lua)
  radarRange: 512,
  mapRange: 1400,
  // chatbridge/init.lua
  chat: { pollInterval: 1, fetchTimeout: 5, maxEvents: 50, spawnRMin: 5, spawnRMax: 15, countCap: 10, protectRadius: 40 },
} as const;

const KEY = 'babylonwars.settings.v2';
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const defaults = (): Settings => ({
  mode: 'sub', control: 'free', horizonTilt: 1, subTilt: 0.3, view: 'chase',
  quality: isTouch ? 'low' : 'high', mouseSens: 0.0022, invertY: false,
  lang: defaultLang(), music: true, musicVolume: 0.6, sfxVolume: 0.8,
  headlight: true, radar: true, attitude: true, stats: false, bridgeUrl: '',
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

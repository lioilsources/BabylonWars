// Radar ostrovů vpravo nahoře (v Luanti minimapa „surface“ 256 px, trvale
// zapnutá, /radar ji vypne). Kreslí se deterministicky z islandForCell —
// žádné čtení voxelů. Natočený podle kurzu (nahoře = směr letu).
import { islandsWithin, type Island } from '../../gen/islands';
import { TUNING } from '../settings';

/** stejná paleta jako map.lua / radar v roblox portu */
export const BIOME_COLOR: Record<string, string> = {
  verdant: '#4caf50', glacial: '#e8f4ff', volcanic: '#b24632',
  atoll: '#e8d8a0', mycelial: '#9c6bb5', barren: '#8a8a8a',
  jungle: '#2e7d32', desert: '#d9c07a', crystal: '#9fe8ff',
  ashen: '#5c5c5c', savanna: '#a8a055', swamp: '#6b7a4f',
};

export interface Blip { x: number; z: number; color: string; size: number }

export class Radar {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private list: Island[] = [];
  private lx = NaN; private lz = NaN;
  private size = 0;

  constructor(root: HTMLElement, private seed: number) {
    this.el = document.createElement('canvas');
    this.el.id = 'radar';
    root.append(this.el);
    this.ctx = this.el.getContext('2d')!;
  }

  private fit(): void {
    const css = this.el.clientWidth || 160;
    const px = Math.round(css * Math.min(devicePixelRatio || 1, 2));
    if (px !== this.size) { this.size = px; this.el.width = px; this.el.height = px; }
  }

  draw(x: number, y: number, z: number, heading: number, blips: Blip[] = []): void {
    this.fit();
    const range = TUNING.radarRange;
    if (!(Math.abs(x - this.lx) < 60 && Math.abs(z - this.lz) < 60)) {
      islandsWithin(x, z, range * 1.5, this.seed, this.list);
      this.lx = x; this.lz = z;
    }
    const c = this.ctx, S = this.size, R = S / 2 - 2, k = R / range;
    c.clearRect(0, 0, S, S);
    c.save();
    c.translate(S / 2, S / 2);
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2);
    c.fillStyle = 'rgba(10,16,22,0.62)'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
    c.clip();
    // svět → radar: otočit o −kurz, sever (+Z) nahoru při kurzu 0
    const ch = Math.cos(heading), sh = Math.sin(heading);
    const toScr = (wx: number, wz: number): [number, number] => {
      const dx = wx - x, dz = wz - z;
      return [(dx * ch - dz * sh) * k, -(dx * sh + dz * ch) * k];
    };
    for (const isl of this.list) {
      const [sx, sy] = toScr(isl.x, isl.z);
      // ostrov nad/pod lodí: plný = v naší výšce, bledší = daleko vertikálně
      const dv = Math.abs(isl.y - y);
      c.globalAlpha = dv < 200 ? 0.85 : 0.45;
      c.beginPath(); c.arc(sx, sy, Math.max(2, isl.radius * k), 0, Math.PI * 2);
      c.fillStyle = BIOME_COLOR[isl.biome.name] ?? '#fff'; c.fill();
    }
    c.globalAlpha = 1;
    for (const b of blips) {
      const [sx, sy] = toScr(b.x, b.z);
      c.beginPath(); c.arc(sx, sy, b.size, 0, Math.PI * 2);
      c.fillStyle = b.color; c.fill();
    }
    // sever na okraji
    const [nx, ny] = [-sh * (R - 9), -ch * (R - 9)];
    c.fillStyle = '#ffd75e'; c.font = `bold ${Math.round(S / 14)}px ui-monospace, monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', nx, ny);
    c.restore();
    // loď uprostřed
    c.save(); c.translate(S / 2, S / 2);
    const t = S / 32;
    c.beginPath(); c.moveTo(0, -t * 1.6); c.lineTo(t, t); c.lineTo(0, t * 0.4); c.lineTo(-t, t); c.closePath();
    c.fillStyle = '#fff'; c.fill();
    c.restore();
  }
}

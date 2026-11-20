// Celoobrazovková kruhová mapa světa (map.lua) — klávesa Z, gamepad
// Back/View, tlačítko na telefonu, /map. Sever = +Z = nahoře, hráč
// uprostřed s tečkou směru. Ostrovy z islandForCell, živé tečky (monstra,
// zajíc) dodá volající.
import { islandsWithin, type Island } from '../../gen/islands';
import { TUNING } from '../settings';
import { BIOME_COLOR, type Blip } from './radar';

export class WorldMap {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private list: Island[] = [];
  private lx = NaN; private lz = NaN;
  open = false;

  constructor(root: HTMLElement, private seed: number) {
    this.el = document.createElement('canvas');
    this.el.id = 'worldmap';
    root.append(this.el);
    this.ctx = this.el.getContext('2d')!;
  }

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle('open', this.open);
  }

  draw(x: number, z: number, heading: number, blips: Blip[] = []): void {
    if (!this.open) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (this.el.width !== W || this.el.height !== H) { this.el.width = W; this.el.height = H; }
    const range = TUNING.mapRange;
    // map.lua RECENTER 150 m — ostrovy se přepočítají jen po posunu
    if (!(Math.abs(x - this.lx) < 150 && Math.abs(z - this.lz) < 150)) {
      islandsWithin(x, z, range, this.seed, this.list);
      this.lx = x; this.lz = z;
    }
    const c = this.ctx, R = Math.min(W, H) * 0.45, k = R / range;
    c.clearRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2);
    c.beginPath(); c.arc(0, 0, R + 12 * dpr, 0, Math.PI * 2);
    c.fillStyle = 'rgba(10,16,22,0.82)'; c.fill();
    c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = dpr;
    for (const f of [0.25, 0.5, 0.75, 1]) { c.beginPath(); c.arc(0, 0, R * f, 0, Math.PI * 2); c.stroke(); }
    for (const isl of this.list) {
      const sx = (isl.x - x) * k, sy = -(isl.z - z) * k;
      c.globalAlpha = 0.8;
      c.beginPath(); c.arc(sx, sy, Math.max(3 * dpr, isl.radius * k), 0, Math.PI * 2);
      c.fillStyle = BIOME_COLOR[isl.biome.name] ?? '#fff'; c.fill();
    }
    c.globalAlpha = 1;
    for (const b of blips) {
      c.beginPath(); c.arc((b.x - x) * k, -(b.z - z) * k, b.size * dpr, 0, Math.PI * 2);
      c.fillStyle = b.color; c.fill();
    }
    // hráč + tečka kurzu 14 px před ním
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(0, 0, 5 * dpr, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(Math.sin(heading) * 14 * dpr, -Math.cos(heading) * 14 * dpr, 3 * dpr, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd75e'; c.font = `bold ${14 * dpr}px ui-monospace, monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', 0, -R + 4 * dpr);
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.font = `${11 * dpr}px ui-monospace, monospace`;
    c.fillText(`${range} m`, 0, R - 10 * dpr);
    c.restore();
  }
}

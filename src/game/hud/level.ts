// Vodováha (hud.lua att_*): POLOHA STROJE, ne horizont. Čára se klopí
// spolu s letadlem a při stoupání se zvedne nad pevnou značku. 8 dílků po
// 22 px, plná výchylka sklonu 30 px při PITCH_MAX. Jen ve stíhačce.
import { C } from '../../sim/constants';

const PIPS = 8, SPACING = 22, PITCH_PX = 30;

export class Level {
  readonly el: HTMLElement;
  private pips: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'level';
    for (let i = 0; i < PIPS; i++) {
      const p = document.createElement('i');
      this.pips.push(p);
      this.el.append(p);
    }
    const ref = document.createElement('b');
    this.el.append(ref);
    root.append(this.el);
  }

  update(roll: number, pitch: number, show: boolean): void {
    this.el.style.display = show ? '' : 'none';
    if (!show) return;
    const ca = Math.cos(roll), sa = Math.sin(roll);
    const pf = Math.max(-1, Math.min(1, pitch / C.PITCH_MAX));
    const dy = -pf * PITCH_PX;
    const half = PIPS / 2;
    for (let i = 0; i < PIPS; i++) {
      const k = i < half ? i - half : i - half + 1;
      const d = k * SPACING;
      this.pips[i].style.transform = `translate(${Math.round(d * ca)}px, ${Math.round(d * sa + dy)}px)`;
    }
  }
}

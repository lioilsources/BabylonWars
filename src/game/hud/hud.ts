// HUD v DOM (F3 minimum: let, trup, boost, skóre, hlášky). Plný HUD podle
// hud.lua přijde v F4.
import type { Sim } from '../../sim/sim';
import { bankAngle, headingAngle, pitchAngle } from '../../sim/flight';

export class Hud {
  private flight = document.getElementById('flight')!;
  private flashEl: HTMLElement;
  private flashT = 0;
  private bars: HTMLElement;

  constructor(root: HTMLElement) {
    this.flashEl = document.createElement('div');
    this.flashEl.id = 'flash';
    this.bars = document.createElement('div');
    this.bars.id = 'bars';
    this.bars.innerHTML = '<div class="bar hull"><i></i><span>TRUP</span></div><div class="bar boost"><i></i><span>BOOST</span></div><div id="score"></div>';
    root.append(this.flashEl, this.bars);
  }

  flash(text: string, color: string): void {
    this.flashEl.textContent = text;
    this.flashEl.style.color = color;
    this.flashEl.classList.add('on');
    clearTimeout(this.flashT);
    this.flashT = window.setTimeout(() => this.flashEl.classList.remove('on'), 1600);
  }

  update(sim: Sim): void {
    const s = sim.ship;
    const deg = (r: number): string => (r * 180 / Math.PI).toFixed(0);
    let hdg = headingAngle(s.att) * 180 / Math.PI; if (hdg < 0) hdg += 360;
    const vs = s.vel.y;
    this.flight.textContent = `${s.mode === 'sub' ? 'SUB' : 'FTR'}  SPD ${s.speed.toFixed(0)}  ALT ${s.pos.y.toFixed(0)}  VS ${vs >= 0 ? '+' : ''}${vs.toFixed(0)}`
      + `  HDG ${hdg.toFixed(0)}°  P ${deg(pitchAngle(s.att))}°  B ${deg(bankAngle(s.att))}°`;
    const [hull, boost] = this.bars.querySelectorAll<HTMLElement>('.bar i');
    hull.style.width = `${s.hp}%`;
    hull.style.background = s.hp < 30 ? '#ff5040' : s.hp < 70 ? '#ffd75e' : '#8fe3a0';
    boost.style.width = `${s.boostMeter}%`;
    boost.style.opacity = s.boostTime > 0 ? '1' : s.boostMeter >= 25 ? '0.9' : '0.45';
    this.bars.querySelector('#score')!.textContent = `${Math.floor(sim.pilot.score)}`;
  }
}

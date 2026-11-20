// Dotyk: levý virtuální joystick (X náklon, Y plyn), tah pravým palcem
// = zaměřovač, tlačítka střelba / boost.
import type { InputFrame } from '../../sim/input';
import { TUNING } from '../settings';
import type { InputDevice, InputManager } from './input-manager';

export class TouchInput implements InputDevice {
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private aimId: number | null = null;
  private aimLast = { x: 0, y: 0 };
  private fire = false;
  private boost = false;
  private knob: HTMLElement;
  private base: HTMLElement;

  constructor(root: HTMLElement, private mgr: InputManager) {
    root.classList.add('touch');
    this.base = el(root, 'stick-base');
    this.knob = el(this.base, 'stick-knob');
    const fireBtn = el(root, 'btn btn-fire', 'FIRE');
    const boostBtn = el(root, 'btn btn-boost', 'BOOST');
    hold(fireBtn, (v) => { this.fire = v; });
    hold(boostBtn, (v) => { this.boost = v; });

    const zone = root.querySelector<HTMLElement>('#touch-zone')!;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      zone.setPointerCapture(e.pointerId);
      if (e.clientX < innerWidth * 0.45 && this.stickId === null) {
        this.stickId = e.pointerId;
        this.stickOrigin = { x: e.clientX, y: e.clientY };
        this.base.style.left = `${e.clientX}px`; this.base.style.top = `${e.clientY}px`;
        this.base.classList.add('on');
      } else if (this.aimId === null) {
        this.aimId = e.pointerId;
        this.aimLast = { x: e.clientX, y: e.clientY };
      }
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        const R = 60;
        let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.stick = { x: dx / R, y: -dy / R };
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.aimId) {
        const s = TUNING.touchAimSens;
        this.mgr.addAim((e.clientX - this.aimLast.x) * s, -(e.clientY - this.aimLast.y) * s);
        this.aimLast = { x: e.clientX, y: e.clientY };
      }
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.stickId) {
        this.stickId = null; this.stick = { x: 0, y: 0 };
        this.knob.style.transform = ''; this.base.classList.remove('on');
      }
      if (e.pointerId === this.aimId) this.aimId = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  fill(f: InputFrame): void {
    f.roll += this.stick.x;
    f.thrust += this.stick.y;
    f.fire ||= this.fire;
    f.boost ||= this.boost;
  }
}

function el(parent: HTMLElement, cls: string, text = ''): HTMLElement {
  const e = document.createElement('div');
  e.className = cls; e.textContent = text;
  parent.appendChild(e);
  return e;
}

function hold(e: HTMLElement, set: (v: boolean) => void): void {
  e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); e.setPointerCapture(ev.pointerId); set(true); e.classList.add('on'); });
  const off = (): void => { set(false); e.classList.remove('on'); };
  e.addEventListener('pointerup', off);
  e.addEventListener('pointercancel', off);
}

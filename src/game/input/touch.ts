// Dotyk: levý virtuální joystick (X náklon/úkrok, Y plyn), tah pravým palcem
// = zaměřovač, tlačítka střelba / boost / nahoru / dolů / výkrut / přepnutí zbraně.
import { BTN, type InputFrame } from '../../sim/input';
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
  private up = false;
  private down = false;
  private rollL = false;
  private rollR = false;
  private rollBtns: HTMLElement[];
  private knob: HTMLElement;
  private base: HTMLElement;
  private weaponBtn: HTMLElement;

  constructor(root: HTMLElement, private mgr: InputManager, onWeapon: () => void) {
    root.classList.add('touch');
    this.base = el(root, 'stick-base');
    this.knob = el(this.base, 'stick-knob');
    const fireBtn = el(root, 'btn btn-fire', 'FIRE');
    const boostBtn = el(root, 'btn btn-boost', 'BOOST');
    hold(fireBtn, (v) => { this.fire = v; });
    hold(boostBtn, (v) => { this.boost = v; });
    // přepnutí zbraně hned u palce: ● kanón, ◆ vrták (jako zaměřovač)
    this.weaponBtn = el(root, 'btn btn-weapon', '●');
    hold(this.weaponBtn, (v) => { if (v) onWeapon(); });
    hold(el(root, 'btn btn-up', '▲'), (v) => { this.up = v; });
    hold(el(root, 'btn btn-down', '▼'), (v) => { this.down = v; });
    // výkrut (Q/E): bez něj nejde 6DoF loď na telefonu srovnat
    const rl = el(root, 'btn btn-roll-l', '↺'), rr = el(root, 'btn btn-roll-r', '↻');
    hold(rl, (v) => { this.rollL = v; });
    hold(rr, (v) => { this.rollR = v; });
    this.rollBtns = [rl, rr];

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

  /** výkrut jen tam, kde něco dělá (ponorka ho má jen v řízení `direct`) */
  setRollVisible(on: boolean): void {
    for (const b of this.rollBtns) b.style.display = on ? '' : 'none';
    if (!on) { this.rollL = false; this.rollR = false; }
  }

  /** popisek tlačítka podle vybrané zbraně */
  setWeapon(drill: boolean): void {
    const txt = drill ? '◆' : '●';
    if (this.weaponBtn.textContent !== txt) this.weaponBtn.textContent = txt;
    this.weaponBtn.classList.toggle('drill', drill);
  }

  fill(f: InputFrame): void {
    const { x, y } = this.stick;
    f.strafe += x;
    f.thrust += y;
    f.vertical += (this.up ? 1 : 0) - (this.down ? 1 : 0);
    f.roll += (this.rollR ? 1 : 0) - (this.rollL ? 1 : 0);
    f.fire ||= this.fire;
    f.boost ||= this.boost;
    f.stickThrottle ||= this.stickId !== null;
    f.buttons |= (y > 0.5 ? BTN.UP : 0) | (y < -0.5 ? BTN.DOWN : 0) | (x < -0.5 ? BTN.LEFT : 0) | (x > 0.5 ? BTN.RIGHT : 0)
      | (this.up ? BTN.JUMP : 0) | (this.down ? BTN.SNEAK : 0) | (this.boost ? BTN.PLACE : 0) | (this.fire ? BTN.FIRE : 0);
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

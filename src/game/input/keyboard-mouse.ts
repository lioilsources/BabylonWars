// Klávesnice + myš (Pointer Lock).
// W/S plyn · A/D náklon (ponorka úkrok) · Space/Shift nahoru/dolů · Q/E výkrut
// levé tlačítko střelba · pravé tlačítko / F boost (dvojťuk W taky) · kolečko / 1 / 2 zbraň
import { BTN, type InputFrame } from '../../sim/input';
import type { Settings } from '../settings';
import type { InputDevice, InputManager } from './input-manager';

export class KeyboardMouse implements InputDevice {
  private keys = new Set<string>();
  private buttons = 0;

  constructor(canvas: HTMLCanvasElement, private mgr: InputManager, private settings: Settings,
    private onKey: (code: string) => void) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.onKey(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Slash') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = this.settings.mouseSens;
      this.mgr.addAim(e.movementX * s, -e.movementY * s * (this.settings.invertY ? -1 : 1));
    });
    window.addEventListener('mousedown', (e) => { if (document.pointerLockElement === canvas) this.buttons |= 1 << e.button; });
    window.addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    // kolečko přepíná zbraň; touchpad posílá dávku událostí → jedno přepnutí za 250 ms
    let wheelT = 0;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (document.pointerLockElement !== canvas || e.timeStamp - wheelT < 250 || Math.abs(e.deltaY) < 1) return;
      wheelT = e.timeStamp;
      this.onKey('Wheel');
    }, { passive: false });
  }

  fill(f: InputFrame): void {
    const k = this.keys;
    const on = (...codes: string[]): boolean => codes.some((c) => k.has(c));
    const up = on('KeyW', 'ArrowUp'), down = on('KeyS', 'ArrowDown');
    const left = on('KeyA', 'ArrowLeft'), right = on('KeyD', 'ArrowRight');
    const jump = on('Space'), sneak = on('ShiftLeft', 'ShiftRight');
    f.thrust += (up ? 1 : 0) - (down ? 1 : 0);
    f.strafe += (right ? 1 : 0) - (left ? 1 : 0);
    f.vertical += (jump ? 1 : 0) - (sneak ? 1 : 0);
    f.roll += (on('KeyE') ? 1 : 0) - (on('KeyQ') ? 1 : 0);
    const fire = (this.buttons & 1) !== 0;
    const place = (this.buttons & 4) !== 0 || on('KeyF');
    f.fire ||= fire;
    f.boost ||= place;
    f.buttons |= (up ? BTN.UP : 0) | (down ? BTN.DOWN : 0) | (left ? BTN.LEFT : 0) | (right ? BTN.RIGHT : 0)
      | (jump ? BTN.JUMP : 0) | (sneak ? BTN.SNEAK : 0) | (place ? BTN.PLACE : 0) | (fire ? BTN.FIRE : 0);
  }
}

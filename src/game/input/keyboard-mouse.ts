// Klávesnice + myš (Pointer Lock). W/S plyn, A/D náklon, Space/Shift nahoru/dolů,
// levé tlačítko střelba, E / pravé tlačítko boost.
import type { InputFrame } from '../../sim/input';
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
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
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
  }

  fill(f: InputFrame): void {
    const k = this.keys;
    const ax = (a: string, b: string): number => (k.has(a) ? 1 : 0) - (k.has(b) ? 1 : 0);
    f.thrust += ax('KeyW', 'KeyS') + ax('ArrowUp', 'ArrowDown');
    f.roll += ax('KeyD', 'KeyA') + ax('ArrowRight', 'ArrowLeft');
    f.vertical += ax('Space', 'ShiftLeft');
    f.fire ||= (this.buttons & 1) !== 0;
    f.boost ||= k.has('KeyE') || (this.buttons & 4) !== 0;
  }
}

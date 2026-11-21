// Gamepad API, standardní mapování.
// Levá páčka: X náklon/úkrok, Y plyn · pravá páčka: zaměřovač
// RT střelba · A / LB boost · RB nahoru · LT dolů · d-pad ←/→ výkrut
// Back/View mapa · Start/Menu nastavení
import { BTN, type InputFrame } from '../../sim/input';
import { TUNING } from '../settings';
import type { InputDevice } from './input-manager';

const dz = (v: number): number => {
  const d = TUNING.gamepadDeadzone;
  const a = Math.abs(v);
  return a < d ? 0 : Math.sign(v) * (a - d) / (1 - d);
};

export class GamepadInput implements InputDevice {
  private pad: Gamepad | null = null;
  connected = false;
  private prev = 0;
  /** hrana stisku: Back/View (8) mapa, Start/Menu (9) nastavení */
  onPress: (button: number) => void = () => {};

  poll(): void {
    this.pad = null;
    for (const p of navigator.getGamepads?.() ?? []) if (p && p.connected) { this.pad = p; break; }
    this.connected = !!this.pad;
    let now = 0;
    if (this.pad) for (const i of [8, 9]) if (this.pad.buttons[i]?.pressed) now |= 1 << i;
    const edge = now & ~this.prev;
    this.prev = now;
    for (const i of [8, 9]) if (edge & (1 << i)) this.onPress(i);
  }

  fill(f: InputFrame, dt: number): void {
    const p = this.pad;
    if (!p) return;
    const a = p.axes, b = (i: number): number => p.buttons[i]?.value ?? 0;
    const lx = dz(a[0] ?? 0), ly = -dz(a[1] ?? 0);
    f.strafe += lx;
    f.thrust += ly;
    const rx = dz(a[2] ?? 0), ry = dz(a[3] ?? 0);
    // kvadratická křivka = jemné míření u středu
    f.aimDX += rx * Math.abs(rx) * TUNING.gamepadAimRate * dt;
    f.aimDY += -ry * Math.abs(ry) * TUNING.gamepadAimRate * dt;
    f.vertical += b(5) - b(6);
    f.roll += b(15) - b(14);
    const fire = b(7) > 0.5, place = b(0) > 0.5 || b(4) > 0.5;
    f.fire ||= fire;
    f.boost ||= place;
    f.buttons |= (ly > 0.5 ? BTN.UP : 0) | (ly < -0.5 ? BTN.DOWN : 0) | (lx < -0.5 ? BTN.LEFT : 0) | (lx > 0.5 ? BTN.RIGHT : 0)
      | (b(5) > 0.5 ? BTN.JUMP : 0) | (b(6) > 0.5 ? BTN.SNEAK : 0) | (place ? BTN.PLACE : 0) | (fire ? BTN.FIRE : 0);
  }
}

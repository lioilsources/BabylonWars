// Gamepad API, standardní mapování. Levá páčka: X náklon, Y plyn.
// Pravá páčka: zaměřovač. RT střelba, A / LB boost, RB nahoru, LT dolů.
import type { InputFrame } from '../../sim/input';
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

  poll(): void {
    this.pad = null;
    for (const p of navigator.getGamepads?.() ?? []) if (p && p.connected) { this.pad = p; break; }
    this.connected = !!this.pad;
  }

  fill(f: InputFrame, dt: number): void {
    const p = this.pad;
    if (!p) return;
    const a = p.axes, b = (i: number): number => p.buttons[i]?.value ?? 0;
    f.roll += dz(a[0] ?? 0);
    f.thrust += -dz(a[1] ?? 0);
    const rx = dz(a[2] ?? 0), ry = dz(a[3] ?? 0);
    // kvadratická křivka = jemné míření u středu
    f.aimDX += rx * Math.abs(rx) * TUNING.gamepadAimRate * dt;
    f.aimDY += -ry * Math.abs(ry) * TUNING.gamepadAimRate * dt;
    f.vertical += b(5) - b(6); // RB nahoru, LT dolů
    f.fire ||= b(7) > 0.5;
    f.boost ||= b(0) > 0.5 || b(4) > 0.5;
  }
}

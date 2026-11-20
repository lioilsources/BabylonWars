// Sběr vstupů ze všech zařízení do InputFrame pro jednotlivé ticky.
import { clearInput, type InputFrame } from '../../sim/input';

export interface InputDevice {
  /** jednou za frame (gamepad API se musí pollovat) */
  poll?(): void;
  /** přičti spojité osy pro jeden tick délky dt */
  fill(f: InputFrame, dt: number): void;
}

export class InputManager {
  devices: InputDevice[] = [];
  // delta zaměřovače z myši/dotyku, rozdělí se mezi ticky framu
  pendingDX = 0;
  pendingDY = 0;
  edges = new Set<string>();

  addAim(dx: number, dy: number): void { this.pendingDX += dx; this.pendingDY += dy; }

  frameTicks(frame: InputFrame, tickIndex: number, ticks: number, dt: number): void {
    clearInput(frame);
    const share = 1 / (ticks - tickIndex);
    const dx = this.pendingDX * share, dy = this.pendingDY * share;
    this.pendingDX -= dx; this.pendingDY -= dy;
    frame.aimDX = dx; frame.aimDY = dy;
    for (const d of this.devices) d.fill(frame, dt);
    frame.thrust = clamp1(frame.thrust); frame.roll = clamp1(frame.roll);
    frame.vertical = clamp1(frame.vertical); frame.strafe = clamp1(frame.strafe);
  }

  poll(): void { for (const d of this.devices) d.poll?.(); }
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

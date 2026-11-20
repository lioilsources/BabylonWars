// Jediný vstup simulace; plní ho zařízení (klávesnice+myš, gamepad, dotyk).
// Osy jsou analogové, `buttons` jsou digitální stavy (jako get_player_control
// v Luanti) — simulace si z nich sama odvodí ťuknutí / dvojťuk / držení
// podle času ticku, takže je deterministická.

export const BTN = {
  UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, JUMP: 16, SNEAK: 32, PLACE: 64, FIRE: 128,
} as const;

export interface InputFrame {
  aimDX: number; aimDY: number;     // rad, delta zaměřovače (kladné dy = nahoru)
  thrust: number;                   // −1…1 (W/S, levá páčka ↑↓)
  strafe: number;                   // −1…1 (A/D, levá páčka ↔): fighter náklon, ponorka úkrok
  vertical: number;                 // −1…1 (Space/Shift)
  roll: number;                     // −1…1 (Q/E): výkrut v `direct` / ponorce
  fire: boolean; boost: boolean;
  buttons: number;                  // BTN.* bitově
}

export const emptyInput = (): InputFrame => ({
  aimDX: 0, aimDY: 0, thrust: 0, strafe: 0, vertical: 0, roll: 0, fire: false, boost: false, buttons: 0,
});

export function clearInput(f: InputFrame): void {
  f.aimDX = 0; f.aimDY = 0; f.thrust = 0; f.strafe = 0; f.vertical = 0; f.roll = 0;
  f.fire = false; f.boost = false; f.buttons = 0;
}

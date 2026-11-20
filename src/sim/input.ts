// Jediný vstup simulace; plní ho zařízení (klávesnice+myš, gamepad, dotyk).
export interface InputFrame {
  aimDX: number; aimDY: number;     // rad, delta zaměřovače (kladné dy = nahoru)
  thrust: number; strafe: number;   // −1…1
  vertical: number; roll: number;   // −1…1 (roll kladný = pravé křídlo dolů)
  fire: boolean; boost: boolean;
  tapLeft: boolean; tapRight: boolean; tapBack: boolean;
}

export const emptyInput = (): InputFrame => ({
  aimDX: 0, aimDY: 0, thrust: 0, strafe: 0, vertical: 0, roll: 0,
  fire: false, boost: false, tapLeft: false, tapRight: false, tapBack: false,
});

export function clearInput(f: InputFrame): void {
  f.aimDX = 0; f.aimDY = 0; f.thrust = 0; f.strafe = 0; f.vertical = 0; f.roll = 0;
  f.fire = false; f.boost = false; f.tapLeft = false; f.tapRight = false; f.tapBack = false;
}

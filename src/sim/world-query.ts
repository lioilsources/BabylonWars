// Co simulace potřebuje od světa (implementuje VoxelWorld + generátor)
export interface SweepResult { hit: boolean; x: number; y: number; z: number; nx: number; ny: number; nz: number }

export interface WorldQuery {
  isSolid(x: number, y: number, z: number): boolean;
  sweep(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, r: number): SweepResult;
  spawnNear(x: number, z: number): { x: number; y: number; z: number; yaw: number };
}

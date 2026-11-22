// Kamera jako potomek rigu (TransformNode). Rig nese interpolovanou pozici
// a orientaci kamery (slerp mezi „bez rollu“ a plným rollem lodi).
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { EYE_OFFSET } from '../sim/constants';
import type { Quat, Vec3 } from '../sim/math';
import { TUNING, type ViewMode } from './settings';

export class CameraRig {
  readonly rig: TransformNode;
  readonly camera: FreeCamera;
  private smoothPos = new Vector3();
  private vel = new Vector3();
  private first = true;

  constructor(scene: Scene) {
    this.rig = new TransformNode('camRig', scene);
    this.rig.rotationQuaternion = new Quaternion();
    this.camera = new FreeCamera('cam', Vector3.Zero(), scene);
    this.camera.inputs.clear();
    this.camera.parent = this.rig;
    this.camera.rotationQuaternion = new Quaternion();
    this.camera.minZ = 0.3;
    this.camera.maxZ = 6000;
    this.camera.fov = TUNING.fov;
    scene.activeCamera = this.camera;
  }

  /** zoom (1 = výchozí FOV): zmenší/zvětší tangens poloviny zorného úhlu */
  setZoom(zoom: number): void {
    this.camera.fov = Math.min(2.6, 2 * Math.atan(Math.tan(TUNING.fov / 2) / zoom));
  }

  setView(view: ViewMode): void {
    const o = view === 'nose' ? EYE_OFFSET : TUNING.chaseOffset;
    this.camera.position.set(o.x, o.y, o.z);
    this.first = true;
  }

  /** pos/att = interpolovaný stav pro render */
  update(pos: Vec3, camAtt: Quat, view: ViewMode, dt: number): void {
    const q = this.rig.rotationQuaternion!;
    q.set(camAtt.x, camAtt.y, camAtt.z, camAtt.w);
    if (view === 'nose' || this.first) {
      this.smoothPos.set(pos.x, pos.y, pos.z);
      this.vel.setAll(0);
      this.first = false;
    } else {
      // kriticky tlumená pružina na pozici rigu
      const w = TUNING.chaseStiffness, k = Math.min(dt, 0.05);
      const s = this.smoothPos, v = this.vel;
      v.x += (w * w * (pos.x - s.x) - 2 * w * v.x) * k; s.x += v.x * k;
      v.y += (w * w * (pos.y - s.y) - 2 * w * v.y) * k; s.y += v.y * k;
      v.z += (w * w * (pos.z - s.z) - 2 * w * v.z) * k; s.z += v.z * k;
    }
    this.rig.position.copyFrom(this.smoothPos);
  }
}

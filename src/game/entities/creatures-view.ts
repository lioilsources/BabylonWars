// Vykreslení monster: per druh jeden materiál (atlas tělo | obličej, obarvený
// tintem jako ^[multiply) a dva meshe s thin instances — hlava (obličej na
// ±Z stěnách) a články. Glow → emisivní složka.
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh'; // side effect: thin instances (bez něj tiché stuby)
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { SPECIES, SPECIES_NAMES, type Creature, type Species, type SpeciesDef } from '../../sim/creatures';
import { attFromEuler } from '../../sim/flight';
import { quat } from '../../sim/math';

interface Pack { head: Mesh; seg: Mesh | null; hm: Float32Array; sm: Float32Array }

const loadImg = (url: string): Promise<HTMLImageElement> => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
});

async function atlas(base: string, def: SpeciesDef): Promise<string> {
  const [body, face] = await Promise.all([def.bodyTex, def.faceTex].map((t) => loadImg(`${base}assets/textures/${t}`)));
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 16;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(body, 0, 0, 16, 16);
  ctx.drawImage(face, 16, 0, 16, 16);
  if (def.tint) {
    // ^[multiply:#tint se zachováním průhlednosti
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = def.tint;
    ctx.fillRect(0, 0, 32, 16);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(body, 0, 0, 16, 16);
    ctx.drawImage(face, 16, 0, 16, 16);
  }
  return cv.toDataURL();
}

export class CreaturesView {
  private packs = new Map<Species, Pack>();
  private q = quat(); private bq = new Quaternion(); private m = new Matrix(); private s = new Vector3(); private t = new Vector3();

  private constructor() {}

  static async create(scene: Scene, base: string): Promise<CreaturesView> {
    const v = new CreaturesView();
    await Promise.all(SPECIES_NAMES.map(async (sp) => {
      const def: SpeciesDef = SPECIES[sp];
      const tex = new Texture(await atlas(base, def), scene, false, true, Texture.NEAREST_SAMPLINGMODE);
      tex.hasAlpha = true;
      const mat = new StandardMaterial(`cr_${sp}`, scene);
      mat.diffuseTexture = tex;
      mat.useAlphaFromDiffuseTexture = false;
      mat.specularColor = Color3.Black();
      // Luanti glow = minimální jas, ne přičtené světlo: část difuzní nahradit emisivní
      if (def.glow > 0) {
        const k = def.glow / 15 * 0.6;
        mat.diffuseColor = new Color3(1, 1, 1).scale(1 - k);
        mat.emissiveTexture = tex;
        mat.emissiveColor = new Color3(1, 1, 1).scale(k);
      }
      mat.backFaceCulling = false;
      const B = new Vector4(0, 0, 0.5, 1), F = new Vector4(0.5, 0, 1, 1);
      const head = CreateBox(`crh_${sp}`, { size: 1, faceUV: [F, F, B, B, B, B], wrap: true }, scene);
      head.material = mat;
      let seg: Mesh | null = null;
      if (def.segCount > 0) {
        seg = CreateBox(`crs_${sp}`, { size: 1, faceUV: [B, B, B, B, B, B], wrap: true }, scene);
        seg.material = mat;
      }
      const pack: Pack = { head, seg, hm: new Float32Array(0), sm: new Float32Array(0) };
      for (const m of [head, seg]) { if (m) { m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.thinInstanceCount = 0; m.isVisible = false; } }
      v.packs.set(sp, pack);
    }));
    return v;
  }

  update(list: readonly Creature[]): void {
    const heads = new Map<Species, Creature[]>();
    for (const c of list) { let a = heads.get(c.species); if (!a) heads.set(c.species, a = []); a.push(c); }
    for (const [sp, p] of this.packs) {
      const cs = heads.get(sp) ?? [];
      const nseg = cs.reduce((n, c) => n + c.segs.length, 0);
      if (p.hm.length < cs.length * 16) { p.hm = new Float32Array(Math.max(16, cs.length * 2) * 16); p.head.thinInstanceSetBuffer('matrix', p.hm, 16, false); }
      if (p.seg && p.sm.length < nseg * 16) { p.sm = new Float32Array(Math.max(16, nseg * 2) * 16); p.seg.thinInstanceSetBuffer('matrix', p.sm, 16, false); }
      let k = 0;
      cs.forEach((c, i) => {
        const hs = c.def.headSize;
        this.write(p.hm, i, c.pos.x, c.pos.y, c.pos.z, c.yaw, c.pitch, c.roll, hs, hs, hs);
        for (const s of c.segs) this.write(p.sm, k++, s.pos.x, s.pos.y, s.pos.z, s.yaw, s.pitch, 0, s.sx, s.sy, s.sz);
      });
      p.head.thinInstanceCount = cs.length;
      p.head.isVisible = cs.length > 0;
      if (cs.length) p.head.thinInstanceBufferUpdated('matrix');
      if (p.seg) {
        p.seg.thinInstanceCount = k;
        p.seg.isVisible = k > 0;
        if (k) p.seg.thinInstanceBufferUpdated('matrix');
      }
    }
  }

  private write(out: Float32Array, i: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sx: number, sy: number, sz: number): void {
    attFromEuler(this.q, yaw, pitch, roll);
    this.bq.set(this.q.x, this.q.y, this.q.z, this.q.w);
    this.s.set(sx, sy, sz); this.t.set(x, y, z);
    Matrix.ComposeToRef(this.s, this.bq, this.t, this.m);
    this.m.copyToArray(out, i * 16);
  }
}

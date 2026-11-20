// Mesh stíhačky z doggiowars_fighter_01.obj (visual_size 2 jako v Luanti)
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { parseObj } from '../obj';

export async function createFighter(scene: Scene, base: string): Promise<Mesh> {
  const text = await fetch(`${base}assets/models/doggiowars_fighter_01.obj`).then((r) => r.text());
  const obj = parseObj(text);
  const m = new Mesh('fighter', scene);
  const vd = new VertexData();
  vd.positions = obj.positions; vd.uvs = obj.uvs; vd.indices = obj.indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(obj.positions, obj.indices, normals);
  vd.normals = normals;
  vd.applyToMesh(m);
  m.scaling.setAll(2);
  m.rotationQuaternion = new Quaternion();
  m.isPickable = false;
  const mat = new StandardMaterial('fighterMat', scene);
  const tex = new Texture(`${base}assets/textures/doggiowars_fighter_01.png`, scene, false, true, Texture.NEAREST_SAMPLINGMODE);
  mat.diffuseTexture = tex;
  mat.backFaceCulling = false;
  mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  m.material = mat;
  return m;
}

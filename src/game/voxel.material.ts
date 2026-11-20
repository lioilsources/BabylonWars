// Materiál voxelů: barva z vrcholu (F0), exponenciální mlha do barvy oblohy.
// F1 nahradí barvu texture array (sampler2DArray) + AO + světlomet.
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';

const vertexSource = `#version 300 es
precision highp float;
in vec3 position;
in vec4 color;
uniform mat4 world;
uniform mat4 viewProjection;
out vec4 vColor;
out vec3 vWorld;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vColor = color;
  gl_Position = viewProjection * wp;
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vWorld;
uniform vec3 eye;
uniform vec3 fogColor;
uniform float fogDensity;
out vec4 fragColor;
void main() {
  float d = length(vWorld - eye);
  float f = 1.0 - exp(-pow(d * fogDensity, 2.0));
  // emisivní nody (alfa = 1) mlha tlumí méně
  f *= mix(1.0, 0.6, vColor.a);
  fragColor = vec4(mix(vColor.rgb, fogColor, clamp(f, 0.0, 1.0)), 1.0);
}`;

export function createVoxelMaterial(scene: Scene, fogColor: Color3): ShaderMaterial {
  const m = new ShaderMaterial('voxel', scene, { vertexSource, fragmentSource }, {
    attributes: ['position', 'color'],
    uniforms: ['world', 'viewProjection', 'eye', 'fogColor', 'fogDensity'],
  });
  m.setColor3('fogColor', fogColor);
  m.setFloat('fogDensity', 1 / 900);
  m.backFaceCulling = true;
  return m;
}

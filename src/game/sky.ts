// Obloha podle sky.lua: tmavě modrá (#2e3155), věčné poledne, slunce,
// měsíc a hvězdy, řídké mraky ve vrstvách 1500 (a −500 pod hracím pásmem).
// Kopule je obrácená koule kolem kamery (infiniteDistance), mraky jsou
// roviny, které se posouvají s kamerou a šum se počítá ve světových XZ.
import { Effect } from '@babylonjs/core/Materials/effect';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Scene } from '@babylonjs/core/scene';

export const SKY_BASE = Color3.FromHexString('#2e3155');
export const SKY_ZENITH = Color3.FromHexString('#161936');
export const SKY_HORIZON = Color3.FromHexString('#4b5590');
/** mlha = barva u horizontu, ať ostrovy splývají s oblohou */
export const FOG_COLOR = SKY_HORIZON;
export const SUN_DIR = new Vector3(0.35, 0.8, 0.45).normalize();

const CLOUD_LAYERS = [1500, -500];
const CLOUD_SPEED = 2;        // m/s po X (sky.lua CLOUD_SPEED)
const CLOUD_DENSITY = 0.2;

Effect.ShadersStore.bwSkyVertexShader = `#version 300 es
precision highp float;
in vec3 position;
uniform mat4 worldViewProjection;
out vec3 vDir;
void main() {
  vDir = position;
  vec4 p = worldViewProjection * vec4(position, 1.0);
  gl_Position = p.xyww;   // vždy na zadní rovině
}`;

Effect.ShadersStore.bwSkyFragmentShader = `#version 300 es
precision highp float;
in vec3 vDir;
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 base; uniform vec3 sunDir;
out vec4 fragColor;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.6)) : mix(horizon, base, pow(-h, 0.5));
  // hvězdy: buňky na kouli, řídce, jen nad horizontem a slaběji u něj
  vec3 g = d * 220.0;
  vec3 cell = floor(g);
  float r = hash(cell);
  if (r > 0.985) {
    vec3 f = fract(g) - 0.5;
    float s = smoothstep(0.18, 0.0, length(f)) * (r - 0.985) / 0.015;
    c += vec3(s) * 0.85 * smoothstep(-0.05, 0.25, h);
  }
  // slunce: kotouč + záře
  float sd = dot(d, sunDir);
  c += vec3(1.0, 0.95, 0.8) * (smoothstep(0.9985, 0.9992, sd) * 1.2 + pow(max(sd, 0.0), 64.0) * 0.25);
  // měsíc naproti slunci
  float md = dot(d, normalize(vec3(-sunDir.x, sunDir.y * 0.6, -sunDir.z)));
  c += vec3(0.75, 0.8, 0.9) * smoothstep(0.9990, 0.9995, md) * 0.8;
  fragColor = vec4(c, 1.0);
}`;

Effect.ShadersStore.bwCloudVertexShader = `#version 300 es
precision highp float;
in vec3 position;
uniform mat4 world; uniform mat4 viewProjection;
out vec3 vWorld;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = viewProjection * wp;
}`;

Effect.ShadersStore.bwCloudFragmentShader = `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 eye; uniform float time; uniform float density; uniform float radius; uniform vec3 fogColor;
out vec4 fragColor;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = (vWorld.xz + vec2(time * ${CLOUD_SPEED.toFixed(1)}, 0.0)) / 260.0;
  float n = vnoise(p) * 0.55 + vnoise(p * 2.03) * 0.28 + vnoise(p * 4.1) * 0.17;
  float a = smoothstep(1.0 - density - 0.25, 1.0 - density + 0.15, n);
  float dist = length(vWorld.xz - eye.xz);
  a *= 1.0 - smoothstep(radius * 0.55, radius, dist);
  if (a < 0.01) discard;
  vec3 c = mix(vec3(0.91, 0.91, 0.94), fogColor, smoothstep(radius * 0.2, radius, dist) * 0.6);
  fragColor = vec4(c, a * 0.63);
}`;

export class Sky {
  private clouds: { mesh: ReturnType<typeof CreateGround>; y: number }[] = [];
  private cloudMat: ShaderMaterial;
  private t = 0;

  constructor(scene: Scene) {
    const dome = CreateSphere('sky', { diameter: 100, segments: 16, sideOrientation: 1 }, scene);
    dome.infiniteDistance = true;
    dome.isPickable = false;
    dome.applyFog = false;
    const sm = new ShaderMaterial('skyMat', scene, 'bwSky', {
      attributes: ['position'], uniforms: ['worldViewProjection', 'zenith', 'horizon', 'base', 'sunDir'],
    });
    sm.setColor3('zenith', SKY_ZENITH);
    sm.setColor3('horizon', SKY_HORIZON);
    sm.setColor3('base', SKY_BASE);
    sm.setVector3('sunDir', SUN_DIR);
    sm.disableDepthWrite = true;
    sm.backFaceCulling = false;
    dome.material = sm;
    dome.renderingGroupId = 0;
    dome.alwaysSelectAsActiveMesh = true;

    this.cloudMat = new ShaderMaterial('cloudMat', scene, 'bwCloud', {
      attributes: ['position'], uniforms: ['world', 'viewProjection', 'eye', 'time', 'density', 'radius', 'fogColor'],
      needAlphaBlending: true,
    });
    this.cloudMat.backFaceCulling = false;
    this.cloudMat.disableDepthWrite = true;
    this.cloudMat.alphaMode = Constants.ALPHA_COMBINE;
    this.cloudMat.setFloat('density', CLOUD_DENSITY);
    this.cloudMat.setColor3('fogColor', FOG_COLOR);
    this.setRadius(3000);
    for (const y of CLOUD_LAYERS) {
      const m = CreateGround(`clouds${y}`, { width: 6000, height: 6000, subdivisions: 1 }, scene);
      m.material = this.cloudMat;
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = true;
      this.clouds.push({ mesh: m, y });
    }
  }

  setRadius(r: number): void {
    this.cloudMat.setFloat('radius', r);
    for (const c of this.clouds) c.mesh.scaling.set(r / 3000, 1, r / 3000);
  }

  update(dt: number, eye: Vector3): void {
    this.t += dt;
    this.cloudMat.setFloat('time', this.t);
    this.cloudMat.setVector3('eye', eye);
    for (const c of this.clouds) c.mesh.position.set(eye.x, c.y, eye.z);
  }
}

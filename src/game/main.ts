// Vstupní bod hry: svět (stream chunků), simulace lodi v pevném kroku,
// kamera s nakloněným horizontem a interpolací mezi ticky, vstupy, HUD.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';

import { parseSeed } from '../gen/lcg';
import { frameSpawn, islandForCell, spawnPosNear } from '../gen/islands';
import { TICK_DT } from '../sim/constants';
import { cameraAttitude, type ControlPreset } from '../sim/flight';
import { emptyInput } from '../sim/input';
import { qaxis, qcopy, qslerp, quat, vec3, type Quat, type Vec3 } from '../sim/math';
import { Sim } from '../sim/sim';
import type { WorldQuery } from '../sim/world-query';
import { VoxelWorld } from '../voxel/world';
import { raycast, newHit } from '../voxel/raycast';
import { newSweep, sweepSphere } from '../voxel/sweep';
import { AIR } from '../voxel/registry';
import { CameraRig } from './camera-rig';
import { ChunkRenderer } from './chunk-renderer';
import { Console } from './commands';
import { createFighter } from './entities/fighter';
import { Hud } from './hud/hud';
import { GamepadInput } from './input/gamepad';
import { InputManager } from './input/input-manager';
import { KeyboardMouse } from './input/keyboard-mouse';
import { TouchInput } from './input/touch';
import { isTouch, loadSettings, saveSettings, TUNING, type Quality } from './settings';
import { createVoxelMaterials } from './voxel.material';
import './hud/hud.css';

const BASE = import.meta.env.BASE_URL;
const SKY = new Color3(0.55, 0.75, 0.95);

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = new Engine(canvas, !isTouch, {
    stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  }, true);
  if (engine.webGLVersion < 2) {
    document.getElementById('error')!.textContent = 'Tahle hra potřebuje WebGL2.';
    return;
  }

  const settings = loadSettings();
  const params = new URLSearchParams(location.search);
  const seed = parseSeed(params.get('seed') ?? '42');

  const scene = new Scene(engine);
  scene.clearColor = new Color4(SKY.r, SKY.g, SKY.b, 1);
  scene.skipPointerMovePicking = true;
  const light = new HemisphericLight('sun', new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.9;
  const instr = new SceneInstrumentation(scene);

  const rig = new CameraRig(scene);
  rig.setView(settings.view);

  const mats = await createVoxelMaterials(scene, BASE, SKY);
  const world = new VoxelWorld(seed);
  const q0 = TUNING.quality[settings.quality];
  const chunks = new ChunkRenderer(scene, mats.passes, world, { r0: q0.r0, maxLod: q0.maxLod, uploadsPerFrame: q0.uploads });
  const applyQuality = (ql: Quality): void => {
    const t = TUNING.quality[ql];
    chunks.configure({ r0: t.r0, maxLod: t.maxLod, uploadsPerFrame: t.uploads });
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, t.scaleCap));
    mats.setFog(1.3 / chunks.viewDistance);
    rig.camera.maxZ = chunks.viewDistance * 1.5;
  };
  applyQuality(settings.quality);

  const fighter = await createFighter(scene, BASE);

  // Svět pro simulaci: editace → načtené bity → generátor
  const sw = newSweep();
  const query: WorldQuery = {
    isSolid: world.isSolid,
    sweep: (fx, fy, fz, tx, ty, tz, r) => sweepSphere(world.isSolid, fx, fy, fz, tx, ty, tz, r, 0.5, sw),
    spawnNear: (x, z) => spawnPosNear(x, z, seed),
  };
  const home = islandForCell(0, 0, seed)!;
  const sim = new Sim(query, frameSpawn(home), settings.mode, settings.control);

  const prevPos: Vec3 = vec3(); const prevAtt: Quat = quat();
  const snapPrev = (): void => { const p = sim.ship.pos; prevPos.x = p.x; prevPos.y = p.y; prevPos.z = p.z; qcopy(prevAtt, sim.ship.att); };
  snapPrev();

  // HUD a vstupy
  const hudRoot = document.getElementById('hud')!;
  const hud = new Hud(hudRoot);
  const input = new InputManager();
  const tilt = (): number => (sim.ship.mode === 'sub' ? settings.subTilt : settings.horizonTilt);

  const labels = document.getElementById('labels')!;
  const updateLabels = (): void => {
    labels.textContent = `${sim.ship.mode === 'sub' ? 'ponorka' : 'stíhačka'} · ${settings.control} · horizont ${Math.round(tilt() * 100)} % · ${settings.view} · ${settings.quality}`;
  };
  const save = (): void => { saveSettings(settings); updateLabels(); };
  const toggleView = (): void => { settings.view = settings.view === 'nose' ? 'chase' : 'nose'; rig.setView(settings.view); save(); };
  const presets: ControlPreset[] = ['free', 'direct', 'classic'];
  const cyclePreset = (): void => {
    settings.control = presets[(presets.indexOf(settings.control) + 1) % presets.length];
    sim.setControl(settings.control); save();
  };
  const toggleMode = (): void => {
    settings.mode = sim.ship.mode === 'sub' ? 'fighter' : 'sub';
    sim.setMode(settings.mode); save();
    hud.flash(settings.mode === 'sub' ? 'PONORKA' : 'STÍHAČKA', '#ffffff');
  };
  const tilts = [1, 0.5, 0.3, 0];
  const cycleTilt = (): void => {
    const key = sim.ship.mode === 'sub' ? 'subTilt' : 'horizonTilt';
    settings[key] = tilts[(tilts.indexOf(settings[key]) + 1) % tilts.length] ?? 1; save();
  };
  const qualities: Quality[] = ['low', 'medium', 'high'];
  const cycleQuality = (): void => {
    settings.quality = qualities[(qualities.indexOf(settings.quality) + 1) % qualities.length];
    applyQuality(settings.quality); save();
  };
  const respawnHome = (): void => { sim.respawn(frameSpawn(home)); snapPrev(); chunks.dirty = true; };
  const teleport = (x: number, y: number, z: number, yaw?: number): void => {
    sim.respawn({ x, y, z, yaw: yaw ?? sim.ship.heading });
    snapPrev(); chunks.dirty = true;
  };
  const konsole: Console = new Console(hudRoot, {
    seed, teleport, pos: () => sim.ship.pos, say: (m) => konsole.say(m),
    setMode: (m) => { if (m !== sim.ship.mode) toggleMode(); },
  });
  const onKey = (code: string): void => {
    if (code === 'KeyV') toggleView();
    else if (code === 'KeyC') cyclePreset();
    else if (code === 'KeyT') cycleTilt();
    else if (code === 'KeyM') toggleMode();
    else if (code === 'KeyO') cycleQuality();
    else if (code === 'KeyR') respawnHome();
    else if (code === 'Slash' || code === 'NumpadDivide') konsole.open();
  };
  input.devices.push(new KeyboardMouse(canvas, input, settings, onKey));
  const gamepad = new GamepadInput();
  input.devices.push(gamepad);
  if (isTouch) input.devices.push(new TouchInput(hudRoot, input));
  for (const [id, fn] of [['b-console', () => konsole.open()], ['b-mode', toggleMode], ['b-view', toggleView],
    ['b-preset', cyclePreset], ['b-tilt', cycleTilt], ['b-quality', cycleQuality], ['b-respawn', respawnHome]] as const) {
    document.getElementById(id)!.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }
  updateLabels();

  // Ladicí střela (do F5): paprsek po zaměřovači vykousne kouli r = 3
  const hit = newHit();
  let fireCd = 0;
  const carve = (cx: number, cy: number, cz: number, R: number): void => {
    const batch: number[] = [];
    for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
      if (x * x + y * y + z * z <= R * R + 1) batch.push(Math.round(cx) + x, Math.round(cy) + y, Math.round(cz) + z, AIR);
    }
    chunks.invalidate(world.setNodes(batch));
  };
  const debugShot = (): void => {
    const s = sim.ship;
    raycast(world.isSolid, s.pos.x, s.pos.y, s.pos.z, s.aim.x, s.aim.y, s.aim.z, 400, hit);
    if (hit.hit) carve(hit.x, hit.y, hit.z, 3);
  };

  const stats = document.getElementById('stats')!;
  const aimEl = document.getElementById('aim')!;
  const noseEl = document.getElementById('nose')!;
  const frame = emptyInput();
  let acc = 0;
  const rPos = vec3(), rAtt = quat(), camAtt = quat(), tmp = vec3();
  const wv = new Vector3();
  let hudT = 0, statT = 0, frames = 0, worstMs = 0;

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.25);
    acc += dt;
    let ticks = Math.floor(acc / TICK_DT);
    if (ticks > 5) { ticks = 5; acc = ticks * TICK_DT; }
    input.poll();
    for (let t = 0; t < ticks; t++) {
      snapPrev();
      input.frameTicks(frame, t, ticks, TICK_DT);
      sim.tick(frame, tilt());
      fireCd -= TICK_DT;
      if (frame.fire && fireCd <= 0 && !sim.dead) { fireCd = 0.25; debugShot(); }
    }
    acc -= ticks * TICK_DT;
    let respawned = false;
    for (const e of sim.events) {
      if (e.type === 'flash') hud.flash(e.text, e.color);
      else if (e.type === 'explode') carve(e.x, e.y, e.z, e.r);
      else if (e.type === 'respawned') respawned = true;
    }
    sim.events.length = 0;
    if (respawned) { snapPrev(); chunks.dirty = true; updateLabels(); }

    // interpolace mezi dvěma posledními stavy simulace
    const alpha = acc / TICK_DT, s = sim.ship;
    rPos.x = prevPos.x + (s.pos.x - prevPos.x) * alpha;
    rPos.y = prevPos.y + (s.pos.y - prevPos.y) * alpha;
    rPos.z = prevPos.z + (s.pos.z - prevPos.z) * alpha;
    qslerp(rAtt, prevAtt, s.att, alpha);
    cameraAttitude(camAtt, rAtt, tilt());
    rig.update(rPos, camAtt, settings.view, dt);

    fighter.position.set(rPos.x, rPos.y, rPos.z);
    fighter.rotationQuaternion!.set(rAtt.x, rAtt.y, rAtt.z, rAtt.w);
    fighter.isVisible = settings.view === 'chase' && !sim.dead;

    chunks.update(rPos.x, rPos.y, rPos.z);
    scene.render();

    project(s.aim, aimEl);
    qaxis(tmp, rAtt, 2);
    project(tmp, noseEl);

    frames++;
    worstMs = Math.max(worstMs, engine.getDeltaTime());
    hudT += dt; statT += dt;
    if (hudT >= 0.15) { hud.update(sim); hudT = 0; }
    if (statT >= 0.5) {
      stats.textContent =
        `${(frames / statT).toFixed(0)} FPS · max ${worstMs.toFixed(0)} ms · ${instr.drawCallsCounter.current} DC\n`
        + `${(chunks.stats.quads * 2 / 1000).toFixed(0)}k tri · ${chunks.stats.meshes} meshů · fronta ${chunks.stats.queued}+${chunks.stats.running}`
        + ` · job ${chunks.stats.jobMs.toFixed(1)} ms · upload ${chunks.stats.uploadMs.toFixed(1)} ms\n`
        + `${engine.getRenderWidth()}×${engine.getRenderHeight()}${gamepad.connected ? ' · gamepad' : ''}`;
      statT = 0; frames = 0; worstMs = 0; chunks.stats.uploadMs = 0;
    }
  });

  function project(dir: Vec3, elm: HTMLElement): void {
    const cam = rig.camera;
    const cp = cam.globalPosition;
    wv.set(rPos.x + dir.x * 200, rPos.y + dir.y * 200, rPos.z + dir.z * 200);
    const fwd = cam.getDirection(Vector3.Forward(scene.useRightHandedSystem));
    if ((wv.x - cp.x) * fwd.x + (wv.y - cp.y) * fwd.y + (wv.z - cp.z) * fwd.z <= 0) { elm.style.display = 'none'; return; }
    const p = Vector3.TransformCoordinates(wv, scene.getTransformMatrix());
    elm.style.display = '';
    elm.style.transform = `translate(${((p.x + 1) / 2) * canvas.clientWidth}px, ${((1 - p.y) / 2) * canvas.clientHeight}px)`;
  }

  addEventListener('resize', () => engine.resize());
  (window as unknown as { bw: unknown }).bw = { engine, scene, sim, chunks, settings, input, instr, world };
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('error')!.textContent = String(e);
});

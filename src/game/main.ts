// Vstupní bod hry (F0 spike): domovský ostrov + okolí, let free/direct/classic,
// kamera s nakloněným horizontem, FPS a draw cally v rohu.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';

import { parseSeed } from '../gen/lcg';
import { frameSpawn, islandForCell } from '../gen/islands';
import { TICK_DT } from '../sim/constants';
import { cameraAttitude, createShip, headingAngle, pitchAngle, bankAngle, stepFighter, type ControlPreset } from '../sim/flight';
import { emptyInput } from '../sim/input';
import { qaxis, qcopy, qslerp, quat, vec3, type Quat, type Vec3 } from '../sim/math';
import { CameraRig } from './camera-rig';
import { ChunkRenderer } from './chunk-renderer';
import { createFighter } from './entities/fighter';
import { GamepadInput } from './input/gamepad';
import { InputManager } from './input/input-manager';
import { KeyboardMouse } from './input/keyboard-mouse';
import { TouchInput } from './input/touch';
import { isTouch, loadSettings, saveSettings, TUNING, type Quality } from './settings';
import { createVoxelMaterials } from './voxel.material';
import { VoxelWorld } from '../voxel/world';
import { raycast, newHit } from '../voxel/raycast';
import { AIR } from '../voxel/registry';
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
  scene.autoClearDepthAndStencil = true;
  const light = new HemisphericLight('sun', new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.9;
  const instr = new SceneInstrumentation(scene);
  instr.captureFrameTime = true;

  const rig = new CameraRig(scene);
  rig.setView(settings.view);

  const mats = await createVoxelMaterials(scene, BASE, SKY);
  const world = new VoxelWorld(seed);
  const q = TUNING.quality[settings.quality];
  const chunks = new ChunkRenderer(scene, mats.passes, world, { r0: q.r0, maxLod: q.maxLod, uploadsPerFrame: q.uploads });

  const applyQuality = (ql: Quality): void => {
    const t = TUNING.quality[ql];
    chunks.configure({ r0: t.r0, maxLod: t.maxLod, uploadsPerFrame: t.uploads });
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, t.scaleCap));
    mats.setFog(1.3 / chunks.viewDistance);
    rig.camera.maxZ = chunks.viewDistance * 1.5;
  };
  applyQuality(settings.quality);

  const fighter = await createFighter(scene, BASE);

  // Spawn u domovského ostrova
  const home = islandForCell(0, 0, seed)!;
  const sp = frameSpawn(home);
  // F0 nemá kolize a kopce domova sahají nad spawn z Lua → rezerva nad terén
  sp.y += 40;
  const ship = createShip(vec3(sp.x, sp.y, sp.z), sp.yaw);
  ship.control = settings.control;
  const respawn = (): void => {
    const n = createShip(vec3(sp.x, sp.y, sp.z), sp.yaw);
    Object.assign(ship, n, { control: settings.control });
    qcopy(prevAtt, ship.att); prevPos.x = ship.pos.x; prevPos.y = ship.pos.y; prevPos.z = ship.pos.z;
  };
  const prevPos: Vec3 = vec3(ship.pos.x, ship.pos.y, ship.pos.z);
  const prevAtt: Quat = quat(); qcopy(prevAtt, ship.att);

  // Vstupy
  const input = new InputManager();
  const hudRoot = document.getElementById('hud')!;
  const onKey = (code: string): void => {
    if (code === 'KeyV') toggleView();
    else if (code === 'KeyC') cyclePreset();
    else if (code === 'KeyT') cycleTilt();
    else if (code === 'KeyQ') cycleQuality();
    else if (code === 'KeyR') respawn();
  };
  input.devices.push(new KeyboardMouse(canvas, input, settings, onKey));
  const gamepad = new GamepadInput();
  input.devices.push(gamepad);
  if (isTouch) input.devices.push(new TouchInput(hudRoot, input));

  const save = (): void => { saveSettings(settings); updateLabels(); };
  const toggleView = (): void => { settings.view = settings.view === 'nose' ? 'chase' : 'nose'; rig.setView(settings.view); save(); };
  const presets: ControlPreset[] = ['free', 'direct', 'classic'];
  const cyclePreset = (): void => {
    settings.control = presets[(presets.indexOf(settings.control) + 1) % presets.length];
    ship.control = settings.control;
    qaxis(ship.aim, ship.att, 2);
    save();
  };
  const tilts = [1, 0.5, 0];
  const cycleTilt = (): void => { settings.horizonTilt = tilts[(tilts.indexOf(settings.horizonTilt) + 1) % tilts.length] ?? 1; save(); };
  const qualities: Quality[] = ['low', 'medium', 'high'];
  const cycleQuality = (): void => {
    settings.quality = qualities[(qualities.indexOf(settings.quality) + 1) % qualities.length];
    applyQuality(settings.quality); save();
  };
  for (const [id, fn] of [['b-view', toggleView], ['b-preset', cyclePreset], ['b-tilt', cycleTilt], ['b-quality', cycleQuality], ['b-respawn', respawn]] as const) {
    document.getElementById(id)!.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }

  const labels = document.getElementById('labels')!;
  const updateLabels = (): void => {
    labels.textContent = `${settings.control.toUpperCase()} · horizont ${Math.round(settings.horizonTilt * 100)} % · ${settings.view} · ${settings.quality}`;
  };
  updateLabels();

  // HUD prvky
  const stats = document.getElementById('stats')!;
  const flight = document.getElementById('flight')!;
  const aimEl = document.getElementById('aim')!;
  const noseEl = document.getElementById('nose')!;

  const frame = emptyInput();
  let acc = 0;
  const rPos = vec3(), rAtt = quat(), camAtt = quat(), tmp = vec3();
  const wv = new Vector3();
  let hudT = 0, frames = 0, worstMs = 0, fireCd = 0;
  const hit = newHit();

  // Ladicí střela (do F5): paprsek po zaměřovači vykousne kouli r = 3.
  // Ověřuje world.setNodes → přestavbu chunků bez propadu FPS.
  function debugCarve(): void {
    raycast(world.isSolid, ship.pos.x, ship.pos.y, ship.pos.z, ship.aim.x, ship.aim.y, ship.aim.z, 400, hit);
    if (!hit.hit) return;
    const batch: number[] = [];
    const R = 3;
    for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
      if (x * x + y * y + z * z <= R * R + 1) batch.push(hit.x + x, hit.y + y, hit.z + z, AIR);
    }
    chunks.invalidate(world.setNodes(batch));
  }

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.25);
    acc += dt;
    let ticks = Math.floor(acc / TICK_DT);
    if (ticks > 5) { ticks = 5; acc = ticks * TICK_DT; }
    input.poll();
    for (let t = 0; t < ticks; t++) {
      prevPos.x = ship.pos.x; prevPos.y = ship.pos.y; prevPos.z = ship.pos.z;
      qcopy(prevAtt, ship.att);
      input.frameTicks(frame, t, ticks, TICK_DT);
      stepFighter(ship, frame, TICK_DT, settings.horizonTilt);
      fireCd -= TICK_DT;
      if (frame.fire && fireCd <= 0) { fireCd = 0.25; debugCarve(); }
    }
    acc -= ticks * TICK_DT;
    const alpha = acc / TICK_DT;

    // interpolace mezi dvěma posledními stavy simulace
    rPos.x = prevPos.x + (ship.pos.x - prevPos.x) * alpha;
    rPos.y = prevPos.y + (ship.pos.y - prevPos.y) * alpha;
    rPos.z = prevPos.z + (ship.pos.z - prevPos.z) * alpha;
    qslerp(rAtt, prevAtt, ship.att, alpha);
    cameraAttitude(camAtt, rAtt, settings.horizonTilt);
    rig.update(rPos, camAtt, settings.view, dt);

    fighter.position.set(rPos.x, rPos.y, rPos.z);
    fighter.rotationQuaternion!.set(rAtt.x, rAtt.y, rAtt.z, rAtt.w);
    fighter.isVisible = settings.view === 'chase';

    chunks.update(rPos.x, rPos.y, rPos.z);
    scene.render();

    // zaměřovač a nos promítnuté na obrazovku
    project(ship.aim, aimEl);
    qaxis(tmp, rAtt, 2);
    project(tmp, noseEl);

    frames++;
    worstMs = Math.max(worstMs, engine.getDeltaTime());
    hudT += dt;
    if (hudT >= 0.5) {
      const fps = frames / hudT;
      stats.textContent =
        `${fps.toFixed(0)} FPS · max ${worstMs.toFixed(0)} ms · ${instr.drawCallsCounter.current} DC\n`
        + `${(chunks.stats.quads * 2 / 1000).toFixed(0)}k tri · ${chunks.stats.meshes} chunků · fronta ${chunks.stats.queued}+${chunks.stats.running}`
        + ` · job ${chunks.stats.jobMs.toFixed(1)} ms · upload ${chunks.stats.uploadMs.toFixed(1)} ms\n`
        + `${engine.getRenderWidth()}×${engine.getRenderHeight()}${gamepad.connected ? ' · gamepad' : ''}`;
      const deg = (r: number): string => (r * 180 / Math.PI).toFixed(0);
      let hdg = headingAngle(ship.att) * 180 / Math.PI; if (hdg < 0) hdg += 360;
      flight.textContent = `SPD ${ship.speed.toFixed(0)}  ALT ${ship.pos.y.toFixed(0)}  HDG ${hdg.toFixed(0)}°`
        + `  P ${deg(pitchAngle(ship.att))}°  B ${deg(bankAngle(ship.att))}°${ship.boostTime > 0 ? '  BOOST' : ''}`;
      hudT = 0; frames = 0; worstMs = 0; chunks.stats.uploadMs = 0;
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
  (window as unknown as { bw: unknown }).bw = { engine, scene, ship, chunks, settings, input, instr, world };
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('error')!.textContent = String(e);
});

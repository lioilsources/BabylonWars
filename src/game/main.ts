// Vstupní bod hry: svět (stream chunků + impostory), simulace lodi v pevném
// kroku, kamera s nakloněným horizontem a interpolací mezi ticky, obloha,
// světlomet, zvuk, HUD, mapa a nastavení.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';

import { parseSeed } from '../gen/lcg';
import { frameSpawn, islandForCell, nearestIsland, spawnPosNear } from '../gen/islands';
import { TICK_DT } from '../sim/constants';
import { cameraAttitude, headingAngle, type ShipMode } from '../sim/flight';
import { emptyInput } from '../sim/input';
import { qaxis, qcopy, qslerp, quat, vec3, type Quat, type Vec3 } from '../sim/math';
import { Sim } from '../sim/sim';
import type { WorldQuery } from '../sim/world-query';
import { VoxelWorld } from '../voxel/world';
import { raycast, newHit } from '../voxel/raycast';
import { newSweep, sweepSphere } from '../voxel/sweep';
import { AIR } from '../voxel/registry';
import { AudioSys, impactMaterial } from './audio';
import { CameraRig } from './camera-rig';
import { ChunkRenderer } from './chunk-renderer';
import { Console } from './commands';
import { createFighter } from './entities/fighter';
import { Hud } from './hud/hud';
import { WorldMap } from './hud/map';
import { SettingsPanel } from './hud/settings-panel';
import { setLang, t } from './i18n';
import { Impostors } from './impostors';
import { GamepadInput } from './input/gamepad';
import { InputManager } from './input/input-manager';
import { KeyboardMouse } from './input/keyboard-mouse';
import { TouchInput } from './input/touch';
import { isTouch, loadSettings, saveSettings, TUNING, type Quality, type Settings } from './settings';
import { FOG_COLOR, SKY_BASE, Sky } from './sky';
import { createVoxelMaterials } from './voxel.material';
import './hud/hud.css';

const BASE = import.meta.env.BASE_URL;

async function boot(): Promise<void> {
  const settings = loadSettings();
  setLang(settings.lang);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const engine = new Engine(canvas, !isTouch, {
    stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  }, true);
  if (engine.webGLVersion < 2) {
    document.getElementById('error')!.textContent = t('webgl2');
    return;
  }

  const params = new URLSearchParams(location.search);
  const seed = parseSeed(params.get('seed') ?? '42');

  const scene = new Scene(engine);
  scene.clearColor = new Color4(SKY_BASE.r, SKY_BASE.g, SKY_BASE.b, 1);
  scene.skipPointerMovePicking = true;
  const light = new HemisphericLight('sun', new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.9;
  const instr = new SceneInstrumentation(scene);

  const rig = new CameraRig(scene);
  rig.setView(settings.view);
  const sky = new Sky(scene);

  const [mats, manifest] = await Promise.all([
    createVoxelMaterials(scene, BASE, FOG_COLOR),
    fetch(`${BASE}assets/manifest.json`).then((r) => r.json() as Promise<Record<string, string[]>>).catch(() => ({} as Record<string, string[]>)),
  ]);
  const world = new VoxelWorld(seed);
  const q0 = TUNING.quality[settings.quality];
  const chunks = new ChunkRenderer(scene, mats.passes, world, { r0: q0.r0, maxLod: q0.maxLod, uploadsPerFrame: q0.uploads });
  const impostors = new Impostors(scene, seed, FOG_COLOR);
  const applyQuality = (ql: Quality): void => {
    const tq = TUNING.quality[ql];
    chunks.configure({ r0: tq.r0, maxLod: tq.maxLod, uploadsPerFrame: tq.uploads });
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, tq.scaleCap));
    const range = TUNING.impostorRange[ql];
    // mlha podle dohledu impostorů: na jeho konci ≈ 92 % barvy oblohy
    const fog = 1.6 / range;
    mats.setFog(fog);
    mats.setCut(chunks.viewDistance);
    impostors.configure(range, TUNING.impostorSegments[ql], TUNING.impostorRings, chunks.viewDistance, fog);
    rig.camera.maxZ = range + 600;
    sky.setRadius(range * 1.5);
  };
  applyQuality(settings.quality);

  const audio = new AudioSys(BASE, manifest.sounds ?? [], { music: settings.musicVolume, sfx: settings.sfxVolume });
  audio.musicOn = settings.music;

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

  // HUD, mapa, nastavení, vstupy
  const hudRoot = document.getElementById('hud')!;
  if (isTouch) hudRoot.classList.add('touch');
  const hud = new Hud(hudRoot, seed);
  const map = new WorldMap(hudRoot, seed);
  const input = new InputManager();
  const tilt = (): number => (sim.ship.mode === 'sub' ? settings.subTilt : settings.horizonTilt);

  const statsEl = document.getElementById('stats')!;
  const save = (): void => saveSettings(settings);
  const setMode = (m: ShipMode, announce = true): void => {
    settings.mode = m;
    if (m !== sim.ship.mode) sim.setMode(m);
    save();
    if (announce) {
      hud.flash(t(m === 'sub' ? 'mode.sub' : 'mode.fighter'), '#ffffff');
      konsole.say(t(m === 'sub' ? 'mode.subHelp' : 'mode.fighterHelp'));
    }
  };
  const toggleMode = (): void => setMode(sim.ship.mode === 'sub' ? 'fighter' : 'sub');
  const toggleView = (): void => { settings.view = settings.view === 'nose' ? 'chase' : 'nose'; rig.setView(settings.view); save(); };
  const respawnHome = (): void => { sim.respawn(frameSpawn(home)); snapPrev(); chunks.dirty = true; };
  const teleport = (x: number, y: number, z: number, yaw?: number): void => {
    sim.respawn({ x, y, z, yaw: yaw ?? sim.ship.heading });
    snapPrev(); chunks.dirty = true;
  };

  const onChange = (key: keyof Settings): void => {
    switch (key) {
      case 'lang': setLang(settings.lang); panel.render(); startText(); break;
      case 'mode': setMode(settings.mode, false); break;
      case 'control': sim.setControl(settings.control); break;
      case 'view': rig.setView(settings.view); break;
      case 'quality': applyQuality(settings.quality); break;
      case 'music': audio.setMusic(settings.music); break;
      case 'musicVolume': case 'sfxVolume': audio.setVolumes(settings.musicVolume, settings.sfxVolume); break;
      case 'stats': statsEl.textContent = ''; break;
      default: break;
    }
    save();
  };
  const panel = new SettingsPanel(hudRoot, settings, onChange);
  const toggleSetting = (key: 'music' | 'headlight' | 'radar', on?: boolean): boolean => {
    settings[key] = on ?? !settings[key];
    onChange(key);
    return settings[key];
  };

  // rychlé přepínače z klávesnice (totéž co v panelu nastavení)
  const cycle = <K extends 'control' | 'subTilt' | 'horizonTilt' | 'quality'>(key: K, vals: Settings[K][]): void => {
    const i = vals.indexOf(settings[key]);
    settings[key] = vals[(i + 1) % vals.length];
    onChange(key);
    konsole.say(`${key}: ${String(settings[key])}`);
  };

  const konsole: Console = new Console(hudRoot, {
    seed, teleport, pos: () => sim.ship.pos, say: (m) => konsole.say(m),
    setMode: (m) => setMode(m),
    toggle: toggleSetting,
    toggleMap: () => map.toggle(),
    setLang: (l) => { settings.lang = l; onChange('lang'); },
  });

  // Úvodní obrazovka: zmizí prvním gestem (zároveň odemkne zvuk)
  const start = document.getElementById('start')!;
  const startText = (): void => { document.getElementById('start-go')!.textContent = t(isTouch ? 'start.tap' : 'start.click'); };
  startText();
  const hideStart = (): void => { start.classList.add('hidden'); };
  for (const ev of ['pointerdown', 'keydown'] as const) addEventListener(ev, hideStart, { once: true });

  // Esc uvolní pointer lock → otevři nastavení (menu; svět běží dál)
  let ownUnlock = false;
  const withUnlock = (fn: () => void) => (): void => { ownUnlock = true; fn(); setTimeout(() => { ownUnlock = false; }, 100); };
  const openPanel = withUnlock(() => panel.open());
  const openConsole = withUnlock(() => konsole.open());
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && !ownUnlock && document.hasFocus() && !konsole.isOpen) panel.open();
  });

  const onKey = (code: string): void => {
    if (panel.isOpen) return;
    if (code === 'KeyV') toggleView();
    else if (code === 'KeyM') toggleMode();
    else if (code === 'KeyZ') map.toggle();
    else if (code === 'KeyL') konsole.say(t(toggleSetting('headlight') ? 'headlight.on' : 'headlight.off'));
    else if (code === 'KeyR') respawnHome();
    else if (code === 'KeyC') cycle('control', ['free', 'direct', 'classic']);
    else if (code === 'KeyT') cycle(sim.ship.mode === 'sub' ? 'subTilt' : 'horizonTilt', [1, 0.5, 0.3, 0]);
    else if (code === 'KeyO') cycle('quality', ['low', 'medium', 'high']);
    else if (code === 'Escape') panel.toggle();
    else if (code === 'Slash' || code === 'NumpadDivide') openConsole();
  };
  input.devices.push(new KeyboardMouse(canvas, input, settings, onKey));
  const gamepad = new GamepadInput();
  gamepad.onPress = (b) => { if (b === 8) map.toggle(); else if (b === 9) panel.toggle(); };
  input.devices.push(gamepad);
  if (isTouch) input.devices.push(new TouchInput(hudRoot, input));
  for (const [id, fn] of [['b-console', openConsole], ['b-mode', toggleMode], ['b-map', () => map.toggle()],
    ['b-settings', openPanel], ['b-respawn', respawnHome]] as const) {
    document.getElementById(id)!.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }

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
    audio.play('dw_shot', 0.6);
    raycast(world.isSolid, s.pos.x, s.pos.y, s.pos.z, s.aim.x, s.aim.y, s.aim.z, 400, hit);
    if (!hit.hit) return;
    carve(hit.x, hit.y, hit.z, 3);
    // materiál zásahu zatím podle povrchu biomu (přesně podle nodu v F5)
    const isl = nearestIsland(hit.x, hit.z, seed);
    const d = Math.hypot(hit.x - s.pos.x, hit.y - s.pos.y, hit.z - s.pos.z);
    audio.play(`dw_impact_${isl ? impactMaterial(isl.isl.biome.surface(0)) : 'stone'}`, Math.max(0.15, 1 - d / 250));
  };

  const aimEl = document.getElementById('aim')!;
  const noseEl = document.getElementById('nose')!;
  const frame = emptyInput();
  let acc = 0;
  const rPos = vec3(), rAtt = quat(), camAtt = quat(), tmp = vec3();
  const wv = new Vector3();
  let statT = 0, frames = 0, worstMs = 0;

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.25);
    acc += dt;
    let ticks = Math.floor(acc / TICK_DT);
    if (ticks > 5) { ticks = 5; acc = ticks * TICK_DT; }
    input.poll();
    for (let k = 0; k < ticks; k++) {
      snapPrev();
      input.frameTicks(frame, k, ticks, TICK_DT);
      sim.tick(frame, tilt());
      fireCd -= TICK_DT;
      if (frame.fire && fireCd <= 0 && !sim.dead) { fireCd = 0.25; debugShot(); }
    }
    acc -= ticks * TICK_DT;
    let respawned = false;
    for (const e of sim.events) {
      if (e.type === 'flash') hud.flash(e.text, e.color);
      else if (e.type === 'explode') { carve(e.x, e.y, e.z, e.r); audio.play('dw_impact_crash', 1); }
      else if (e.type === 'crash') audio.play('dw_impact_crash', Math.min(1, 0.4 + e.damage / 40));
      else if (e.type === 'respawned') respawned = true;
    }
    sim.events.length = 0;
    if (respawned) { snapPrev(); chunks.dirty = true; }

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

    qaxis(tmp, rAtt, 2);
    mats.setHeadlight(settings.headlight && !sim.dead, rPos.x + tmp.x * 2, rPos.y + tmp.y * 2, rPos.z + tmp.z * 2, tmp.x, tmp.y, tmp.z);

    chunks.update(rPos.x, rPos.y, rPos.z);
    const eye = rig.camera.globalPosition;
    impostors.update(eye);
    sky.update(dt, eye);
    audio.update(dt, rPos.x, rPos.z, seed);
    scene.render();

    project(s.aim, aimEl);
    project(tmp, noseEl);
    hud.update(sim, settings);
    map.draw(s.pos.x, s.pos.z, headingAngle(s.att));

    frames++;
    worstMs = Math.max(worstMs, engine.getDeltaTime());
    statT += dt;
    if (statT >= 0.5) {
      if (settings.stats) {
        statsEl.textContent =
          `${(frames / statT).toFixed(0)} FPS · max ${worstMs.toFixed(0)} ms · ${instr.drawCallsCounter.current} DC\n`
          + `${((chunks.stats.quads * 2 + impostors.triangles) / 1000).toFixed(0)}k tri · ${chunks.stats.meshes} meshů · ${impostors.count} impostorů`
          + ` · fronta ${chunks.stats.queued}+${chunks.stats.running} · job ${chunks.stats.jobMs.toFixed(1)} ms\n`
          + `${engine.getRenderWidth()}×${engine.getRenderHeight()} · ${settings.quality} · ${audio.format}${gamepad.connected ? ' · gamepad' : ''}`;
      }
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
  (window as unknown as { bw: unknown }).bw = { engine, scene, sim, chunks, impostors, settings, input, instr, world, audio, map, panel };
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('error')!.textContent = String(e);
});

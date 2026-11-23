// Vstupní bod hry: svět (stream chunků + impostory), simulace lodi v pevném
// kroku, kamera s nakloněným horizontem a interpolací mezi ticky, obloha,
// světlomet, zvuk, HUD, mapa a nastavení.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { SetMissingSideEffectWarningsEnabled } from '@babylonjs/core/Misc/devTools';

import { parseSeed } from '../gen/lcg';
import { frameSpawn, islandForCell, spawnPosNear } from '../gen/islands';
import { TICK_DT } from '../sim/constants';
import { Creatures, SPECIES, SPECIES_NAMES, type Species } from '../sim/creatures';
import { cameraAttitude, headingAngle, type ShipMode } from '../sim/flight';
import { tangent, formatTime } from '../sim/race';
import { WEAPON } from '../sim/weapons';
import { emptyInput } from '../sim/input';
import { qaxis, qcopy, qslerp, quat, vec3, type Quat, type Vec3 } from '../sim/math';
import { Sim } from '../sim/sim';
import type { WorldQuery } from '../sim/world-query';
import { VoxelWorld } from '../voxel/world';
import { carveAlong, carveCapsule } from '../voxel/carve';
import { newSweep, sweepSphere } from '../voxel/sweep';
import { NODES } from '../voxel/registry';
import { AudioSys, impactMaterial, type LoopSound } from './audio';
import { CameraRig } from './camera-rig';
import { ChunkRenderer } from './chunk-renderer';
import { Console } from './commands';
import { CreaturesView } from './entities/creatures-view';
import { createFighter } from './entities/fighter';
import { Debris } from './fx/debris';
import { Effects } from './fx/effects';
import { Particles } from './fx/particles';
import type { Blip } from './hud/radar';
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
import { registerServiceWorker } from './pwa';
import { ChatBridge } from './twitch';
import './hud/hud.css';

const BASE = import.meta.env.BASE_URL;
// ve vývoji varuj, když chybí import side effectu (jinak jsou to tiché stuby)
if (import.meta.env.DEV) SetMissingSideEffectWarningsEnabled(true);

// nová verze: na úvodní obrazovce rovnou načti, ve hře jen nabídni (nepřerušuj let)
registerServiceWorker(BASE, () => {
  const start = document.getElementById('start');
  if (!start || !start.classList.contains('hidden')) { location.reload(); return; }
  const b = document.createElement('button');
  b.id = 'update';
  b.textContent = t('update.ready');
  b.addEventListener('click', () => location.reload());
  document.getElementById('hud')?.append(b);
});

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
  rig.setZoom(2 ** settings.zoom);
  const sky = new Sky(scene);

  const [mats, manifest] = await Promise.all([
    createVoxelMaterials(scene, BASE, FOG_COLOR),
    fetch(`${BASE}assets/manifest.json`).then((r) => r.json() as Promise<Record<string, string[]>>).catch(() => ({} as Record<string, string[]>)),
  ]);
  const world = new VoxelWorld(seed);
  const q0 = TUNING.quality[settings.quality];
  const chunks = new ChunkRenderer(scene, mats.passes, world, { r0: q0.r0, maxLod: q0.maxLod, uploadsPerFrame: q0.uploads });
  const impostors = new Impostors(scene, seed, FOG_COLOR);
  let fogD = 0;
  const applyQuality = (ql: Quality): void => {
    const tq = TUNING.quality[ql];
    chunks.configure({ r0: tq.r0, maxLod: tq.maxLod, uploadsPerFrame: tq.uploads });
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio || 1, tq.scaleCap));
    const range = TUNING.impostorRange[ql];
    // mlha podle dohledu impostorů: na jeho konci ≈ 92 % barvy oblohy
    const fog = 1.6 / range;
    fogD = fog;
    mats.setFog(fog);
    mats.setCut(chunks.viewDistance);
    impostors.configure(range, TUNING.impostorSegments[ql], TUNING.impostorRings, chunks.viewDistance, fog);
    rig.camera.maxZ = range + 600;
    sky.setRadius(range * 1.5);
  };
  applyQuality(settings.quality);

  const audio = new AudioSys(BASE, manifest.sounds ?? [], { music: settings.musicVolume, sfx: settings.sfxVolume });
  audio.musicOn = settings.music;

  const [fighter, creaturesView] = await Promise.all([createFighter(scene, BASE), CreaturesView.create(scene, BASE)]);
  // zajíc: stíhačka obarvená do zlata (rabbit.lua ^[multiply:#ffd75e, glow 12)
  const rabbit = fighter.clone('rabbit');
  {
    const m = (fighter.material as StandardMaterial).clone('rabbitMat');
    m.diffuseColor = Color3.FromHexString('#ffd75e');
    m.emissiveTexture = m.diffuseTexture;
    m.emissiveColor = Color3.FromHexString('#ffd75e').scale(0.85);
    rabbit.material = m;
    rabbit.isVisible = false;
  }
  const particles = new Particles(scene);
  const effects = new Effects(particles);
  const debris = new Debris(scene, mats.avg, effects, world.isSolid);
  const creatures = new Creatures(world.isSolid, seed);
  const homeSpawn = frameSpawn(islandForCell(0, 0, seed)!);
  const chat = new ChatBridge({
    creatures,
    player: () => (sim.dead ? null : sim.ship.pos),
    protectCenter: vec3(homeSpawn.x, homeSpawn.y, homeSpawn.z),
    notify: (m) => konsole.say(m),
  });

  // Svět pro simulaci: editace → načtené bity → generátor
  const sw = newSweep();
  const query: WorldQuery = {
    isSolid: world.isSolid,
    sweep: (fx, fy, fz, tx, ty, tz, r) => sweepSphere(world.isSolid, fx, fy, fz, tx, ty, tz, r, 0.5, sw),
    spawnNear: (x, z) => spawnPosNear(x, z, seed),
  };
  const home = islandForCell(0, 0, seed)!;
  const sim = new Sim(query, frameSpawn(home), settings.mode, settings.control, seed);

  const prevPos: Vec3 = vec3(); const prevAtt: Quat = quat();
  const snapPrev = (): void => { const p = sim.ship.pos; prevPos.x = p.x; prevPos.y = p.y; prevPos.z = p.z; qcopy(prevAtt, sim.ship.att); };
  snapPrev();

  // HUD, mapa, nastavení, vstupy
  const hudRoot = document.getElementById('hud')!;
  if (isTouch) hudRoot.classList.add('touch');
  const hud = new Hud(hudRoot, seed);
  const map = new WorldMap(hudRoot, seed);
  const input = new InputManager();
  // 6DoF nemá „nahoru“: kamera vždy s plným náklonem lodi
  const tilt = (): number => (sim.ship.mode === 'sub' ? settings.subTilt : sim.ship.mode === 'space' ? 1 : settings.horizonTilt);

  const statsEl = document.getElementById('stats')!;
  const save = (): void => saveSettings(settings);
  const setMode = (m: ShipMode, announce = true): void => {
    settings.mode = m;
    if (m !== sim.ship.mode) sim.setMode(m);
    save();
    if (announce) {
      hud.flash(t(`mode.${m}`), '#ffffff');
      konsole.say(t(`mode.${m}Help`));
    }
  };
  const MODES: ShipMode[] = ['sub', 'fighter', 'space'];
  const toggleMode = (): void => setMode(MODES[(MODES.indexOf(sim.ship.mode) + 1) % MODES.length]);
  const cycleWeapon = (): void => {
    const w = sim.weapons.cycle();
    hud.flash(t(`weapon.${w}`), w === 'drill' ? '#ff9a3c' : '#ffffff');
  };
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
      case 'zoom': rig.setZoom(2 ** settings.zoom); break;
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
    startRace: () => {
      if (sim.race && !sim.race.finished) return false;
      sim.startRace();
      settings.mode = sim.ship.mode; save();
      return true;
    },
    stopRace: () => sim.stopRace(),
    species: SPECIES_NAMES,
    setBridge: (url) => {
      if (url !== null) { settings.bridgeUrl = url; save(); chat.connect(url); }
      return chat.active ? t('chat.status', settings.bridgeUrl, chat.status) : t('chat.none');
    },
    setChat: (on) => chat.setEnabled(on),
    spawnMonster: (name) => {
      if (!(name in SPECIES)) return false;
      const s = sim.ship, f = vec3();
      qaxis(f, s.att, 2);
      return creatures.spawn(name as Species, s.pos.x + f.x * 30, s.pos.y + 5, s.pos.z + f.z * 30) !== null;
    },
  });

  // chatbridge: ?bridge=URL v adrese má přednost a uloží se
  const bridgeParam = params.get('bridge');
  if (bridgeParam !== null) { settings.bridgeUrl = bridgeParam; save(); }
  if (settings.bridgeUrl) chat.connect(settings.bridgeUrl);

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
    else if (code === 'Wheel') cycleWeapon();
    else if ((code === 'Digit1' && sim.weapons.weapon !== 'gun') || (code === 'Digit2' && sim.weapons.weapon !== 'drill')) cycleWeapon();
    else if (code === 'KeyL') konsole.say(t(toggleSetting('headlight') ? 'headlight.on' : 'headlight.off'));
    else if (code === 'KeyR') respawnHome();
    else if (code === 'KeyC') cycle('control', ['free', 'direct', 'stick', 'classic']);
    else if (code === 'KeyT') cycle(sim.ship.mode === 'sub' ? 'subTilt' : 'horizonTilt', [1, 0.5, 0.3, 0]);
    else if (code === 'KeyO') cycle('quality', ['low', 'medium', 'high']);
    else if (code === 'Escape') panel.toggle();
    else if (code === 'Slash' || code === 'NumpadDivide') openConsole();
  };
  input.devices.push(new KeyboardMouse(canvas, input, settings, onKey));
  const gamepad = new GamepadInput(settings);
  gamepad.onPress = (b) => { if (b === 8) map.toggle(); else if (b === 9) panel.toggle(); else if (b === 12) cycleWeapon(); };
  input.devices.push(gamepad);
  const touch = isTouch ? new TouchInput(hudRoot, input, () => cycleWeapon()) : null;
  if (touch) input.devices.push(touch);
  for (const [id, fn] of [['b-console', openConsole], ['b-mode', toggleMode], ['b-weapon', cycleWeapon], ['b-map', () => map.toggle()],
    ['b-settings', openPanel], ['b-respawn', respawnHome]] as const) {
    document.getElementById(id)!.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }

  // Ničení terénu (weapons.lua): tunel ve směru střely, kráter při zničení
  const removedMaterial = (removed: number[]): string => {
    const count = new Map<string, number>();
    let best = 'stone', bestN = 0;
    for (let i = 3; i < removed.length; i += 4) {
      const m = impactMaterial(NODES[removed[i]].name);
      const n = (count.get(m) ?? 0) + 1;
      count.set(m, n);
      if (n > bestN) { best = m; bestN = n; }
    }
    return best;
  };
  const hearGain = (x: number, y: number, z: number, max: number): number => {
    const p = rig.camera.globalPosition;
    return Math.max(0, 1 - Math.hypot(x - p.x, y - p.y, z - p.z) / max);
  };
  const boreTunnel = (x: number, y: number, z: number, dx: number, dy: number, dz: number, R: number, L: number): void => {
    const B = WEAPON.TUNNEL_BACKSET;
    const res = carveCapsule(world, x - dx * B, y - dy * B, z - dz * B, x + dx * L, y + dy * L, z + dz * L, R);
    if (res.batch.length) chunks.invalidate(world.setNodes(res.batch));
    debris.spawn(res.removed, x, y, z, 3 + Math.floor(R * 2), { x: dx, y: dy, z: dz });
    effects.fireBurst(x, y, z);
    if (res.removed.length) audio.play(`dw_impact_${removedMaterial(res.removed)}`, hearGain(x, y, z, 250));
  };
  const explodeVoxels = (x: number, y: number, z: number, r: number): void => {
    const res = carveCapsule(world, x, y, z, x, y, z, r);
    if (res.batch.length) chunks.invalidate(world.setNodes(res.batch));
    debris.spawn(res.removed, x, y, z, 3 + Math.floor(r * 2));
    effects.fireBurst(x, y, z);
  };

  // Zvuky monster: smyčka u nejbližších tvorů v doslechu
  const creatureLoops = new Map<number, LoopSound>();
  const MAX_LOOPS = 6;
  const updateCreatureSounds = (): void => {
    const p = rig.camera.globalPosition;
    const near = creatures.list
      .map((c) => ({ c, d: Math.hypot(c.pos.x - p.x, c.pos.y - p.y, c.pos.z - p.z) }))
      .filter((e) => e.d < e.c.def.hear)
      .sort((a, b) => a.d - b.d).slice(0, MAX_LOOPS);
    const keep = new Set(near.map((e) => e.c.id));
    for (const [id, l] of creatureLoops) if (!keep.has(id)) { l.stop(); creatureLoops.delete(id); }
    for (const { c } of near) {
      let l = creatureLoops.get(c.id);
      if (!l) {
        const nl = audio.loop(`dw_creature_${c.species}`, 0.8, c.def.hear);
        if (!nl) continue;
        creatureLoops.set(c.id, l = nl);
      }
      l.setPos(c.pos.x, c.pos.y, c.pos.z);
    }
  };

  const blips: Blip[] = [];
  const collectBlips = (): Blip[] => {
    blips.length = 0;
    for (const c of creatures.list) {
      if (c.species === 'whale') blips.push({ x: c.pos.x, z: c.pos.z, color: '#cfe8f8', size: 10 });
      else blips.push({ x: c.pos.x, z: c.pos.z, color: '#ff6a50', size: 7 });
    }
    if (sim.race) blips.push({ x: sim.race.rabbit.pos.x, z: sim.race.rabbit.pos.z, color: '#ffd75e', size: 9 });
    return blips;
  };

  const aimEl = document.getElementById('aim')!;
  const noseEl = document.getElementById('nose')!;
  const frame = emptyInput();
  let acc = 0;
  const rPos = vec3(), rAtt = quat(), camAtt = quat(), tmp = vec3();
  const wv = new Vector3();
  let statT = 0, frames = 0, worstMs = 0, fxT = 0, ringT = 0;

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
      creatures.step(TICK_DT, sim.ship.pos);
      for (const b of sim.weapons.bullets) if (b.alive) effects.tracer(b.x, b.y, b.z);
      fxT += TICK_DT;
      if (sim.race && fxT >= 0.1) {
        const r = sim.race.rabbit.pos;
        effects.trail(r.x, r.y, r.z);
        ringT -= fxT;
        if (ringT <= 0 && !sim.race.finished && sim.race.cpHit < sim.race.cpIndices.length) {
          ringT = 2;
          const idx = sim.race.cpIndices[sim.race.cpHit], cp = sim.race.route.points[idx];
          const n = sim.race.route.points.length, seg = Math.min(idx, n - 2);
          const tg = tangent(sim.race.route, seg, idx <= seg ? 0 : 1);
          effects.ring(cp.x, cp.y, cp.z, tg.x, tg.y, tg.z);
        }
      }
      if (fxT >= 0.1) fxT = 0;
    }
    chat.update(dt, performance.now() / 1000);
    for (const f of creatures.fx) effects.creature(f.fx, f.x, f.y, f.z);
    creatures.fx.length = 0;
    acc -= ticks * TICK_DT;
    let respawned = false;
    for (const e of sim.events) {
      if (e.type === 'flash') hud.flash(e.text, e.color);
      else if (e.type === 'explode') { explodeVoxels(e.x, e.y, e.z, e.r); audio.play('dw_impact_crash', 1); }
      else if (e.type === 'shot') { audio.play('dw_shot', 0.5, 0.05); effects.muzzle(e.x, e.y, e.z); }
      else if (e.type === 'impact') boreTunnel(e.x, e.y, e.z, e.dx, e.dy, e.dz, e.r, e.len);
      else if (e.type === 'carve') { const res = carveAlong(world, e.pts, e.r); if (res.batch.length) chunks.invalidate(world.setNodes(res.batch)); }
      else if (e.type === 'race_end') {
        konsole.say(e.ok ? t('race.finished', formatTime(e.time), e.cp, e.cpTotal, e.score) : t('race.failed'));
      }
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
    const race = sim.race;
    rabbit.isVisible = race !== null;
    if (race) {
      const r = race.rabbit;
      rabbit.position.set(r.pos.x, r.pos.y, r.pos.z);
      rabbit.rotationQuaternion!.set(r.att.x, r.att.y, r.att.z, r.att.w);
    }
    creaturesView.update(creatures.list);

    qaxis(tmp, rAtt, 2);
    mats.setHeadlight(settings.headlight && !sim.dead, rPos.x + tmp.x * 2, rPos.y + tmp.y * 2, rPos.z + tmp.z * 2, tmp.x, tmp.y, tmp.z);

    chunks.update(rPos.x, rPos.y, rPos.z);
    const eye = rig.camera.globalPosition;
    impostors.update(eye);
    sky.update(dt, eye);
    debris.update(dt);
    particles.update(dt, rig.camera, fogD);
    {
      const f = rig.camera.getDirection(Vector3.Forward()), u = rig.camera.upVector;
      audio.setListener(eye.x, eye.y, eye.z, f.x, f.y, f.z, u.x, u.y, u.z);
    }
    updateCreatureSounds();
    audio.update(dt, rPos.x, rPos.z, seed);
    scene.render();

    // zaměřovač podle zbraně: vrták = oranžový kruh, oblouk ukazuje nádrž
    const drill = sim.weapons.weapon === 'drill';
    aimEl.classList.toggle('drill', drill);
    touch?.setWeapon(drill);
    if (drill) aimEl.style.setProperty('--charge', sim.weapons.drill.toFixed(2));
    project(s.aim, aimEl);
    project(tmp, noseEl);
    const bl = collectBlips();
    hud.update(sim, settings, bl);
    map.draw(s.pos.x, s.pos.z, headingAngle(s.att), bl);
    if (race && !race.finished) projectPoint(race.nextCheckpoint, hud.raceWp, true);
    else hud.raceWp.style.display = 'none';

    frames++;
    worstMs = Math.max(worstMs, engine.getDeltaTime());
    statT += dt;
    if (statT >= 0.5) {
      if (settings.stats) {
        statsEl.textContent =
          `${(frames / statT).toFixed(0)} FPS · max ${worstMs.toFixed(0)} ms · ${instr.drawCallsCounter.current} DC\n`
          + `${((chunks.stats.quads * 2 + impostors.triangles) / 1000).toFixed(0)}k tri · ${chunks.stats.meshes} meshů · ${impostors.count} impostorů`
          + ` · fronta ${chunks.stats.queued}+${chunks.stats.running} · job ${chunks.stats.jobMs.toFixed(1)} ms\n`
          + `${creatures.count} tvorů · ${particles.count} částic · ${debris.count} sutin · ${world.edits.size} editací\n`
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

  function projectPoint(pt: Vec3, elm: HTMLElement, withDist: boolean): void {
    const cam = rig.camera, cp = cam.globalPosition;
    const fwd = cam.getDirection(Vector3.Forward(scene.useRightHandedSystem));
    if ((pt.x - cp.x) * fwd.x + (pt.y - cp.y) * fwd.y + (pt.z - cp.z) * fwd.z <= 0) { elm.style.display = 'none'; return; }
    wv.set(pt.x, pt.y, pt.z);
    const p = Vector3.TransformCoordinates(wv, scene.getTransformMatrix());
    elm.style.display = '';
    elm.style.transform = `translate(${((p.x + 1) / 2) * canvas.clientWidth}px, ${((1 - p.y) / 2) * canvas.clientHeight}px)`;
    if (withDist) {
      const d = `${Math.round(Math.hypot(pt.x - rPos.x, pt.y - rPos.y, pt.z - rPos.z))} m`;
      let sp = elm.firstElementChild as HTMLElement | null;
      if (!sp) { sp = document.createElement('span'); elm.append(sp); }
      if (sp.textContent !== d) sp.textContent = d;
    }
  }

  addEventListener('resize', () => engine.resize());
  (window as unknown as { bw: unknown }).bw = { engine, scene, sim, chunks, impostors, settings, input, instr, world, audio, map, panel, creatures, particles, debris, chat };
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('error')!.textContent = String(e);
});

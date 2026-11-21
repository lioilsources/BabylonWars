// Zvuk přes WebAudio (port music.lua + zvuků z weapons.lua).
// Formát: Ogg Vorbis, kde ho prohlížeč umí (canPlayType), jinak .m4a ze
// sync-assets. AudioContext vzniká až s prvním gestem (autoplay politika).
// Hudba: téma biomu nejbližšího ostrova, mezi ostrovy obloha, 6 s crossfade.
// Témata se streamují přes <audio> (dekódované by braly desítky MB), efekty
// jsou krátké a dekódují se do bufferů.
import { nearestIsland } from '../gen/islands';
import { TUNING } from './settings';

const SKY = 'sky';

interface Track { el: HTMLAudioElement; gain: GainNode; theme: string }

export class AudioSys {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ext: 'ogg' | 'm4a';
  private variants = new Map<string, number>();   // základ → počet variant (0 = bez čísla)
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private track: Track | null = null;
  private theme: string | null = null;
  private wanted = SKY;
  private checkT = 0;
  musicOn = true;

  constructor(private base: string, manifest: string[], private vol: { music: number; sfx: number }) {
    const probe = document.createElement('audio');
    this.ext = probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    for (const f of manifest) {
      const m = /^(.*?)(?:\.(\d+))?\.ogg$/.exec(f);
      if (!m) continue;
      const n = m[2] ? Number(m[2]) : 0;
      this.variants.set(m[1], Math.max(this.variants.get(m[1]) ?? 0, n));
    }
    const unlock = (): void => { this.unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { capture: true });
  }

  get format(): string { return this.ext; }
  has(name: string): boolean { return this.variants.has(name); }

  private unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.ctx.destination);
      this.sfxBus.connect(this.ctx.destination);
      this.setVolumes(this.vol.music, this.vol.sfx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(music: number, sfx: number): void {
    this.vol = { music, sfx };
    if (this.ctx && this.musicBus && this.sfxBus) {
      this.musicBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.1);
      this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.1);
    }
  }

  private url(file: string): string { return `${this.base}assets/sounds/${file}.${this.ext}`; }

  private load(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p) {
      const ctx = this.ctx!;
      p = fetch(this.url(file)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx.decodeAudioData(b)).catch(() => null);
      this.buffers.set(file, p);
    }
    return p;
  }

  /** Krátký efekt; náhodná varianta name.N, gain 0…1, výška ±10 % */
  play(name: string, gain = 1, pitchJitter = 0.1): void {
    const ctx = this.ctx, bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const n = this.variants.get(name);
    if (n === undefined) return;
    const file = n > 0 ? `${name}.${1 + Math.floor(Math.random() * n)}` : name;
    void this.load(file).then((buf) => {
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 1 - pitchJitter + Math.random() * 2 * pitchJitter;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(bus);
      src.start();
    });
  }

  /** Volá se každý frame; téma se přepočítá jednou za checkInterval */
  update(dt: number, x: number, z: number, seed: number): void {
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = TUNING.music.checkInterval;
    this.wanted = this.wantedTheme(x, z, seed);
    this.applyTheme();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    this.applyTheme();
  }

  private wantedTheme(x: number, z: number, seed: number): string {
    const r = nearestIsland(x, z, seed);
    if (!r) return SKY;
    const edge = r.dist - r.isl.radius, biome = r.isl.biome.name;
    if (edge <= TUNING.music.enterMargin) return biome;
    // hystereze: v pásmu mezi ENTER a LEAVE drž, co hraje
    if (edge <= TUNING.music.leaveMargin && this.wanted === biome) return biome;
    return SKY;
  }

  private applyTheme(): void {
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const want = this.musicOn ? this.wanted : null;
    if (want === this.theme) return;
    this.theme = want;
    const fade = TUNING.music.fade, now = ctx.currentTime;
    const old = this.track;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => { old.el.pause(); old.el.src = ''; old.gain.disconnect(); }, fade * 1000 + 200);
      this.track = null;
    }
    if (!want || !this.has(`dw_music_${want}`)) return;
    const el = new Audio(this.url(`dw_music_${want}`));
    el.loop = true;
    el.crossOrigin = 'anonymous';
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    ctx.createMediaElementSource(el).connect(gain).connect(bus);
    void el.play().catch(() => { /* bez gesta; zkusí se při další kontrole */ this.theme = null; });
    this.track = { el, gain, theme: want };
  }
}

/** Materiál zásahu podle jména nodu (weapons.lua material_of, zjednodušeno) */
export function impactMaterial(node: string): string {
  if (/crystal|glass|quartz/.test(node)) return 'crystal';
  if (/magma|lava|embers|obsidian/.test(node)) return 'magma';
  if (/ice|snow|permafrost/.test(node)) return 'ice';
  if (/tree|wood|log|trunk|stem|cactus/.test(node)) return 'wood';
  if (/leaves|grass_\d|fern|shrub|flower|mushroom|spore_cap|vine|reed|lily/.test(node)) return 'leaves';
  if (/sand|gravel|ash/.test(node)) return 'sand';
  if (/dirt|mud|clay|spore|moss_block/.test(node)) return 'dirt';
  return 'stone';
}

// Chat příkazy z Luanti jako konzole na „/“ (a tlačítko v menu na telefonu).
import { BIOMES } from '../gen/biomes';
import { frameSpawn, nearestIslandOfBiome } from '../gen/islands';
import { t, type I18nKey } from './i18n';

export interface CommandContext {
  seed: number;
  pos(): { x: number; y: number; z: number };
  teleport(x: number, y: number, z: number, yaw?: number): void;
  say(msg: string): void;
  setMode(mode: 'sub' | 'fighter'): void;
  /** přepínač z nastavení (music, headlight, radar); on = undefined přepne */
  toggle(key: 'music' | 'headlight' | 'radar', on?: boolean): boolean;
  toggleMap(): void;
  setLang(lang: 'cs' | 'en'): void;
}

const onOff = (a?: string): boolean | undefined => (a === 'on' ? true : a === 'off' ? false : undefined);
const toggleCmd = (key: 'music' | 'headlight' | 'radar', help: I18nKey): { help: () => string; run: Handler } => ({
  help: () => t(help),
  run: (args, ctx) => {
    const on = ctx.toggle(key, onOff(args[0]?.toLowerCase()));
    ctx.say(t(`${key}.${on ? 'on' : 'off'}` as I18nKey));
  },
});

type Handler = (args: string[], ctx: CommandContext) => void;

const COMMANDS: Record<string, { help: () => string; run: Handler }> = {
  island: {
    help: () => t('cmd.island'),
    run: (args, ctx) => {
      const name = (args[0] ?? '').toLowerCase();
      if (!BIOMES.some((b) => b.name === name)) {
        ctx.say(t('cmd.biomes', BIOMES.map((b) => b.name).join(', ')));
        return;
      }
      const p = ctx.pos();
      const r = nearestIslandOfBiome(p.x, p.z, name, ctx.seed);
      if (!r) { ctx.say(t('cmd.noIsland', name)); return; }
      const s = frameSpawn(r.isl, p.x, p.z);
      ctx.teleport(s.x, s.y + 20, s.z, s.yaw);
      ctx.say(`${name}: ${r.isl.x}, ${r.isl.y}, ${r.isl.z} (r ${r.isl.radius}, ${r.isl.shape}${r.isl.tunnels ? ', tunnels' : ''})`);
    },
  },
  goto: {
    help: () => t('cmd.goto'),
    run: (args, ctx) => {
      const [x, y, z] = args.map(Number);
      if ([x, y, z].some((v) => !Number.isFinite(v))) { ctx.say(t('cmd.gotoUsage')); return; }
      ctx.teleport(x, y, z);
    },
  },
  mode: {
    help: () => t('cmd.mode'),
    run: (args, ctx) => {
      const m = (args[0] ?? '').toLowerCase();
      if (m === 'sub' || m === 'fighter') ctx.setMode(m);
      else ctx.say(t('cmd.modeUsage'));
    },
  },
  seed: {
    help: () => t('cmd.seedHelp'),
    run: (_a, ctx) => ctx.say(t('cmd.seed', ctx.seed)),
  },
  music: toggleCmd('music', 'cmd.music'),
  headlight: toggleCmd('headlight', 'cmd.headlight'),
  radar: toggleCmd('radar', 'cmd.radar'),
  map: { help: () => t('cmd.map'), run: (_a, ctx) => ctx.toggleMap() },
  lang: {
    help: () => t('cmd.lang'),
    run: (args, ctx) => { const l = args[0]?.toLowerCase(); if (l === 'cs' || l === 'en') ctx.setLang(l); else ctx.say(t('cmd.lang')); },
  },
  help: {
    help: () => '/help',
    run: (_a, ctx) => ctx.say(Object.values(COMMANDS).map((c) => c.help()).join('\n')),
  },
};

export function runCommand(line: string, ctx: CommandContext): void {
  const [cmd, ...args] = line.replace(/^\//, '').trim().split(/\s+/);
  const c = COMMANDS[cmd?.toLowerCase() ?? ''];
  if (!c) { ctx.say(t('cmd.unknown', cmd ?? '')); return; }
  c.run(args, ctx);
}

/** Konzole: input v HUDu, otevírá se klávesou „/“ nebo tlačítkem */
export class Console {
  private input: HTMLInputElement;
  private log: HTMLElement;
  private hideT = 0;
  constructor(root: HTMLElement, private ctx: CommandContext) {
    this.log = document.createElement('pre');
    this.log.id = 'console-log';
    this.input = document.createElement('input');
    this.input.id = 'console';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    root.append(this.log, this.input);
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = this.input.value; this.close(); if (v.trim()) runCommand(v, this.ctx); }
      else if (e.key === 'Escape') this.close();
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
  }
  get isOpen(): boolean { return this.input.classList.contains('open'); }
  open(): void {
    document.exitPointerLock?.();
    this.input.value = '/';
    this.input.classList.add('open');
    setTimeout(() => this.input.focus(), 0);
  }
  close(): void { this.input.classList.remove('open'); this.input.blur(); }
  say(msg: string): void {
    this.log.textContent = msg;
    this.log.classList.add('open');
    clearTimeout(this.hideT);
    this.hideT = window.setTimeout(() => this.log.classList.remove('open'), 6000);
  }
}

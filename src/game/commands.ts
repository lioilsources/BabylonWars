// Chat příkazy z Luanti jako konzole na „/“ (a tlačítko v menu na telefonu).
import { BIOMES } from '../gen/biomes';
import { frameSpawn, nearestIslandOfBiome } from '../gen/islands';

export interface CommandContext {
  seed: number;
  pos(): { x: number; y: number; z: number };
  teleport(x: number, y: number, z: number, yaw?: number): void;
  say(msg: string): void;
  setMode(mode: 'sub' | 'fighter'): void;
}

type Handler = (args: string[], ctx: CommandContext) => void;

const COMMANDS: Record<string, { help: string; run: Handler }> = {
  island: {
    help: '/island <biom> — přílet k nejbližšímu ostrovu biomu',
    run: (args, ctx) => {
      const name = (args[0] ?? '').toLowerCase();
      if (!BIOMES.some((b) => b.name === name)) {
        ctx.say(`Biomy: ${BIOMES.map((b) => b.name).join(', ')}`);
        return;
      }
      const p = ctx.pos();
      const r = nearestIslandOfBiome(p.x, p.z, name, ctx.seed);
      if (!r) { ctx.say(`Žádný ostrov „${name}“ v okolí.`); return; }
      const s = frameSpawn(r.isl, p.x, p.z);
      ctx.teleport(s.x, s.y + 20, s.z, s.yaw);
      ctx.say(`${name}: ostrov ${r.isl.x}, ${r.isl.y}, ${r.isl.z} (r ${r.isl.radius}, ${r.isl.shape}${r.isl.tunnels ? ', tunely' : ''})`);
    },
  },
  goto: {
    help: '/goto <x> <y> <z>',
    run: (args, ctx) => {
      const [x, y, z] = args.map(Number);
      if ([x, y, z].some((v) => !Number.isFinite(v))) { ctx.say('Použití: /goto x y z'); return; }
      ctx.teleport(x, y, z);
    },
  },
  mode: {
    help: '/mode [sub|fighter] — ponorka / stíhačka (bez argumentu přepne)',
    run: (args, ctx) => {
      const m = (args[0] ?? '').toLowerCase();
      if (m === 'sub' || m === 'fighter') ctx.setMode(m);
      else ctx.say('Použití: /mode sub | /mode fighter');
    },
  },
  seed: {
    help: '/seed — seed světa (jiný svět: ?seed=… v adrese)',
    run: (_a, ctx) => ctx.say(`Seed: ${ctx.seed}`),
  },
  help: {
    help: '/help',
    run: (_a, ctx) => ctx.say(Object.values(COMMANDS).map((c) => c.help).join('\n')),
  },
};

export function runCommand(line: string, ctx: CommandContext): void {
  const [cmd, ...args] = line.replace(/^\//, '').trim().split(/\s+/);
  const c = COMMANDS[cmd?.toLowerCase() ?? ''];
  if (!c) { ctx.say(`Neznámý příkaz: /${cmd}. Zkus /help`); return; }
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

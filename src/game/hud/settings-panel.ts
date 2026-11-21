// Panel nastavení (Esc / ⚙). Každá změna se hned uloží a ohlásí přes
// onChange(klíč) — main.ts ji aplikuje (kvalita, hlasitost, režim…).
import { t, type I18nKey } from '../i18n';
import type { Settings } from '../settings';

type Opt = { key: keyof Settings; label: I18nKey } & (
  | { kind: 'select'; options: { v: string | number; label: I18nKey | string }[] }
  | { kind: 'range'; min: number; max: number; step: number }
  | { kind: 'check' }
);

const ROWS: Opt[] = [
  { key: 'lang', label: 'set.lang', kind: 'select', options: [{ v: 'cs', label: 'Čeština' }, { v: 'en', label: 'English' }] },
  { key: 'mode', label: 'set.mode', kind: 'select', options: [{ v: 'sub', label: 'opt.sub' }, { v: 'fighter', label: 'opt.fighter' }] },
  { key: 'control', label: 'set.control', kind: 'select', options: [{ v: 'free', label: 'opt.free' }, { v: 'direct', label: 'opt.direct' }, { v: 'classic', label: 'opt.classic' }] },
  { key: 'horizonTilt', label: 'set.horizonTilt', kind: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'subTilt', label: 'set.subTilt', kind: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'view', label: 'set.view', kind: 'select', options: [{ v: 'chase', label: 'opt.chase' }, { v: 'nose', label: 'opt.nose' }] },
  { key: 'quality', label: 'set.quality', kind: 'select', options: [{ v: 'low', label: 'opt.low' }, { v: 'medium', label: 'opt.medium' }, { v: 'high', label: 'opt.high' }] },
  { key: 'mouseSens', label: 'set.mouseSens', kind: 'range', min: 0.0006, max: 0.006, step: 0.0002 },
  { key: 'invertY', label: 'set.invertY', kind: 'check' },
  { key: 'music', label: 'set.music', kind: 'check' },
  { key: 'musicVolume', label: 'set.musicVolume', kind: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'sfxVolume', label: 'set.sfxVolume', kind: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'headlight', label: 'set.headlight', kind: 'check' },
  { key: 'radar', label: 'set.radar', kind: 'check' },
  { key: 'attitude', label: 'set.attitude', kind: 'check' },
  { key: 'stats', label: 'set.stats', kind: 'check' },
];

const ABOUT_LINKS = {
  source: 'https://github.com/lioilsources/BabylonWars',
  privacy: 'https://lioilsources.github.io/BabylonWars/privacy.html',
  license: 'https://creativecommons.org/licenses/by-sa/4.0/',
};

export class SettingsPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;

  constructor(root: HTMLElement, private s: Settings, private onChange: (key: keyof Settings) => void) {
    this.el = document.createElement('div');
    this.el.id = 'settings';
    this.body = document.createElement('div');
    this.body.className = 'panel';
    this.el.append(this.body);
    root.append(this.el);
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    for (const ev of ['keydown', 'keyup'] as const) {
      this.el.addEventListener(ev, (e) => {
        if (ev === 'keydown' && (e as KeyboardEvent).key === 'Escape') this.close();
        e.stopPropagation();
      });
    }
  }

  get isOpen(): boolean { return this.el.classList.contains('open'); }

  open(): void {
    document.exitPointerLock?.();
    this.render();
    this.el.classList.add('open');
  }

  close(): void { this.el.classList.remove('open'); }
  toggle(): void { if (this.isOpen) this.close(); else this.open(); }

  /** Znovu vykreslí řádky (po změně jazyka nebo zvenku změněném nastavení) */
  render(): void {
    const b = this.body;
    b.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = t('set.title');
    b.append(h);
    const rec = this.s as unknown as Record<string, string | number | boolean>;
    for (const r of ROWS) {
      const row = document.createElement('label');
      row.className = 'row';
      const name = document.createElement('span');
      name.textContent = t(r.label);
      row.append(name);
      if (r.kind === 'select') {
        const sel = document.createElement('select');
        for (const o of r.options) {
          const op = document.createElement('option');
          op.value = String(o.v);
          op.textContent = o.label.includes('.') ? t(o.label as I18nKey) : o.label;
          sel.append(op);
        }
        sel.value = String(rec[r.key]);
        sel.addEventListener('change', () => { rec[r.key] = sel.value; this.onChange(r.key); });
        row.append(sel);
      } else if (r.kind === 'range') {
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = String(r.min); inp.max = String(r.max); inp.step = String(r.step);
        inp.value = String(rec[r.key]);
        inp.addEventListener('input', () => { rec[r.key] = Number(inp.value); this.onChange(r.key); });
        row.append(inp);
      } else {
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = Boolean(rec[r.key]);
        inp.addEventListener('change', () => { rec[r.key] = inp.checked; this.onChange(r.key); });
        row.append(inp);
      }
      b.append(row);
    }
    const help = document.createElement('p');
    help.className = 'keys';
    help.textContent = `${t('help.keys')}\n${t('help.keys2')}`;
    // autoři a licence (CC BY-SA vyžaduje uvedení i v obchodních buildech)
    const about = document.createElement('details');
    about.className = 'about';
    const sum = document.createElement('summary');
    sum.textContent = t('about.title');
    const txt = document.createElement('p');
    txt.textContent = t('about.text');
    const links = document.createElement('p');
    for (const [k, href] of [['about.source', ABOUT_LINKS.source], ['about.privacy', ABOUT_LINKS.privacy], ['CC BY-SA 4.0', ABOUT_LINKS.license]] as const) {
      const a = document.createElement('a');
      a.href = href; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = k.startsWith('about.') ? t(k as I18nKey) : k;
      links.append(a, ' ');
    }
    about.append(sum, txt, links);
    b.append(about);
    const close = document.createElement('button');
    close.textContent = t('set.close');
    close.addEventListener('click', () => this.close());
    b.append(help, close);
  }
}

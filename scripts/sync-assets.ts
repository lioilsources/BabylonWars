// Zkopíruje assety z DoggioWars (vlastní tvorba, MIT) do public/assets.
// Použití: DOGGIOWARS_DIR=../DoggioWars npm run sync-assets [-- --sounds]
// Se --sounds navíc vyrobí .m4a (AAC) vedle každého .ogg přes ffmpeg —
// fallback pro prohlížeče, které Ogg Vorbis neumí (starší Safari).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve(process.env.DOGGIOWARS_DIR ?? '../DoggioWars');
if (!existsSync(join(src, 'mods'))) {
  console.error(`DOGGIOWARS_DIR nevede na klon DoggioWars: ${src}`);
  process.exit(1);
}
const withSounds = process.argv.includes('--sounds');
const kinds = ['textures', 'models', ...(withSounds ? ['sounds'] : [])];
const out = resolve('public/assets');
const manifest: Record<string, string[]> = {};

for (const mod of readdirSync(join(src, 'mods'))) {
  for (const kind of kinds) {
    const dir = join(src, 'mods', mod, kind);
    if (!existsSync(dir)) continue;
    mkdirSync(join(out, kind), { recursive: true });
    for (const f of readdirSync(dir)) {
      if (kind === 'sounds' && !f.endsWith('.ogg')) continue;
      cpSync(join(dir, f), join(out, kind, f));
      (manifest[kind] ??= []).push(f);
    }
  }
}

if (withSounds) {
  let made = 0;
  for (const f of manifest.sounds ?? []) {
    const ogg = join(out, 'sounds', f);
    const m4a = ogg.replace(/\.ogg$/, '.m4a');
    if (existsSync(m4a) && statSync(m4a).mtimeMs >= statSync(ogg).mtimeMs) continue;
    // hudba stereo 96 kb/s, efekty a bytosti 64 kb/s
    const rate = f.startsWith('dw_music_') ? '96k' : '64k';
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', ogg, '-c:a', 'aac', '-b:a', rate, m4a], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`ffmpeg selhal: ${f}`); process.exit(1); }
    made++;
  }
  console.log(`m4a: ${made} nových`);
}

for (const k of Object.keys(manifest)) manifest[k].sort();
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(Object.entries(manifest).map(([k, v]) => `${k}: ${v.length}`).join(', '));

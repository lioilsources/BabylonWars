// Zkopíruje assety z DoggioWars (vlastní tvorba, MIT) do public/assets.
// Použití: DOGGIOWARS_DIR=../DoggioWars npm run sync-assets [-- --sounds]
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
      cpSync(join(dir, f), join(out, kind, f));
      (manifest[kind] ??= []).push(f);
    }
  }
}
for (const k of Object.keys(manifest)) manifest[k].sort();
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(Object.entries(manifest).map(([k, v]) => `${k}: ${v.length}`).join(', '));

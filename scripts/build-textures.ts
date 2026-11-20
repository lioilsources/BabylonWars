// PNG 16×16 z public/assets/textures → svislý pás vrstev pro texture array
// (public/assets/blocks.png) + blocks.json (pořadí vrstev, průměrné barvy).
// Pořadí vrstev = TEXTURES z registru, takže worker i build ho znají stejně.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { TEXTURES } from '../src/voxel/registry';

const SIZE = 16;
const dir = resolve('public/assets/textures');
const out = new PNG({ width: SIZE, height: SIZE * TEXTURES.length });
const avg: number[][] = [];
const missing: string[] = [];

TEXTURES.forEach((name, layer) => {
  const file = join(dir, name);
  let src: PNG | null = null;
  if (existsSync(file)) src = PNG.sync.read(readFileSync(file));
  else missing.push(name);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = ((layer * SIZE + y) * SIZE + x) * 4;
      let px = [255, 0, 255, 255]; // chybějící textura = magenta
      if (src) {
        // textura jiné velikosti se vzorkuje nejbližším sousedem
        const sx = Math.floor(x * src.width / SIZE), sy = Math.floor(y * src.height / SIZE);
        const i = (sy * src.width + sx) * 4;
        px = [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
      }
      out.data[o] = px[0]; out.data[o + 1] = px[1]; out.data[o + 2] = px[2]; out.data[o + 3] = px[3];
      if (px[3] > 127) { r += px[0]; g += px[1]; b += px[2]; n++; }
    }
  }
  avg.push(n ? [r / n / 255, g / n / 255, b / n / 255].map((v) => Math.round(v * 1000) / 1000) : [1, 0, 1]);
});

writeFileSync(resolve('public/assets/blocks.png'), PNG.sync.write(out));
writeFileSync(resolve('public/assets/blocks.json'), JSON.stringify({ size: SIZE, layers: TEXTURES, avg }) + '\n');
console.log(`blocks.png: ${TEXTURES.length} vrstev${missing.length ? `, chybí: ${missing.join(', ')}` : ''}`);

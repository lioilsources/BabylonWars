// Ikony PWA: pixel-art 16×16 (vzdušný ostrov s trávou a zlatou stíhačkou na
// tmavě modrém nebi jako sky.lua), zvětšený nearest-neighbor.
// npm run icons → public/icons/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

type RGB = [number, number, number];
const SKY: RGB = [0x2e, 0x31, 0x55], ZEN: RGB = [0x16, 0x19, 0x36];
const C: Record<string, RGB> = {
  g: [0x5d, 0xa1, 0x3b], G: [0x46, 0x7d, 0x2c], d: [0x7a, 0x55, 0x36], s: [0x6b, 0x6b, 0x6b], S: [0x4e, 0x4e, 0x52],
  y: [0xff, 0xd7, 0x5e], Y: [0xc9, 0x9a, 0x2e], w: [0xe8, 0xec, 0xff],
};
// '.' = nebe
const ART = [
  '................',
  '..w.........w...',
  '.......yy.......',
  '...Y.yyyyyy.Y...',
  '......yyyy......',
  '..........w.....',
  '...gggGgggGgg...',
  '..gGggggGgggGg..',
  '..dddddgdddddd..',
  '...ddsddddsdd...',
  '...sssdssssss...',
  '....sSsssSss....',
  '.....sssSss.....',
  '......sSss......',
  '.......ss.......',
  '................',
];

function render(size: number, pad: number): PNG {
  const png = new PNG({ width: size, height: size });
  const inner = size - pad * 2, cell = inner / 16;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = y / size;
    let c: RGB = [ZEN[0] + (SKY[0] - ZEN[0]) * t, ZEN[1] + (SKY[1] - ZEN[1]) * t, ZEN[2] + (SKY[2] - ZEN[2]) * t];
    const gx = Math.floor((x - pad) / cell), gy = Math.floor((y - pad) / cell);
    if (gx >= 0 && gy >= 0 && gx < 16 && gy < 16) {
      const ch = ART[gy][gx];
      if (ch !== '.') c = C[ch];
    }
    const i = (y * size + x) * 4;
    png.data[i] = Math.round(c[0]); png.data[i + 1] = Math.round(c[1]); png.data[i + 2] = Math.round(c[2]); png.data[i + 3] = 255;
  }
  return png;
}

mkdirSync('public/icons', { recursive: true });
const out: [string, number, number][] = [
  ['icon-192.png', 192, 0], ['icon-512.png', 512, 0],
  // maskable: obsah v bezpečné zóně (80 %)
  ['maskable-512.png', 512, 52], ['apple-touch-icon.png', 180, 10], ['favicon-32.png', 32, 0],
];
for (const [name, size, pad] of out) {
  writeFileSync(`public/icons/${name}`, PNG.sync.write(render(size, pad)));
  console.log(`public/icons/${name}`);
}

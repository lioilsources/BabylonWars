// Ikony: pixel-art 16×16 (vzdušný ostrov s trávou a zlatou stíhačkou na
// tmavě modrém nebi jako sky.lua), zvětšený nearest-neighbor.
// npm run icons → public/icons/*.png (PWA), iOS AppIcon + Splash, Android mipmapy + splash.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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

interface Opts {
  /** velikost kresby (px); výchozí = menší rozměr bez paddingu */
  art?: number;
  pad?: number;
  /** kruhová maska (Android ic_launcher_round) */
  round?: boolean;
}

/** Nebe s přechodem přes celý obrázek, kresba uprostřed */
function render(w: number, h: number, o: Opts = {}): PNG {
  const png = new PNG({ width: w, height: h });
  const art = o.art ?? Math.min(w, h) - (o.pad ?? 0) * 2;
  const cell = art / 16, ox = (w - art) / 2, oy = (h - art) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / h;
    let c: RGB = [ZEN[0] + (SKY[0] - ZEN[0]) * t, ZEN[1] + (SKY[1] - ZEN[1]) * t, ZEN[2] + (SKY[2] - ZEN[2]) * t];
    const gx = Math.floor((x - ox) / cell), gy = Math.floor((y - oy) / cell);
    if (gx >= 0 && gy >= 0 && gx < 16 && gy < 16) {
      const ch = ART[gy][gx];
      if (ch !== '.') c = C[ch];
    }
    const i = (y * w + x) * 4;
    const r = w / 2, dx = x + 0.5 - r, dy = y + 0.5 - r;
    const a = o.round && dx * dx + dy * dy > r * r ? 0 : 255;
    png.data[i] = Math.round(c[0]); png.data[i + 1] = Math.round(c[1]); png.data[i + 2] = Math.round(c[2]); png.data[i + 3] = a;
  }
  return png;
}

function save(path: string, png: PNG, alpha = true): void {
  mkdirSync(dirname(path), { recursive: true });
  // App Store odmítne ikonu s alfa kanálem → RGB bez alfy
  writeFileSync(path, PNG.sync.write(png, alpha ? {} : { colorType: 2 }));
  console.log(path);
}

// PWA
const pwa: [string, number, number][] = [
  ['icon-192.png', 192, 0], ['icon-512.png', 512, 0],
  // maskable: obsah v bezpečné zóně (80 %)
  ['maskable-512.png', 512, 52], ['apple-touch-icon.png', 180, 10], ['favicon-32.png', 32, 0],
];
for (const [name, size, pad] of pwa) save(`public/icons/${name}`, render(size, size, { pad }));

// iOS (Capacitor)
const IOS = 'ios/App/App/Assets.xcassets';
if (existsSync(IOS)) {
  save(`${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`, render(1024, 1024), false);
  // splash: kresba na čtvrtinu kratší strany, ať ji iOS při ořezu na displej neusekne
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    save(`${IOS}/Splash.imageset/${f}`, render(2732, 2732, { art: 640 }), false);
  }
}

// Android (Capacitor)
const RES = 'android/app/src/main/res';
if (existsSync(RES)) {
  const dens: [string, number][] = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];
  for (const [d, k] of dens) {
    const s = 48 * k, f = 108 * k;
    save(`${RES}/mipmap-${d}/ic_launcher.png`, render(s, s));
    save(`${RES}/mipmap-${d}/ic_launcher_round.png`, render(s, s, { round: true }));
    // adaptivní popředí 108 dp: kresba v bezpečné zóně 66 dp (maska ji ořízne)
    save(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, render(f, f, { art: Math.round(66 * k) }));
  }
  const splash: [string, number, number][] = [
    ['drawable', 480, 320],
    ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480], ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280],
    ['drawable-port-mdpi', 320, 480], ['drawable-port-hdpi', 480, 800], ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920],
  ];
  for (const [d, w, h] of splash) save(`${RES}/${d}/splash.png`, render(w, h, { art: Math.round(Math.min(w, h) * 0.35) }), false);
}

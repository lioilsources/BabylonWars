# BabylonWars

Webová verze [DoggioWars](https://github.com/lioilsources/DoggioWars) nad Babylon.js:
vzdušné ostrovy z kostek, stíhačka s **plným 6DoF** a **horizontem, který se naklání
s letadlem** (to Luanti neumí). Luanti verze dál žije ve svém repu.

## Ovládání

| | Klávesnice + myš | Gamepad | Dotyk |
|---|---|---|---|
| Míření | myš (klikni do hry) | pravá páčka | tah pravým palcem |
| Plyn | W / S | levá páčka ↑↓ | levý joystick ↑↓ |
| Náklon | A / D | levá páčka ↔ | levý joystick ↔ |
| Nahoru / dolů | Space / Shift | RB / LT | — |
| Boost | E / pravé tlačítko | A / LB | BOOST |

Levé tlačítko myši / RT / FIRE zatím střílí ladicí paprsek, který vykousne do
ostrova kouli (ověření editací světa; skutečné zbraně přijdou v F5).

Přepínače: **C** řízení (`free` → `direct` → `classic`), **T** náklon horizontu
(100 / 50 / 0 %), **V** pohled (za letadlem / z nosu), **Q** kvalita, **R** respawn.
Na telefonu jsou stejná tlačítka vpravo nahoře. Seed světa: `?seed=12345`.

- `free` — myš táhne zaměřovač v prostoru, letadlo ho honí; looping uletíš tahem nahoru.
- `direct` — myš/páčka = úhlové rychlosti, A/D výkrut, žádné samosrovnávání.
- `classic` — zaměřovač s Luanti stropem pohledu (plná parita přijde v F3).

## Stav: F0 (spike, brána výkonu)

Hotovo: scaffold (Vite, TS strict, Vitest, ESLint hranice vrstev, deploy na Pages),
port rozmístění ostrovů 1:1 s Lua (golden test proti reálnému `mapgen.lua`), tvary
z profilů, vlastní šum, greedy mesher s LOD (voxel 1–8 bloků podle vzdálenosti)
ve workerech, stíhačka z `.obj`, let `free`/`direct`, kamera se slerpem horizontu
a interpolací mezi ticky, klávesnice/myš, gamepad, dotyk, FPS a draw cally v rohu.

## Stav: F1 (voxelová vrstva)

Hotovo: registr nodů podle `dw_nodes` a `dw_core/nodes.lua` (jména zachovaná, drawtypy
normal / allfaces / glasslike / plantlike / firelike / nodebox / liquid), texture array
16×16 z PNG (`npm run textures` → `public/assets/blocks.png`), greedy mesher s AO
a analytickým světlem (spodky ostrovů a tunely tmavé bez flood-fillu), tři průchody
(opaque bez discard / cutout / průhledný), bity pro kolize, raycast (DDA), tažená
koule, editace světa s přestavbou dotčených chunků.

Měření (M2, Chrome, 60 Hz): let 60 m/s přes ostrovy — 1 frame z 600 nad 25 ms,
upload meshe ≤ 2 za frame.

Zatím chybí (další fáze): kolize lodi (F3), dekorace a tekutiny (F2), zvuk a HUD (F4).

### Měření brány F0

| Zařízení | Kvalita | FPS | Draw cally | Trojúhelníky |
|---|---|---|---|---|
| MacBook (M2, Chrome, 60 Hz displej) | high | 60 (strop vsync) | 60–115 | ~600 k |
| _telefon (doplní Ol1n)_ | low | | | |

## Vývoj

```sh
npm install
npm run dev          # http://localhost:5173, na LAN i pro telefon
npm run gate         # lint + testy + typecheck + build
cp .env.example .env # DOGGIOWARS_DIR = klon DoggioWars
npm run sync-assets  # assety z DoggioWars do public/assets
npm run textures     # texture array z public/assets/textures
```

Licence: kód MIT, assety v `public/assets/` (z DoggioWars) CC BY-SA 4.0 — viz `LICENSE`.

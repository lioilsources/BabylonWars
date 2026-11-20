# BabylonWars

Webová verze [DoggioWars](https://github.com/lioilsources/DoggioWars) nad Babylon.js:
vzdušné ostrovy z kostek, stíhačka s **plným 6DoF** a **horizontem, který se naklání
s letadlem** (to Luanti neumí). Luanti verze dál žije ve svém repu.

## Ovládání

| | Klávesnice + myš | Gamepad | Dotyk |
|---|---|---|---|
| Míření | myš (klikni do hry) | pravá páčka | tah pravým palcem |
| Plyn | W / S | levá páčka ↑↓ | levý joystick ↑↓ |
| Náklon (ponorka: úkrok) | A / D | levá páčka ↔ | levý joystick ↔ |
| Nahoru / dolů | Space / Shift | RB / LT | ▲ / ▼ |
| Výkrut (`direct`, ponorka) | Q / E | d-pad ← → | — |
| Boost | F / pravé tlačítko / 2× W | A / LB | BOOST |
| Střelba (zatím ladicí paprsek) | levé tlačítko | RT | FIRE |

Přepínače: **M** ponorka / stíhačka (výchozí ponorka jako v Luanti), **C** řízení
(`free` → `direct` → `classic`), **T** náklon horizontu, **V** pohled, **O** kvalita,
**R** domů, **/** příkazy. Na telefonu jsou stejná tlačítka vpravo nahoře.
Seed světa: `?seed=12345`.

- `free` — myš táhne zaměřovač v prostoru, letadlo ho honí; looping uletíš tahem nahoru.
- `direct` — myš/páčka = úhlové rychlosti, Q/E výkrut, žádné samosrovnávání.
- `classic` — model z `vehicle.lua` 1:1: strop sklonu, auto-náklon, drift (S + A/D),
  skriptované triky: 2× A/D výkrut, držet Space looping, 2× S Immelmann.
- Ve `free`/`direct` se ručně uletěný výkrut a looping bodují stejně (detekce z letu).

Levé tlačítko zatím střílí ladicí paprsek, který vykousne do ostrova kouli
(ověření editací světa; skutečné zbraně přijdou v F5).

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

## Stav: F2 (mapgen)

Hotovo: všech 12 biomů a 5 profilů, tunely, dekorace podle `decorate.lua` — stromy,
keře, květiny a tráva, kaktusy, krystaly, balvany, obří houby, rampouchy, sopka
s kráterem a lávovým proudem, laguna atolu, tůně, řeky s vodopádem. Prvky se počítají
jednou za ostrov ze seedovaného PRNG a razítkují se do chunků, takže svět je stejný
bez ohledu na pořadí načítání. Tekutiny netečou (statické).

Rozdíly proti Luanti (vědomé): vlastní šum (kopce, pobřeží a tunely se liší v detailu,
rozmístění, velikosti a biomy ostrovů sedí se seedem přesně), jiný PRNG dekorací
(stejná pravidla a hustota, jiné konkrétní pozice), prvky se nestohují na sebe.

Příkazy (konzole na **/**, na telefonu tlačítko „/“): `/island <biom>`, `/goto x y z`,
`/seed`, `/help`.

Rozpočty (M2, u ostrova verdant): `low` 92 DC / 481k tri, `medium` 166 / 1,0 M,
`high` 226 / 1,5 M.

## Stav: F3 (simulace)

Hotovo: ponorka (5DoF hover, v `direct` i výkrut), stíhačka ve třech presetech, kolize
tažené koule r = 1,5 se sklouznutím po terénu, poškození nárazem (nad 15 m/s), zničení
s kráterem a respawn u nejbližšího ostrova po 3 s, boost (metr 0–100, 25 za použití),
nabíjení boostu těsně u terénu, triky a komba (×5), skóre. Simulace je v `src/sim/`
bez Babylonu a testuje se headless (`test/flight.test.ts`).

Zatím chybí (další fáze): zvuk a plný HUD (F4), zbraně a monstra (F5).

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

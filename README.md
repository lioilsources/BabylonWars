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
| Střelba | levé tlačítko | RT | FIRE |
| Mapa | Z | Back / View | Mapa |
| Nastavení | Esc | Start / Menu | ⚙ |

Přepínače: **M** ponorka / stíhačka (výchozí ponorka jako v Luanti), **C** řízení
(`free` → `direct` → `classic`), **T** náklon horizontu, **V** pohled, **O** kvalita,
**L** světlomet, **R** domů, **/** příkazy. Všechno je i v panelu nastavení (Esc, ⚙),
včetně jazyka (cs/en), hlasitosti, radaru a vodováhy. Seed světa: `?seed=12345`.

- `free` — myš táhne zaměřovač v prostoru, letadlo ho honí; looping uletíš tahem nahoru.
- `direct` — myš/páčka = úhlové rychlosti, Q/E výkrut, žádné samosrovnávání.
- `classic` — model z `vehicle.lua` 1:1: strop sklonu, auto-náklon, drift (S + A/D),
  skriptované triky: 2× A/D výkrut, držet Space looping, 2× S Immelmann.
- Ve `free`/`direct` se ručně uletěný výkrut a looping bodují stejně (detekce z letu).

Střely provrtávají do ostrovů tunely (Ø 8, stíhačka jimi proletí); tři rány ≈ 45 bloků.

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

## Stav: F4 (HUD, zvuk, obloha)

Hotovo: HUD podle `hud.lua` (kompasová páska, kurz, SPD/ALT/VS, trup 20 dílků, boost
10 dílků, skóre s kombem, sklon/náklon, vodováha jen ve stíhačce, flash hlášky),
radar ostrovů (natočený podle kurzu, 512 m), mapa světa na **Z** (1 400 m, sever
nahoře), panel nastavení, úvodní obrazovka, čeština a angličtina (`/lang`).
Obloha podle `sky.lua`: tmavě modrá, věčné poledne, slunce, měsíc, hvězdy, řídké
mraky ve výškách 1 500 a −500, mlha do barvy horizontu. Světlomet je kužel přímo
ve voxel shaderu (svítí jen do stínu, jako v Luanti). Vzdálené ostrovy jako
impostory z analytického profilu, jeden draw call; hranice voxely × impostory je
koule s ditherem. Dohled: `low` 1,2 km, `medium` 1,6 km, `high` 2 km.
Zvuk: hudba biomů s 6 s crossfadem a hysterezí (`music.lua`), výstřel a náraz.
Ogg, kde to prohlížeč umí, jinak `.m4a` (`npm run sync-assets -- --sounds`).

Příkazy navíc: `/music`, `/headlight`, `/radar`, `/map`, `/lang`.

Rozpočty s impostory (M2, start u domova): `low` 94 DC / 451k tri, `medium` 156 / 889k,
`high` 225 / 1,3 M; 60 FPS ve všech.

## Stav: F5 (zbraně, monstra, závod)

Hotovo: střelba podle `weapons.lua` (120 m/s, kadence 0,15 s, kulka z nosu) a vrtání
tunelů kapslí r = 4 ve směru letu; zničená stíhačka vyhloubí kráter. Sutina padá jako
kostky v barvě zasaženého nodu (max 140), oheň a stopy kulek jsou částice ve stylu
Luanti (jednobarevné čtverečky, jeden draw call). Zvuk zásahu podle převažujícího
materiálu. Editace se promítají i do vzdálených (hrubších) chunků.
Monstra podle `monsters.lua`: draci pěti živlů s loopingy, písečný červ, kamenný
strážce, medúzy a toulavá velryba; osazenstvo podle biomu, prostorové smyčky zvuků,
tečky na radaru a mapě. `/race` podle `race.lua` + `rabbit.lua`: trať přes 10–14
ostrovů (slalom, výkrut, orbit, tunel, stoupání a pád), zlatý zajíc s rubber-bandem
a čekáním, checkpointy s prstenci, časomíra, tunely skrz ostrovy, oslava v cíli.

Příkazy navíc: `/race`, `/race stop`, `/monster <druh>`.

Rozdíly proti Luanti (vědomé): tekutiny a písek se po zásahu nesypou, výšku letu
monstra počítají z profilu ostrova (dekorace jako sopečný kužel nevidí), monstra mizí
dál než 420 m od hráče (v Luanti je maže engine mimo aktivní bloky).

Měření (M2, high, souvislá palba do domovského ostrova): 59–60 FPS, ojedinělý
frame ~90 ms, 44 tisíc editací bez poklesu.

## Stav: F6 (PWA, Twitch)

Hotovo: hra jde nainstalovat jako aplikace (manifest, ikony, celá obrazovka na šířku)
a běží offline. Service worker při instalaci uloží kód, textury a model (~2 MB),
zvuky (33 MB) si ukládá až při prvním přehrání. Nový deploy se projeví při dalším
načtení stránky, bez ručního mazání cache. Ikony: `npm run icons`.

Twitch chat přes službu [chatbridge](https://github.com/lioilsources/chatbridge) (port
`mods/chatbridge`): `?bridge=<url>` v adrese nebo `/bridge <url>` (uloží se),
`/bridge off`, `/chatoff` (vypne akce a uklidí, co chat přivolal), `/chaton`.
Chat umí přivolat monstra (`doggiowars:<druh>`, počet max 10, TTL), do 40 m od
spawnu nic nepustí. Služba musí posílat `Access-Control-Allow-Origin`; z hry na
Pages (HTTPS) na službu v lokální síti navíc Chrome chce
`Access-Control-Allow-Private-Network: true`.

## Stav: F7 (App Store, Google Play)

Hotovo: Capacitor obálka pro iOS a Android (`com.ol1n.doggiowars`, zdarma), jen na
šířku a přes celou obrazovku, data v balíčku (offline, bez service workeru). Ikony a
splash ze stejné pixel-art ikony, v nastavení „O hře a licence“, zásady
[soukromí](https://lioilsources.github.io/BabylonWars/privacy.html) a
[podpora](https://lioilsources.github.io/BabylonWars/support.html) na Pages.
Release na tag `v*`: iOS → TestFlight, Android → AAB/APK (Google Play ručně).
Postup a ruční kroky v účtech: [`docs/release.md`](docs/release.md).

### Měření brány F0

| Zařízení | Kvalita | FPS | Draw cally | Trojúhelníky |
|---|---|---|---|---|
| MacBook (M2, Chrome, 60 Hz displej) | high | 60 (strop vsync) | 60–115 | ~600 k |
| iPhone 12 mini (Safari, render 375×664) | low | 56 (nejhorší frame ~42 ms) | — (167 meshů) | 264 k |

Brána F0 splněna (cíl ≥ 30 FPS na `low`), měřeno na verzi F3.

## Vývoj

```sh
npm install
npm run dev          # http://localhost:5173, na LAN i pro telefon
npm run gate         # lint + testy + typecheck + build
cp .env.example .env # DOGGIOWARS_DIR = klon DoggioWars
npm run sync-assets  # assety z DoggioWars do public/assets (-- --sounds i zvuky + m4a, potřebuje ffmpeg)
npm run textures     # texture array z public/assets/textures
npm run cap:sync     # build + Capacitor sync do ios/ a android/ (viz docs/release.md)
```

Licence: kód MIT, assety v `public/assets/` (z DoggioWars) CC BY-SA 4.0 — viz `LICENSE`.

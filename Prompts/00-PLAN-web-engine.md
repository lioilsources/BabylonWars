# DoggioWars Web — vlastní engine nad Babylon.js
### Plán pro Opus (Claude Code) · ulož jako `Prompts/02-PLAN-web-engine.md`

Stav k 20. 11. 2026. Ověřeno proti `lioilsources/DoggioWars@d47f447` a
`luanti-org/luanti@8bb14e8` (master, 5.19.0-dev).

---

## 0. Zadání v jedné větě

Postav webovou verzi DoggioWars v TypeScriptu nad Babylon.js, ve které se
**horizont naklání s letadlem** a let je **plně 6DoF** (looping a výkrut jdou
uletět ručně, ne jen jako skript). Luanti verze v `mods/` zůstává beze změny
a dál vychází na ContentDB.

**Stavíme:** tenkou voxelovou vrstvu (`voxel/`), čistou simulaci (`sim/`)
a hru (`game/`).

**Nestavíme:** obecnou náhradu Luanti, Lua mod API, načítání Luanti světů
(`map.sqlite`), stavění/inventář/crafting, simulaci tekutin, multiplayer.
Nic z toho DoggioWars dnes nepoužívá.

**Jak plán číst:** fáze jsou izolované přírůstky. Každá končí akceptací,
kterou Ol1n ověří hraním na nasazené URL. Další fázi nezačínej, dokud
předchozí neprošla. **F0 je brána** — když neprojde, zastav a nahlas čísla.

---

## 1. Proč (ověřená fakta, ne domněnky)

**Luanti roll neumí a z Lua to obejít nejde.**
- `doc/lua_api.md:9822` — `set_camera(params)` zná jediný parametr `mode`.
- `src/server.cpp:2077` — `Server::SendCamera` posílá jeden bajt (režim).
- `src/client/camera.cpp:385` — `rel_cam_up = v3f(0,1,0)`; jediné, co s ním
  hýbe, je view bobbing (`:402`, `rotateXYBy`). Renderer tedy roll umí,
  jen k němu nevede žádné API.
- `doc/sscsm_api.md` — klientské skripty ze serveru jsou „very experimental“
  a vlastní mody zatím přidat nejdou. Let proto běží na serveru po krocích.
- Projekt to sám dokumentuje: README („Luanti cannot roll the horizon“),
  `vehicle.lua:439–444` (pokus přes `set_eye_offset` skákal po krocích).
- `src/client/game.cpp:2034` — pitch pohledu je oříznutý na ±90°, takže
  looping z pohledu pilota nejde ani s rollem.

**DoggioWars je pro vlastní engine skoro ideální případ.**
- 7 095 řádků Lua celkem; gameplay `dw_core` 6 095, `dw_nodes` 387,
  `chatbridge` 613 (z toho 300 testy).
- Svět je `singlenode` + vlastní deterministický mapgen ze seedu → **žádná
  konverze map**, jen port generátoru.
- Většina světa je vzduch (ostrovy R 72–165 m v mřížce 340 m) → prázdné
  chunky se dají přeskočit analyticky.
- Žádné chození, inventář, formspeky. Entity: stíhačka a zajíc (1 `.obj`),
  monstra z krychlí, debris (krychle), střela (sprite).
- Mapgen už byl jednou portován (`roblox/island-generator.server.lua`)
  včetně headless testu (`roblox/test_mapgen.lua`). Použij ho jako druhý
  referenční zdroj vedle Lua originálu.
- Assety: 106 PNG, 59 OGG, 1 OBJ — vše vlastní tvorba, lze převzít.

---

## 2. Zafixovaná rozhodnutí

| Oblast | Rozhodnutí | Důvod |
|---|---|---|
| Jazyk / build | TypeScript `strict`, Vite, Vitest | rychlý dev loop, testy bez prohlížeče |
| Renderer | `@babylonjs/core` (ES moduly), aktuální stabilní řada — ověř `npm view @babylonjs/core version` | kamera = kvaternion, glTF/OBJ, částice, vstupy |
| Grafické API | **WebGL2** (`Engine`), ne WebGPU | jeden shaderový jazyk (GLSL ES 3.0), jistota na iOS |
| Vlákna | module Web Workers, **bez SharedArrayBuffer**, jen transferable `ArrayBuffer` | SAB chce COOP/COEP hlavičky; GitHub Pages ani WebView je nedají |
| Voxel vrstva | vlastní (`voxel/`), ne noa-engine ani Divine Voxel Engine | noa bez vydání od 2023, DVE mění API; potřebujeme ~1 500 řádků |
| Fyzika | vlastní kinematika, **žádný Havok** | originál je taky kinematický (`set_velocity`) |
| UI | DOM + CSS overlay, žádný framework | HUD je 15 prvků; Svelte až kdyby přibylo lobby |
| Nástroje | TS skripty přes `tsx`, **žádný bash** | konvence Ol1nova stacku |
| Umístění | složka `web/` v tomto repu | Lua je zdroj pravdy pro port a golden testy |
| Hosting | statický build → GitHub Pages (Actions) | žádný backend ve v1 |
| Komentáře | česky, jako zbytek repa | |

Do `.gitattributes` přidej `web/ export-ignore` — release zip pro ContentDB
se staví přes `git archive` a `web/` v něm být nesmí. Na `mods/`,
`release.yml` a `roblox/` nesahej.

---

## 3. Struktura

```
web/
  package.json  vite.config.ts  tsconfig.json  eslint.config.js
  index.html
  scripts/
    sync-assets.ts        # mods/*/textures|sounds|models → public/, manifesty
    build-textures.ts     # PNG 16×16 → vrstvy texture array + layers.json
    build-locale.ts       # *.tr → locale/cs.json
    golden/dump.lua       # LuaJIT: reálný mapgen.lua se stubem minetest.* → JSON
  src/
    voxel/                # NESMÍ importovat @babylonjs ani DOM
      coords.ts  registry.ts  chunk.ts  mesher.ts  light.ts
      raycast.ts  sweep.ts  edits.ts  protocol.ts
    sim/                  # NESMÍ importovat @babylonjs, DOM ani voxel/render
      math.ts  constants.ts  input.ts  flight.ts  tricks.ts  weapons.ts
      monsters.ts  rabbit.ts  race.ts  score.ts  world-query.ts  sim.ts
    gen/                  # čistý generátor, běží ve workeru i na main threadu
      lcg.ts  noise.ts  islands.ts  profiles.ts  biomes.ts  features.ts
      generator.ts
    game/                 # Babylon, vstupy, zvuk, HUD
      main.ts  engine.ts  camera-rig.ts  chunk-renderer.ts  voxel.material.ts
      impostors.ts  sky.ts  entities/  particles.ts  audio.ts
      input/{keyboard-mouse,gamepad,touch,tilt}.ts
      hud/{hud.ts,radar.ts,map.ts,level.ts,hud.css}
      commands.ts  settings.ts  i18n.ts
    workers/chunk.worker.ts
  test/                   # vitest: lcg, islands (golden), mesher, raycast, flight
```

Hranice vynuť ESLintem (`no-restricted-imports`): `sim/` a `voxel/` a `gen/`
nesmí importovat `@babylonjs/*`. Díky tomu jde simulace testovat headless
a později pustit na serveru.

---

## 4. Let a kamera — jádro zadání

### 4.1 Stav a osy

Babylon je levotočivý s Y nahoru, stejně jako Luanti → **pozice se portují
1:1** (1 node = 1 jednotka). Tělesové osy lodi: `+Z` dopředu, `+Y` nahoru,
`+X` doprava. Orientace je **jednotkový kvaternion** `att` (těleso → svět).
Eulerovy úhly v simulaci nepoužívej; počítej je jen pro HUD.

```ts
interface ShipState {
  pos: Vec3; vel: Vec3;        // m, m/s (svět)
  att: Quat;                   // těleso → svět
  speed: number;               // m/s podél +Z tělesa (fighter)
  aim: Vec3;                   // jednotkový směr zaměřovače (svět)
  mode: 'sub' | 'fighter';     // z /mode, výchozí 'sub'
  control: 'classic' | 'free' | 'direct';
  hull: number; boostMeter: number; boostTime: number;
  trick: TrickState; crashCooldown: number;
}
```

### 4.2 Integrace (pevný krok 60 Hz)

```
dq  = quatFromBodyRates(pitchRate, yawRate, rollRate, dt)
att = normalize(att ⊗ dq)          // násobení zprava = otočení v osách tělesa
fwd = rotate(att, +Z)
pos += fwd * speed * dt            // fighter; sub integruje vel přímo
```

Znaménka **nedefinuj tabulkou, ale testy chování** (`test/flight.test.ts`):
1. kladný pitch vstup zvedá nos (`fwd.y` roste);
2. kladný roll vstup pokládá pravé křídlo (`right.y` klesá);
3. kladný yaw vstup stáčí nos doprava;
4. konstantní pitch rate po dobu `2π/rate` vrátí `att` do výchozí orientace
   (looping), stejně tak roll (výkrut) — tolerance 1e-6;
5. `|att| = 1` po 10⁶ krocích.

### 4.3 Tři řídicí presety

| Preset | Chování | K čemu |
|---|---|---|
| `classic` | 1:1 originál: letadlo honí zaměřovač, pitch clamp `PITCH_MAX`, auto-bank, skriptované triky | parita s Luanti, výchozí pro akceptaci portu |
| `free` | stejný mouse-aim, ale **bez clampů**: zaměřovač je směr v prostoru, looping uletíš tahem za myš | hlavní „nový“ zážitek |
| `direct` | vstupy = úhlové rychlosti (pitch/roll/yaw), žádný zaměřovač, žádný auto-level | plné 6DoF, gamepad/akrobacie |

Zákon řízení pro `classic`/`free`:
```
aim      = normalize(aim + camRight*dx*sens + camUp*dy*sens)   // v osách KAMERY
e        = rotate(conj(att), aim)                              // chyba v osách tělesa
yawErr   = atan2(e.x, e.z);  pitchErr = atan2(e.y, hypot(e.x, e.z))
yawRate  = clamp(yawErr * K, ±TURN_SPEED)
pitchRate= clamp(pitchErr * K, ±PITCH_RATE)
bank     = úhel pravého křídla vůči horizontále
target   = clamp(-yawErr * 2.0, -1, 1) + stickBank * BANK_ROLL   // viz vehicle.lua:377–387
rollRate = clamp((target - bank) * K, ±ROLL_SPEED)
```
Protože se delta myši aplikuje v osách kamery, funguje zaměřování i v náklonu
90° a hlavou dolů. Blízko svislice (`|fwd.y| > 0.95`) zisk auto-banku plynule
stáhni k nule — „náklon vůči horizontu“ tam není definovaný.

Konstanty ber z `mods/dw_core/init.lua` (`doggiowars.const`) do
`sim/constants.ts` **jmény i hodnotami 1:1**. Dive/climb fyziku, boost,
proximity charge, crash a respawn portuj z `vehicle.lua:185–530` řádek po
řádku; mění se jen reprezentace orientace.

Ponorka (`sub`): 5DoF hover z `vehicle.lua:236–298` beze změny; v `direct`
přidej roll na Q/E, jinak se roll sám srovnává.

Triky (`tricks.lua`): v `classic` zůstávají skriptované. Ve `free`/`direct`
je navíc **detekuj z letu** (integrál roll rate ≥ 2π = barrel roll, pitch
≥ 2π = looping) a boduj stejně.

### 4.4 Kamera

`TransformNode` rig + kamera jako potomek; vestavěné vstupy kamery odpoj.
```
levelAtt = orientace se stejným fwd, ale up = světové Y   // „bez rollu“
camAtt   = slerp(levelAtt, att, horizonTilt)              // 0 … 1
rig.rotationQuaternion = slerp(prevCamAtt, camAtt, alpha) // interpolace mezi ticky
```
- `horizonTilt` je nastavení: 0 % / 50 % / **100 % (výchozí ve fighteru)**;
  v ponorce výchozí 30 %. Při `|fwd.y| > 0.98` použij 1 (levelAtt degeneruje).
- Pohledy: `nose` (offset `0, 0.5, 4` — dnešní `EYE_OFFSET`) a `chase`
  (`0, 2.5, -10`, kriticky tlumená pružina na pozici).
- Render interpoluje mezi dvěma posledními stavy simulace (`alpha`), jinak
  bude roll cukat stejně jako dnes v Luanti.

---

## 5. Voxelová vrstva

- **Chunk 32³**, klíč `(cx,cy,cz)`. Data `Uint16Array(32768)` žijí jen ve
  workeru po dobu jobu; main thread drží mesh + `solidBits: Uint32Array(1024)`.
- **Job je čistá funkce:** `(cx,cy,cz, seed, edits) → mesh`. Worker si
  vygeneruje objem 34³ (chunk + lem 1) přímo z generátoru, takže **nepotřebuje
  sousední chunky**. Editace hráče přijdou s jobem jako seznam.
- **Přeskakování vzduchu:** před zařazením jobu se zeptej `islandsTouching(aabb)`
  (mřížka 340 m + poloměr + `HILL_AMP_MAX`). Když nic → chunk neexistuje.
- **Mesher:** greedy po plochách, klíč slučování = (vrstva textury, AO, světlo).
  Tři výstupy: `opaque` (včetně alpha-test: listí, květiny), `liquid`
  (voda průhledně, láva emisivně), nic dalšího.
- **Textury:** `RawTexture2DArray` 16×16, nearest, vrstva = index v
  `layers.json`. UV se přes sloučený quad opakují. Kdyby `sampler2DArray`
  v `ShaderMaterial` dělal potíže, fallback je atlas a slučování jen v rámci
  jedné dlaždice.
- **Modifikátory textur** (`^[colorize` 16×, `^[multiply` 2×, `^[opacity` 2×)
  vyřeš v `build-textures.ts` předpočítáním do samostatných vrstev.
- **Vertex formát:** `position` (3×f32), `data` (4×f32: u, v, vrstva, jas).
  `jas = faceShade × AO × sky`; emisivní nody mají jas 1 bez ohledu na okolí.
- **Světlo v1 (analytické):** generátor zná horní plochu ostrova `topY(x,z)`.
  `sky = 1` nad ní, pod ní plynule k 0.35 během 3 voxelů. Tunely a spodky
  ostrovů jsou tak tmavé bez flood-fillu. Šíření světla z lávy a krystalů
  je až F6 (nepovinné).
- **Světlomet:** uniformy kužele (pozice, směr, cos úhlu, dosah) přímo ve
  voxel shaderu. Celý `headlight.lua` (232 řádků, světelné nody + ABM + LBM)
  tím odpadá.
- **Drawtypy** k pokrytí: normal, `allfaces_optional`, `glasslike`,
  `plantlike`, `firelike` (zkřížené quady), `nodebox` (kvádry z definice),
  `liquid`/`flowingliquid` (statické), `airlike`. `facedir` je jen na
  třech místech v `dw_nodes/init.lua`.
- **Raycast:** Amanatides–Woo DDA nad `solidBits`. **Kolize lodi:** tažená
  koule r = 1.5, krok ≤ 0.5 m. Mimo načtené chunky se ptej generátoru.
- **Editace:** `EditStore` (mapa chunk → index → id) na main threadu.
  `world.setNodes(batch)` označí dotčené chunky (i sousedy na hraně) jako
  dirty s vysokou prioritou. Ve v1 jen v paměti.
- **Vzdálené ostrovy:** za poloměrem voxelů kresli impostor — nízkopoly mesh
  z analytického profilu ostrova (≈ 32×16 segmentů, barva podle biomu),
  s prolnutím na hranici. Dohled tím vyroste z 300 m na kilometry.

---

## 6. Port mapgenu

Zdroje: `mapgen.lua` (554), `biomes.lua` (167), `decorate.lua` (762),
`nodes.lua` (89), `dw_nodes/init.lua` (387).

1. **LCG portuj doslova v `Number`.** `hash_2d` počítá
   `(h * 1103515245 + 12345) % 2147483648` v double a mezivýsledek přesahuje
   2⁵³, takže zaokrouhlení je součást algoritmu. **Nepoužívej `Math.imul`
   ani `BigInt`** — dostal bys jiné ostrovy. Totéž převod seedu
   (`mapgen.lua:311`).
2. **Šum napiš vlastní** (value noise, 3D, oktávy/persistence/lacunarity,
   parametry z `mapgen.lua:55–62`). **Neportuj `src/noise.cpp` z Luanti** —
   engine je LGPL-2.1 a hra je MIT. Důsledek: rozmístění, velikosti, biomy
   a tvary ostrovů sedí se seedem přesně; kopce, pobřeží a průběh tunelů
   se od Luanti v detailu liší. To je přijatelné a stejně to má Roblox port.
3. **Golden test:** `scripts/golden/dump.lua` pod LuaJIT načte reálný
   `mapgen.lua` se stubem `minetest.*` (vzor: `roblox/test_mapgen.lua`)
   a pro 3 seedy × buňky −8…8 vypíše `nearest_island`/parametry ostrova
   (x, y, z, radius, biom, tvar, tunely ano/ne) do JSON. `test/islands.test.ts`
   porovná s TS portem na shodu čísel (tolerance 1e-9).
4. **Dekorace deterministicky a po chuncích.** Originál je sází dodatečně
   přes `set_node` a `math.random`. V TS: pro každý ostrov jednou spočítej
   **seznam prvků** (strom, obří houba, krystal, sopka, lávové jezírko,
   řeka, vodopád, rampouchy, střed atolu — funkce `doggiowars.place_*`
   a `build_volcano`) ze seedovaného PRNG (seed = hash ostrova), s AABB.
   Generátor chunku orazítkuje prvky, které chunk protínají. LRU cache
   64 ostrovů ve workeru.
5. Vodopády a řeky generuj jako statické sloupce/koryta; tekutiny netečou.
6. Domovský ostrov: buňka (0,0), `HOME` z `mapgen.lua:30–33`.

---

## 7. Mapa migrace Lua → TS

| Lua | TS | Poznámka |
|---|---|---|
| `init.lua` (`doggiowars.const`) | `sim/constants.ts` | 1:1 |
| `mapgen.lua`, `biomes.lua` | `gen/*` | viz §6 |
| `decorate.lua` | `gen/features.ts` | seznam prvků místo `set_node` |
| `nodes.lua`, `dw_nodes/init.lua` | `voxel/registry.ts` + `gen/biomes.ts` | jména `dw_nodes:*` zachovat |
| `vehicle.lua` | `sim/flight.ts`, `game/entities/fighter.ts` | mount/attach/watchdog/`zoom_fov` trik **odpadá** |
| `tricks.lua` | `sim/tricks.ts` | + detekce z letu |
| `weapons.lua` | `sim/weapons.ts`, `game/particles.ts` | `explode_voxels`, `bore_tunnel` → `world.setNodes` |
| `monsters.lua` | `sim/monsters.ts`, `game/entities/monsters.ts` | segmenty = thin instances jedné krychle |
| `rabbit.lua`, `race.lua` | `sim/rabbit.ts`, `sim/race.ts` | |
| `hud.lua`, `map.lua` | `game/hud/*` | DOM; radar a mapa na `<canvas>` |
| `headlight.lua` | uniformy ve `voxel.material.ts` | hack se světelnými nody odpadá |
| `sky.lua` | `game/sky.ts` | gradient, slunce/měsíc/hvězdy, mlha, vrstvy mraků −500/1500 |
| `music.lua` | `game/audio.ts` | témata biomů, crossfade |
| `chatbridge/init.lua` | `game/twitch.ts` (F6) | `GET /events?since=&max=`; služba potřebuje CORS |
| `locale/*.tr` | `locale/cs.json` | formát `zdroj=překlad`, `@=` je escapované `=` |
| `GAMEPAD.md`, `/gp` | `game/input/gamepad.ts` | Gamepad API, standardní mapování |
| chat příkazy | `game/commands.ts` | tlačítka v menu + konzole na `/` |

---

## 8. Náhrady Luanti API

| Luanti | Náhrada |
|---|---|
| `register_on_generated`, VoxelManip, `emerge_area` | job ve workeru, stream kolem hráče |
| `get_node`/`set_node`/`remove_node` | `world.isSolid`, `world.nodeAt` (generátor + edits), `world.setNodes` |
| `raycast`, `moveresult` | `voxel/raycast.ts`, `voxel/sweep.ts` |
| `register_entity`/`add_entity`/`on_step` | třídy v `sim/`, vazba na mesh v `game/entities/` |
| `get_player_control`, `get_look_*`, `set_look_*` | `InputFrame`; pohled se odvozuje z `att` |
| `set_attach`, `set_eye_offset`, `set_camera` | `camera-rig.ts` |
| `add_particle(spawner)` | `ParticleSystem` (GPU varianta na WebGL2) |
| `sound_play/stop/fade` | WebAudio |
| `hud_add/hud_change`, statbary | DOM |
| `after`, `globalstep`, `get_us_time` | plánovač nad pevným tickem, `performance.now()` |
| `set_sky/sun/moon/stars/clouds/lighting` | `game/sky.ts` |
| `register_chatcommand` | `commands.ts` |
| `check_for_falling`, debris entita | instancované krychle s balistikou, zánik pod −500 |
| ABM, LBM | nejsou potřeba (sloužily jen světlometu) |

`InputFrame` (jediný vstup simulace, plní ho zařízení):
```ts
interface InputFrame {
  aimDX: number; aimDY: number;     // rad, delta zaměřovače
  thrust: number; strafe: number;   // −1…1 (levá páčka / WASD)
  vertical: number; roll: number;   // −1…1 (Space/Shift, Q/E)
  fire: boolean; boost: boolean;
  tapLeft: boolean; tapRight: boolean; tapBack: boolean; // hrany pro triky
}
```
Zdroje: klávesnice + myš (Pointer Lock), gamepad, dotyk (levý virtuální
joystick, tah pravým palcem = zaměřovač, tlačítka střelba/boost), volitelně
náklon telefonu (`DeviceOrientationEvent`; na iOS je nutné vyžádat povolení
z gesta uživatele).

---

## 9. Fáze

Odhady jsou hrubé, v dnech práce jedné session s dogfoodingem.

### F0 — Spike a brána (1–2 dny)
Scaffold (`web/`, Vite, lint hranic, Vitest, deploy na Pages). Jen domovský
ostrov: tvar z profilu, jeden materiál, naivní mesher bez textur. Stíhačka
z `.obj`. Let `direct` + `free`, kamera s `horizonTilt = 1`. Klávesnice
a myš, gamepad, dotykový joystick. Počítadlo FPS a draw callů v rohu.

**Akceptace (Ol1n, na svém telefonu a desktopu):**
- looping a výkrut jdou uletět ručně a horizont se u toho otáčí plynule;
- 3×3 buňky ostrovů (naivně vygenerovaných) v dohledu: telefon ≥ 50 FPS,
  desktop ≥ 120 FPS;
- do README zapiš model telefonu a naměřená čísla.

**Když telefon nedá ani 30 FPS** po zmenšení poloměru a rozlišení
(`engine.setHardwareScalingLevel`), zastav. Záložní cesta je Příloha B.

### F1 — Voxel vrstva (2–3 dny)
`voxel/*`, worker pool (`min(hardwareConcurrency − 1, 4)`), greedy mesher
s AO, texture array, stream a uvolňování chunků, registry ze `dw_nodes`.
Testy: mesher (počty quadů na známých objemech), raycast, sweep.
**Akceptace:** let kolem ostrova bez záseků; žádný frame nad 25 ms při
streamu (max 2 nahrání meshe za frame).

### F2 — Mapgen (3–4 dny)
`gen/*` podle §6, všech 12 biomů, 5 profilů, tunely, dekorace, tekutiny.
**Akceptace:** golden test zelený; `/island <biom>` ukáže každý biom;
vizuální srovnání se screenshoty z Luanti u stejného seedu.

### F3 — Simulace (2–3 dny)
`sim/flight.ts` ve všech presetech + ponorka, kolize, poškození, crash,
respawn, boost, proximity charge, triky, skóre.
**Akceptace:** preset `classic` se chová jako Luanti (Ol1n porovná vedle
sebe); testy z §4.2 zelené.

### F4 — HUD, zvuk, obloha (2–3 dny)
HUD podle `hud.lua` (kompas, SPD/ALT/VS, hull, boost, skóre, vodováha jako
volitelná, radar, flash hlášky), mapa (`Z`), nastavení, i18n cs/en, zvuk
a hudba, obloha, mlha, světlomet, impostory vzdálených ostrovů.
Zvuk: nejdřív zkus OGG přes `canPlayType`; kde nejde, přehraj `.m4a`
vyrobené v `sync-assets.ts`. Odemkni audio prvním gestem.
**Akceptace:** hra je hratelná od spuštění po respawn bez konzole.

### F5 — Zbraně, svět, obsah (3–5 dní)
Střelba, výbuchy, ničení terénu, debris, monstra, zajíc, chrtí závod.
**Akceptace:** `/race` dojede do cíle; střelba ukusuje ostrov bez propadu FPS.

### F6 — Doladění (2–3 dny)
PWA (manifest, service worker, offline), Twitch bridge, výkonnostní průchod,
volitelně šíření světla z emisivních nodů.

### F7 — Obchody (2–3 dny, samostatné rozhodnutí)
Capacitor obálky pro iOS a Android, napojení na Ol1novu store pipeline.

### Později, mimo plán
Multiplayer (Go WebSocket server). `sim/` je kvůli tomu čistá a deterministická.

---

## 10. Výkonnostní rozpočty (cíle k doladění měřením)

| | Desktop | Telefon |
|---|---|---|
| Poloměr voxelů | 320 m | 192 m |
| Impostory do | 2 000 m | 1 200 m |
| Draw cally | ≤ 400 | ≤ 150 |
| Trojúhelníky | ≤ 1,5 M | ≤ 400 k |
| Main thread / frame | ≤ 6 ms | ≤ 12 ms |

Pravidla: žádné alokace v ticku simulace (předalokované `Vec3`/`Quat`);
`mesh.freezeWorldMatrix()`, `material.freeze()`, `isPickable = false`,
`scene.skipPointerMovePicking = true`; na telefonu strop DPR přes
`setHardwareScalingLevel`. Když draw cally přetečou, slučuj hotové chunky
ostrova do regionů 64³ a při editaci je zase rozděl.

---

## 11. Rizika

1. **Výkon na telefonu při dohledu.** Řeší brána F0, impostory a rozpočty.
2. **Pocit z letu.** `classic` drží originál; `free`/`direct` ladí Ol1n hraním.
3. **Nevolnost z plného rollu.** Proto je `horizonTilt` nastavení.
4. **Paměť v iOS WebView.** Strop načtených chunků, žádná `Uint16Array`
   chunku na main threadu.
5. **Vizuální rozdíl proti Luanti** (světlo, šum). Vědomé rozhodnutí, viz §5, §6.

---

## 12. Rozhodnutí, která potřebuju od Ol1na

1. Referenční telefon a cílové FPS pro bránu F0.
2. Výchozí preset pro nové hráče: `free`, nebo `classic`?
3. `web/` v tomto repu (návrh), nebo nové repo?
4. Jdeme do F7 (App Store / Google Play)? Jinak končíme PWA.
5. Luanti verze: jen údržba, nebo dál rozvíjet souběžně?

---

## Příloha A — Roll přímo v Luanti (fork enginu)

Když chceš napřed splnit „ať vyřeší naklánění v Luanti“. Patch je malý,
ověřeno proti `8bb14e8`:

| Soubor | Změna |
|---|---|
| `src/player.h:190` | pole `camera_roll` (f32) a `camera_follow_attachment` (bool) vedle `allowed_camera_mode` |
| `src/script/lua_api/l_object.cpp:697` | `l_set_camera`/`l_get_camera`: klíče `roll`, `follow_attachment_rotation` |
| `src/server.cpp:2077` | `SendCamera`: připsat nová pole **za** bajt režimu |
| `src/network/clientpackethandler.cpp:1600` | číst je jen když `pkt->getRemainingBytes() > 0` (staré servery) |
| `src/client/camera.cpp:385–411` | `rel_cam_up.rotateXYBy(roll)`; s `follow` brát roll z interpolované rotace rodiče připojení |
| `builtin/game/features.lua` | příznak `camera_roll = true` |
| `doc/lua_api.md:9822` | dokumentace |

Roll ber z rodičovské entity na klientu, ne ze serveru každý krok — rotace
entit se na klientu interpoluje, takže to nebude cukat jako `set_eye_offset`.
Hra pak přes `core.features.camera_roll` pozná, jestli roll má, a jinak
nechá dnešní vodováhu.

Co tím **nezískáš:** looping z pohledu pilota (`game.cpp:2034` ořezává pitch
pohledu na ±90°; plné 6DoF by chtělo druhý, větší patch — kameru zamčenou na
orientaci entity a vstup jako úhlové rychlosti),
klientskou predikci letu, iOS, web. A cena: hráči ze standardního Luanti
(ContentDB) roll neuvidí, dokud patch nepřijme upstream; vlastní build
znamená zveřejnit fork (LGPL-2.1) a udržovat ho proti upstreamu.
Požadavek existuje od roku 2020 (issue #9798), takže PR má smysl poslat.

## Příloha B — Godot 4 + Voxel Tools (záložní cesta)

Nativní výkon, kostičkový i hladký terén s LOD, export na iOS/Android/desktop.
Kamera je libovolný `Transform3D`. Cena: port do GDScriptu/C#, modul je C++
(vlastní build enginu nebo GDExtension — ověř aktuální stav), web export je
slabší. Sáhni po ní, když F0 neprojde na výkonu.

## Příloha C — Roblox

`roblox/` už obsahuje letový model a generátor ostrovů. Kamera je tam
`CFrame`, takže roll je zadarmo, stejně jako multiplayer a publikum. Cena:
hladký terén místo kostek a závislost na platformě. S tímto plánem se
nevylučuje — `gen/` a `sim/` budou třetí implementací stejné specifikace.

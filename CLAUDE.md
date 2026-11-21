# BabylonWars — DoggioWars na webu (Babylon.js)

Webová verze hry DoggioWars (Luanti): TypeScript + Babylon.js, plné 6DoF a náklon horizontu.
Plán: `Prompts/00-PLAN-web-engine.md` (fáze F0–F7, každá končí akceptací hraním).

Odchylka od lang.md: komentáře v kódu česky (jako zdrojové repo DoggioWars, plán to tak určuje).

## Gate (před pushem)
`npm run gate` = lint (hranice vrstev) + vitest + typecheck + build.

## Vrstvy
- `src/sim/`, `src/voxel/`, `src/gen/` — čisté, bez `@babylonjs/*` a DOM (vynucuje ESLint).
- `src/game/` — Babylon, vstupy, HUD. `src/workers/` — chunk worker.
- Laditelné konstanty: `src/sim/constants.ts` (1:1 z Lua), klient `TUNING` v `src/game/settings.ts`.

## Zdroj pravdy
- Lua originál: repo `lioilsources/DoggioWars` (lokálně cesta v `.env` → `DOGGIOWARS_DIR`).
- Golden test ostrovů: `luajit scripts/golden/dump.lua $DOGGIOWARS_DIR/mods/dw_core > test/golden/islands.json`.
- Assety: `npm run sync-assets` (textury + model, `-- --sounds` i zvuky) do `public/assets/`.
- LCG v `gen/lcg.ts` počítej v double s Lua modulem; žádný `Math.imul`/`BigInt`.

## Obchody (F7)
Capacitor `ios/`, `android/`; release na tag `v*`, postup a pasti v `docs/release.md`.

## Běh
`npm run dev` (Vite, i na LAN pro telefon). Nástroje přes `tsx`, žádný bash.

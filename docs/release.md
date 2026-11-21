# Vydání do App Store a Google Play (F7)

Obálka je [Capacitor 8](https://capacitorjs.com): web build (`dist/`, base `./`) se
zkopíruje do `ios/App/App/public` a `android/app/src/main/assets/public`
(oba gitignore). Nativní projekty `ios/` a `android/` jsou v repu.

| | |
|---|---|
| Název | DoggioWars |
| Bundle / applicationId | `com.ol1n.doggiowars` |
| Cena | zdarma, bez nákupů a reklam |
| Kategorie | Hry → Akční |
| Privacy URL | https://lioilsources.github.io/BabylonWars/privacy.html |
| Support URL | https://lioilsources.github.io/BabylonWars/support.html |
| Marketing URL | https://olin.now/doggiowars |

## Lokálně

```sh
npm run cap:sync        # build + cap sync (obě platformy)
npx cap open ios        # Xcode (Debug = automatický podpis)
npx cap open android    # Android Studio
npm run icons           # ikony a splash (PWA, iOS, Android) z pixel-art 16×16
```

## CI

- `ci.yml`: gate + Android debug build na každé větvi a PR.
- `release-ios.yml`, `release-android.yml`: na tag `v*` (nebo ručně). Verze = tag
  (`v1.2.3` → 1.2.3), build number = číslo běhu. Kostra je z Distribution golden;
  místo Flutteru `npm run build && npx cap sync`.
  - iOS: archiv s ručním podpisem (Release, `CI_PROFILE_NAME` → UUID profilu),
    export `ios/App/ExportOptions.plist`, upload do TestFlight, IPA do GitHub Release.
  - Android: `bundleRelease` + `assembleRelease`, podpis z `key.properties`
    (CI ho skládá ze secrets), AAB+APK do GitHub Release, APK do Firebase (skupina Alfa).
    AAB se do Google Play nahrává ručně, z firemního účtu rovnou do produkce.

## Ruční kroky v účtech (jednou)

1. **Apple Developer → Identifiers:** App ID `com.ol1n.doggiowars` (Explicit), bez capabilities.
2. **Apple Developer → Profiles:** Distribution → App Store, App ID výše,
   název `DoggioWars AppStore` → stáhnout do `Distribution/Apple/DoggioWars/`.
3. **App Store Connect → New App:** iOS, název DoggioWars, bundle `com.ol1n.doggiowars`,
   SKU `ol1ndoggiowars`, cena zdarma. Privacy: „Data Not Collected“. Věkové hodnocení:
   kreslené násilí (střelba na monstra), bez dalšího obsahu.
4. **Firebase:** Add app → Android → `com.ol1n.doggiowars`, `google-services.json` do
   `Distribution/Android/DoggioWars/` (do repa ne, appka Firebase SDK nepoužívá).
5. **Android keystore:** `setup-gh-secrets.sh` ho najde nebo vytvoří v
   `Distribution/Android/DoggioWars/` (alias `upload`). Keystore nikdy nemazat.
6. **Secrets:** v Distribution
   `./scripts/setup-gh-secrets.sh --repo lioilsources/BabylonWars --app DoggioWars --bundle-id com.ol1n.doggiowars`.
7. **Google Play Console** (firemní účet): nová aplikace DoggioWars, hra, zdarma;
   Data safety „žádná data nesbírá ani nesdílí“; obsahové hodnocení (IARC) dotazník;
   cílová skupina (návrh: 13+); první AAB z GitHub Release → Produkce.
8. Tag `v0.1.0` → workflowy postaví a nahrají build.

## Pasti

- iOS ATS a Android blokují nešifrované `http://`: Twitch chatbridge v aplikaci
  funguje jen přes HTTPS. Na webu (Pages) beze změny.
- Service worker se v aplikaci neregistruje (`isNativeApp()` v `src/game/pwa.ts`),
  soubory jsou v balíčku.
- Celá obrazovka: `plugins.SystemBars.hidden` v `capacitor.config.ts` (iOS stavový
  řádek + indikátor plochy), Android navíc imerzivní režim v `MainActivity.java`.
  Gesta od okraje odkládá `GameViewController` (`ios/App/App/SceneDelegate.swift`).
- Ikona pro App Store musí být bez alfa kanálu (`build-icons.ts` ji ukládá jako RGB).
- Licence médií CC BY-SA 4.0 → autoři a licence v nastavení hry („O hře a licence“).

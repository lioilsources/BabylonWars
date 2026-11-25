# DoggioWars Web — hra pro víc hráčů (coop, Obléhání, CTF)
### Plán pro Claude Code · `Prompts/01-PLAN-multiplayer.md`

Stav k 25. 11. 2026, proti `main@6b0e8ac`. Limity služeb ověřeny týž den
v dokumentaci Supabase a Cloudflare (odkazy v §12). Návrh čeká na rozhodnutí
vlastníka (§11); do té doby neimplementuj.

---

## 0. Zadání v jedné větě

Z hry pro jednoho udělej hru, do které se kamarád připojí **odkazem za pár
sekund bez instalace**: nejdřív společný let a kopání (coop), potom týmový
souboj o vlajku, kde **ponorky staví a brání, 6DoF proráží a stíhačky
odnášejí**. Bez vlastního serveru a s nulovými náklady při malém provozu.

Plán `00-PLAN-web-engine.md` multiplayer a stavění výslovně vyřadil („Nestavíme“).
Tenhle plán to vědomě mění; všechno ostatní z něj platí dál (vrstvy, gate,
komentáře česky, žádný framework, akceptace hraním).

**Jak plán číst:** fáze M0–M8 jsou izolované přírůstky, každá končí akceptací
hraním na nasazené URL. **M1 je brána** — když neprojde, zastav a nahlas čísla.

---

## 1. Odpovědi na otázky

**Zvládne to Supabase?** Sama ne. Hodí se na to, v čem je silná (identita,
adresář her, výsledky, žebříčky), ale živý přenos pozic přes Supabase Realtime
nevyjde počtem zpráv:

- Broadcast se účtuje jako 1 odeslaná + 1 za každého příjemce.
  8 hráčů × 10 Hz = 640 zpráv/s.
- Free plán má strop 100 zpráv/s (pak odpojuje) a 2 mil. zpráv měsíčně —
  to je 52 minut jednoho zápasu 4v4.
- Na Pro ($25/měs.) stojí každý další milion $2,50, tedy asi $1 za
  desetiminutový zápas 4v4.

**Bez vlastního serveru to jde.** Živý přenos poveze Cloudflare Durable Object
(jedna „místnost“ = jeden objekt s WebSockety), zdarma zhruba do 41 plných
zápasů 4v4 denně (§2.2). Náhradní cesta za 0 Kč navždy je P2P přes WebRTC (§4.6).

**Frakce ponorky × stíhačky:** doporučuju **stejné týmy s rolemi** (každý tým
má stavitele, ženisty i běžce). Čistě frakční souboj se nedá vyvážit jako CTF —
stíhačka neumí zastavit a bránit, ponorka neuteče. Původní nápad ale přesně
sedí na mód **Obléhání** (§6): jedna strana brání, druhá útočí, v poločase se
strany prohodí, takže je to férové i při nesouměrných lodích.

---

## 2. Fakta, o která se plán opírá

### 2.1 Kód (stav `main`)

- `src/sim/` je čistý TypeScript bez Babylonu a DOM, pevný krok 60 Hz,
  testuje se headless. Původní plán s během mimo prohlížeč počítal.
- `Sim` drží **jednu loď** (`ship`, `pilot`, `weapons`). Střely zasahují jen
  terén (`Weapons.step` → `impact`), lodě si navzájem neublíží.
- Svět je ze seedu stejný na všech zařízeních; změny jsou jen v `EditStore`
  (v paměti, `Map` na chunk 32³). Díry vznikají z události `impact` funkcí
  `carveCapsule` — operace je malá a deterministická, takže stačí posílat
  **operace, ne voxely**.
- Monstra (`Creatures`) mají seedovaný PRNG, ale krok závisí na pozici hráče,
  nemají životy a neútočí. Jsou to kulisy; pro PvE je čeká práce (M7).
- Tři režimy lodi už existují a liší se pohybem: ponorka 20 m/s s visem,
  stíhačka 5–40 m/s (boost 60) bez visu, 6DoF 40 m/s s úkrokem 22.
  Přepínač zbraně (kolečko, d-pad ↑, dotykové tlačítko) je hotový a unese
  i další nástroj.
- Střela letí 120 m/s po dobu 2,5 s (dostřel 300 m). Ostrovy mají R 72–165 m
  v mřížce 340 m.
- Lockstep nepůjde: `Math.sin` a spol. nejsou mezi prohlížeči bitově shodné.
  Proto snímky stavu a interpolace, ne posílání vstupů.

### 2.2 Limity služeb

| Služba | K čemu | Zdarma | Když nestačí |
|---|---|---|---|
| GitHub Pages | klient (jako dnes) | ano | — |
| Cloudflare Durable Objects | místnosti | 100 000 požadavků denně; 20 příchozích WS zpráv = 1 požadavek, odchozí zdarma; 13 000 GB-s denně | Workers Paid $5/měs.: 1 mil. požadavků + $0,15 za další milion; 400 000 GB-s + $12,50 za milion |
| Supabase | identita, adresář her, výsledky, žebříčky | 2 projekty, 50 000 uživatelů měsíčně, 500 000 volání Edge Functions; **projekt se po týdnu nečinnosti uspí** | Pro od $25/měs. |
| Cloudflare TURN | jen varianta P2P (§4.6) | 1 000 GB | $0,05/GB |

Co z toho plyne pro místnosti (klient posílá 1 zprávu za 100 ms):

- 100 000 požadavků = 2 mil. zpráv denně = **55 hráčo-hodin denně**, tj.
  41 desetiminutových zápasů 4v4.
- 13 000 GB-s při 128 MB = 28 hodin běžících místností denně.
- Po překročení denního limitu free plán vrací chyby do půlnoci UTC.
  Hra pro jednoho tím netrpí.
- Na placeném plánu vyjde 10 000 hráčo-hodin měsíčně asi na $12.

**Neověřeno:** poměr 20 : 1 je v dokumentaci popsán „pro účtování“. Jestli se
stejně počítá i denní limit free plánu, změří M1 v dashboardu. Kdyby ne,
free plán stačí jen na zkoušení a ostrý provoz znamená $5 měsíčně nebo
variantu P2P.

---

## 3. Zafixovaná rozhodnutí

| Oblast | Rozhodnutí | Důvod |
|---|---|---|
| Živý přenos | Cloudflare Worker + Durable Object `Room`, WebSocket, binární zprávy | žádné NAT problémy, žádná migrace hostitele, telefon v kapse neshodí hru ostatním |
| Autorita | pohyb vlastní lodi počítá klient; **životy, vlajku, skóre, pořadí úprav světa** drží místnost | let bez zpoždění, a přitom jeden rozhodčí |
| Pravidla | čistá třída `RoomCore` v `src/net/`, kterou Worker jen obaluje | testy bez sítě; stejný kód poběží u hostitele ve variantě P2P |
| Synchronizace | snímky 10 Hz + interpolace se zpožděním 150 ms, žádný lockstep | viz §2.1 |
| Svět | log operací (`carve`, `place`, `degrade`) s pořadovým číslem z místnosti | malé zprávy, stejný výsledek všude, pozdní připojení přehraje log |
| Supabase | anonymní přihlášení, `profiles`, `rooms`, `matches`; **žádný Realtime** | kvóta zpráv (§1); adresář stačí číst dotazem jednou za 10 s |
| Odolnost | soukromá hra přes odkaz funguje i bez Supabase | uspaný projekt nesmí rozbít hraní s kamarádem |
| Zápis výsledků | jen Worker (service role v `wrangler secret`), klient nikdy | žebříček nejde podvrhnout z konzole |
| Komunikace | rychlé povely a značky, **žádný volný text** | bez moderování, funguje na dotyku i gamepadu, lokalizuje se sama |
| Jména | generovaná („Modrý drak 42“), vlastní až později s filtrem | pravidla obchodů k obsahu od uživatelů |
| Velikost | 2–8 hráčů v místnosti (4v4), později 12 | výkon telefonu a rozpočet zpráv |
| UI | DOM + CSS jako dosud, bez frameworku | lobby jsou tři obrazovky |

Do veřejného repa smí URL projektu Supabase a anon klíč (jsou veřejné
z principu, chrání je RLS). Service role a klíče Cloudflare jen jako secrets.

---

## 4. Architektura sítě

### 4.1 Struktura

```
src/net/            # čisté: bez Babylonu, DOM i WebSocketu (ESLint jako u sim/)
  protocol.ts       # typy zpráv, verze protokolu
  codec.ts          # binární kódování (DataView), kvantizace
  clock.ts          # odhad posunu hodin vůči místnosti
  interp.ts         # zásobník snímků, Hermite z pozice a rychlosti, slerp
  room-core.ts      # autorita: hráči, týmy, životy, log úprav, pravidla módu
  room-client.ts    # stav místnosti u klienta nad rozhraním Transport
src/sim/
  match.ts          # N lodí místo jedné, střely × lodě
  classes.ts        # tabulka rolí (trup, rychlosti, nástroje)
  modes/{coop,siege,ctf}.ts   # stavové automaty módů, sdílí je klient i RoomCore
src/game/net/       # WebSocket transport, lobby, jmenovky, tabulka skóre
server/             # Cloudflare Worker + DO Room (wrangler); importuje src/net a src/sim
supabase/           # migrace, RLS, Edge Functions
test/net.test.ts    # 2–8 klientů a RoomCore přes falešný transport se zpožděním a ztrátami
```

### 4.2 Co kdo počítá

| Věc | Kdo rozhoduje | Jak se šíří |
|---|---|---|
| Pozice a natočení vlastní lodi | klient | 10× za sekundu, ~32 B |
| Cizí lodě | nikdo — jen se vykreslují | interpolace 150 ms v minulosti, při výpadku extrapolace nejdéle 250 ms |
| Výstřel | střelec | událost s časem, ostatní střelu jen kreslí |
| Zásah lodi | střelec hlásí, místnost ověří (dostřel, kadence, tým, nezranitelnost při výkrutu) | životy ve snímku místnosti |
| Díra v terénu, pancíř | místnost přidělí pořadí | každý (i autor) aplikuje až po potvrzení; efekt zásahu je hned |
| Vlajka, skóre, čas, respawn | místnost | ve snímku |
| Monstra | jeden klient („správce“, nejdéle připojený) | 5× za sekundu; při odchodu místnost určí dalšího |

Události (výstřel, zásah, úprava světa, povel) jedou **ve stejné zprávě** jako
stav, takže rozpočet zůstává 10 zpráv za sekundu na hráče. Místnost posílá
každému jeden sloučený snímek za 100 ms (8 hráčů ≈ 2,5 kB/s dolů).

Souřadnice úprav se posílají kvantované (1/8 m, `int32`) a **všichni včetně
autora** počítají díru z kvantovaných hodnot — jinak se světy rozejdou.

### 4.3 Místnost

- Kód místnosti má 5 znaků bez zaměnitelných písmen; `idFromName(kód)`.
  Odkaz `?room=KÓD`. Kód je zároveň oprávnění ke vstupu do soukromé hry.
- Místnost s jedním hráčem nic neposílá a spí (neúčtuje se). Klient bez pohybu
  a karta na pozadí posílají jen udržovací zprávu; po 2 minutách nečinnosti
  hráče vyřadí.
- Stav zápasu (skóre, vlajka, log úprav) se každých 10 s ukládá do úložiště
  objektu. Nasazení Workeru shodí WebSockety; klient se připojí znovu a zápas
  pokračuje. Nasazuj mimo herní večery.
- Při připojení posílá verzi protokolu. Starší klient dostane „aktualizuj“
  (na webu tlačítko z PR #10, v obchodech odkaz na aktualizaci).

### 4.4 Pozdní připojení a rozpočet úprav

- Nový hráč dostane log operací a přehraje ho ve workeru před spawnem.
- Strop 30 000 operací na zápas (~0,5 MB). Nejhorší případ je 8 hráčů
  a 10 minut souvislé palby: ~8 600 tunelů vrtákem a ~32 000 kráterů kanónem.
  Po dosažení stropu krátery kanónu přestanou kopat („terén ztvrdl“).
- `EditStore` dnes drží `Map` na chunk; při hustém kopání přejdi na husté
  pole `Uint8Array(32³)` pro chunk nad ~1 000 úprav. Změř paměť na telefonu.

### 4.5 Supabase

```
profiles(id → auth.users, nick, created_at)
rooms(code, mode, players, max_players, public, proto, updated_at)   -- píše jen Worker
matches(id, mode, seed, started_at, duration_s, score_a, score_b, proto)
match_players(match_id, user_id, team, class, points, captures, kills, built, breached)
```

- RLS: čtení `rooms` a žebříčků všem, zápis jen service role; `profiles`
  si upravuje vlastník řádku.
- Worker ověřuje JWT z anonymního přihlášení přes JWKS projektu
  (ověř, že projekt má asymetrické podpisové klíče; jinak ověřuj dotazem na Auth).
- Uspání po týdnu: Worker má cron (zdarma) a jednou denně se zeptá na `rooms`.
  Ověř, že to jako aktivita stačí.

### 4.6 Varianta B: P2P přes WebRTC (0 Kč)

Když M1 ukáže, že free plán nestačí, a vlastník nechce platit: `RoomCore` běží
v prohlížeči hostitele, ostatní se k němu připojí datovým kanálem (nespolehlivý,
neuspořádaný — lepší na ztrátových sítích). Supabase Realtime pak slouží jen
k navázání spojení (desítky zpráv na připojení, to kvóta unese). Zvaž knihovnu
Trystero se strategií Supabase (ověř stav a licenci).

Cena varianty B: TURN relay pro sítě, kde přímé spojení nejde (přihlašovací
údaje musí vydávat Edge Function), hráči si navzájem vidí IP adresy, migrace
hostitele při jeho odchodu, a hostitel na telefonu se zamčenou obrazovkou
zastaví hru všem. Proto je až druhá volba.

---

## 5. Jak usnadnit potkávání lidí

Největší riziko není síťový kód, ale **prázdné lobby**. Řazeno od nejlevnějšího:

1. **Odkaz místo lobby.** „Pozvat“ = systémové sdílení (WhatsApp, Messenger),
   kopírování a QR kód na obrazovce pro kamaráda vedle. Web nevyžaduje instalaci —
   to je největší výhoda proti hrám z obchodu.
2. **Jedno tlačítko „Hrát spolu“.** Přidá do nejplnější otevřené hry; když
   žádná není, založí ji a pustí hráče rovnou létat. Nikdy ne obrazovka „čekám
   na hráče“.
3. **Připojení a odchod kdykoli**, i doprostřed zápasu. Tým se dorovná sám.
4. **Živá čísla na úvodní obrazovce:** „Online 7 · 2 otevřené hry“.
5. **Herní večery:** dva pevné časy týdně s odpočtem na úvodní obrazovce.
   Malá komunita se sejde, jen když ví kdy.
6. **Discord:** webhook oznámí otevřenou veřejnou hru s odkazem; odkaz
   na server v menu.
7. **Twitch:** `chatbridge` už existuje — `!join` pošle odkaz do chatu,
   diváci dál přivolávají monstra.
8. **Hra, i když nikdo není:** duchové v závodě (nejlepší průlety ostatních),
   denní výzva se stejným seedem a žebříčkem, boti na doplnění týmů (M7).
9. **Odveta a nedávní spoluhráči:** po zápase tlačítko „Ještě jednou“ drží
   místnost pohromadě; seznam posledních spoluhráčů s pozvánkou.
10. **Společný svět mezi platformami:** web, PWA, iOS i Android ve stejných
    místnostech.

„Lokální“ hra znamená dvě různé věci:

- **Kamarádi v jedné místnosti, každý na svém zařízení** — řeší QR kód.
  Internet je potřeba i tak (místnost běží u Cloudflare).
- **Jedno zařízení, dva gamepady, rozdělená obrazovka** — jediná cesta úplně
  bez internetu. Po M0 je to hlavně práce na vykreslování (dvě kamery, dvojí
  HUD). Volitelná fáze M2b, jen desktop a TV.

---

## 6. Herní módy

Módy na sebe navazují; každý další přidává jednu vrstvu.

| Mód | Hráči | O co jde |
|---|---|---|
| **Volný let** (coop) | 1–8 | společný svět, kopání, závod se zajícem proti sobě, monstra |
| **Přestřelka** | 2–8 | týmový souboj na sestřely; zkušební pole pro zásahy a role |
| **Obléhání** | 2–8, hratelné už 1v1 | jedna vlajka; obránci 45 s staví, útočníci mají 4 min na odnesení; pak se strany prohodí |
| **CTF** | 6–12 | dvě vlajky, do 3 bodů nebo 10 minut |
| **Obrana ostrova** (PvE) | 1–4 | vlny monster útočí na jádro ostrova; čistý coop (M7) |

**Proč Obléhání dřív než CTF:** při 2–6 hráčích klasické CTF rozdělí tým na
útok a obranu po jednom člověku a rozpadne se. Jedna vlajka drží všechny
u jednoho děje. Automat vlajky je pro oba módy stejný.

**Aréna:** ze seedu dva ostrovy podobné velikosti 2–3 pole od sebe
(680–1 020 m), aspoň jeden ostrov mezi nimi. Stíhačka to uletí za 17–25 s,
ponorka za 35–50 s. Vlajka stojí na vrcholu ostrova; komnatu kolem ní si
obránci postaví. Útočit jde shora, z boku i **zespodu skrz skálu** — to žádná
plochá CTF mapa neumí.

**Pravidla vlajky:**
- Sebrání průletem do 4 m. Nosič je vidět všem na radaru.
- Sestřelený nosič vlajku upustí; vrátí ji dotek obránce, nebo sama po 20 s.
- **Přihrávka:** nosič vlajku odhodí, spoluhráč ji sebere. Ženista ji vytáhne
  z komnaty, stíhačka ji venku převezme a odveze.
- V CTF se bod počítá, i když vlastní vlajka není doma (při malých týmech
  jinak vznikají patové situace).
- Prodloužení při remíze: 2 minuty, stavění vypnuté, pancíř každých 20 s
  ztrácí jednu úroveň.
- Respawn ve vlnách po 10 s, 3 s nezranitelnost po spawnu.

---

## 7. Role, opevnění a další mechaniky

### 7.1 Role = režim lodi

Volí se při spawnu, ne za letu. Výchozí hodnoty, ladí se v `src/sim/classes.ts`.

| | Ponorka — stavitel | 6DoF — ženista | Stíhačka — běžec |
|---|---|---|---|
| Rychlost | 20, vis | 30, úkrok 22, vis | 15–40, boost 60, bez visu |
| Trup | 160 | 100 | 70 |
| Nástroje | kanón, **stavěč** | kanón, **vrták** | kanón, boost, výkrut (nezranitelnost) |
| S vlajkou | 15 | 22 | 40, bez boostu |
| Úloha | staví, opravuje, vrací vlajku | prorazí pancíř, vytáhne vlajku | odveze vlajku, stíhá nosiče |

Kanón: 8 bodů za zásah (kadence 0,15 s). Vrták proti lodím 4 — není to zbraň.
6DoF má v PvP dopřednou rychlost 30 místo 40, jinak by ponorku ve všem přebil.

### 7.2 Opevnění

**Pancíř** je nový node ve třech stavech poškození (`dw:armor_3` → `_2` → `_1`
→ vzduch, textury s prasklinami). Vejde se do dnešního enginu bez dat navíc
na voxel.

- **Kanón pancíř neprostřelí** (jiskry, žádná díra) a kráter ho obchází.
- **Vrták** při zásahu pancíře neudělá tunel, jen sníží úroveň nodů do 1,5 m.
- **Stavěč:** jedno stisknutí = plát 3×3×1 kolmo na pohled, přichycený
  k mřížce. Zásobník 12 plátů, +1 za 2,5 s. Stejným nástrojem se opravuje
  (půl plátu).
- **Pravidla stavby:** do 80 m od vlastní vlajky, ne blíž než 5 m k vlajce
  a 12 m ke spawnu, plát se musí dotýkat terénu nebo pancíře, dosah 14 m,
  nejvýš 400 plátů na tým. Brání to zazdění spoluhráčů i neviditelným zdem
  ve vzduchu.
- **Cíl ladění:** průraz dvouvrstvé stěny otvorem pro loď ≈ jedna plná nádrž
  vrtáku (2,2 s palby, pak 9 s nabíjení). Jeden stavitel díru zacelí asi
  za 15 s. Obrana tedy vyhraje souboj jeden na jednoho, útok ve dvou ne.

### 7.3 Další mechaniky pro obránce

- **Radar jen na dohled:** soupeř je na radaru a mapě vidět, jen když je
  do 250 m od někoho z týmu. **Radarová věž** (stavitel, 1 na tým) hlídá
  300 m kolem sebe a jde zničit. Obránci mají včasné varování, útočníci
  důvod letět tiše nebo věž sundat první.
- **Oprava spoluhráčů:** ponorka léčí lodě do 15 m (5 bodů/s).
- **Střelecká věž** (1 na stavitele, trup 60, dostřel 80 m, pomalé otáčení):
  rychlá stíhačka ji mine, pomalý ženista ji musí nejdřív zničit.
- **Miny** (3 na stavitele): viditelné zblízka, kanón je odpálí.

### 7.4 Další mechaniky pro útočníky

- **Boost u terénu** už existuje (nabíjí se těsným průletem) — odměňuje
  riskantní nálet při zemi.
- **Triky v PvP nabíjejí boost** místo bodů; výkrut dál dává krátkou
  nezranitelnost. Dobrý pilot uhne salvě.
- **Závětří:** let těsně za spoluhráčem dobíjí boost — doprovod nosiče se vyplatí.
- **Bomba** pro stíhačku (později): široký mělký kráter, pancíři ubere
  jednu úroveň na ploše 5×5.

### 7.5 Neutrální prvky

- **Zásobníky** na prostředních ostrovech: kdo je drží, má rychlejší přísun
  plátů a přední spawn.
- **Zlatý zajíc** se jednou za zápas proletí arénou; kdo ho chytí, dostane
  týmu plný zásobník plátů a boostu.
- **Monstra podle biomu** jako nebezpečí pro obě strany; chat na Twitchi je
  může přivolat.

Věž, miny, závětří, bomba a zásobníky jsou **volitelné** — přidávej po jedné
až po odehraných zápasech. Jádro je pancíř, stavěč, radar na dohled a přihrávka.

---

## 8. Bodování

**Tým:** vyhrává počet donesených vlajek. Obléhání při shodě rozhodne rychlejší
čas, pak nejmenší vzdálenost, na kterou se vlajka dostala k cíli.

**Hráč** — body jsou nastavené tak, aby dobrá minuta obránce vynesla podobně
jako dobrá minuta útočníka:

| Akce | Body |
|---|---|
| Donesení vlajky | 100 |
| Asistence (nesl ji dřív, nebo byl do 30 m při donesení) | 40 |
| Sebrání vlajky | 20 |
| Přihrávka, po které do 30 s padne bod | 30 |
| Návrat vlastní vlajky | 20 |
| Sestřel / asistence | 10 / 5 |
| Sestřel nosiče | 30 |
| Sestřel do 80 m od vlastní vlajky | +10 |
| Výdrž: každých 30 s, kdy je vlajka doma a soupeř do 100 m | 5 každému obránci do 80 m |
| Pancíř: každých 10 zásahů vrtáku, které tvoje pláty pohltily | 5 (strop 150 za zápas) |
| Oprava: 10 bodů trupu spoluhráče / 1 plát | 1 / 2 |
| Zničený plát soupeře | 4 |
| První průraz do komnaty s vlajkou | 25 |
| Chycený zajíc | 30 |

- Triky v PvP body nedávají (jinak se farmí mimo boj).
- Konec zápasu vyhlásí **nejlepšího stavitele, ženistu a běžce**. Práce
  obránce není vidět v sestřelech; tohle ji ukáže.
- Do žebříčku jdou jen zápasy s aspoň 4 hráči, zapsané Workerem.
- Coop módy mají společné skóre týmu (vlny, čas závodu) a žebříček podle seedu dne.

---

## 9. Fáze

Velikost: S = dny, M = týden, L = dva a víc (odhad pro jednu session denně).

### M0 — Víc lodí v simulaci (L, bez sítě)
`Sim` → `Match` s mapou lodí; `Weapons` na loď; zásah střely × loď (koule
r = 1,5); týmy; události nesou id lodi. Vykreslení N lodí, jmenovky, tečky
na radaru. `/bot` přidá loď kroužící kolem ostrova.
**Akceptace:** hra pro jednoho se nezměnila (gate, stávajících 68 testů);
bot je vidět a jde sestřelit; 8 botů na telefonu drží 30 FPS na `low`.

### M1 — Síťová brána (M)
Worker + DO `Room`, `src/net/`, připojení přes `?room=`. Hráči se vidí ve volném
letu, nic dalšího.
**Brána:** 4 zařízení (2 telefony na mobilních datech, 2 počítače), 10 minut.
Cizí lodě bez viditelných skoků; zpoždění p95 pod 150 ms; spotřeba požadavků
v dashboardu Cloudflare odpovídá výpočtu z §2.2 (potvrzení poměru 20 : 1);
limit CPU na zprávu ve free plánu nevadí. Když brána neprojde, nahlas čísla
a čekej na rozhodnutí mezi $5/měs. a variantou B.

### M2 — Společný svět (M)
Log úprav s pořadím, pozdní připojení, sdílená monstra, společný závod
(všichni proti zajíci, ostatní jako protivníci na trati). Lodě si neublíží.
**Akceptace:** dva hráči vykopou tunel a oba jím proletí; třetí se připojí
později a vidí stejné díry; `test/net.test.ts` potvrdí shodný `EditStore`
u všech klientů při 20 % ztrát a 200 ms zpoždění.

### M2b — Rozdělená obrazovka (S–M, volitelné)
Dva gamepady, dvě kamery, dvojí HUD. Jen desktop.

### M3 — Potkávání (M)
Úvodní obrazovka „Hrát spolu“, kód a odkaz, sdílení a QR, Supabase (anonymní
přihlášení, jméno, adresář her, rychlá hra, živá čísla), rychlé povely a značky,
vyřazení nečinných, znovupřipojení, kontrola verze.
**Akceptace:** kamarád se z telefonu připojí přes odkaz do 10 s bez vysvětlování;
„Hrát spolu“ spojí dvě cizí zařízení; s vypnutým Supabase jde hrát přes odkaz.

### M4 — Souboj (M)
Životy v místnosti, zásahy hlášené střelcem s kontrolou, týmy a barvy, vlny
respawnu, přehled sestřelů, tabulka skóre, výběr role, mód Přestřelka.
**Akceptace:** 2v2 deset minut; nikdo nehlásí „trefil jsem a nic“; skóre je
u všech stejné; role se hrají znatelně jinak.

### M5 — Vlajka: Obléhání a CTF (L)
Automat vlajky v `RoomCore`, přihrávka, výběr arény ze seedu, průběh zápasu
(příprava, hra, poločas, konec), HUD (stav vlajky, značky, čas), bodování,
závěrečná obrazovka, zápis výsledků do Supabase.
**Akceptace:** celé Obléhání 1v1 a 2v2 a CTF 3v3 bez zásahu do konzole.

### M6 — Opevnění (L)
Pancíř (nody, textury), stavěč a pravidla stavby, vrták × pancíř, opravy,
radar na dohled a radarová věž, operace `place` a `degrade` v logu.
**Akceptace:** hodnoty z §7.2 platí v měření; v deseti zkušebních zápasech
Obléhání útočníci aspoň ve třech vlajku donesou a aspoň ve třech ne
(žádná neprorazitelná ani zbytečná pevnost).

### M7 — Aby nebylo prázdno (L, po částech)
Boti, monstra s životy a útokem a mód Obrana ostrova, duchové a denní výzva,
herní večery, Discord, `!join` na Twitchi, žebříčky, odveta.

### M8 — Obchody a pravidla (S)
Zásady soukromí (jméno, anonymní id, zpracovatelé Cloudflare a Supabase,
region EU), dotazníky věkového hodnocení (hra s cizími lidmi, bez volného
chatu), odkazy do aplikace (`?room=` otevře nainstalovanou hru), kontrola
verze v obchodních buildech, `docs/release.md`.

---

## 10. Na co se zapomnělo

1. **Prázdné lobby.** Hra pro víc hráčů bez hráčů je horší než hra pro
   jednoho. Proto §5 a boti; počítej s tím od M3, ne na konci.
2. **Dotyk proti myši.** Mířit palcem na stíhačku je těžší než myší. Pomůže
   přitahování zaměřovače na dotyku a to, že stavitel (ponorka) se na
   telefonu hraje dobře. Párování podle zařízení by malou komunitu roztrhlo.
3. **Podvádění.** Pohyb počítá klient, takže upravený klient může létat
   rychleji. Místnost hlídá jen hrubé meze (rychlost, dostřel, kadence).
   Pro hru s kamarády to stačí; veřejný žebříček ber s rezervou.
4. **Škodiči ve vlastním týmu:** zazdění spawnu, zabraná role, nečinnost.
   Řeší pravidla stavby, vyřazení nečinných a hlasování o vyhození (později).
5. **Želví taktika.** Když se dá postavit neprorazitelná pevnost, hra umře.
   Proto strop plátů, prodloužení s rozpadem pancíře a akceptace M6.
6. **Výkon na telefonu:** 8 lodí, víc střel a mnohem víc děr než dnes.
   Rozpočet úprav (§4.4) a měření v M0 a M2.
7. **Verze napříč platformami.** Web se aktualizuje hned, obchody o dny
   později. Bez kontroly verze protokolu se hráči tiše rozejdou.
8. **Soukromí a obchody.** Přibude zpracování jména a identifikátoru, hra
   s cizími lidmi mění věkové hodnocení. Generovaná jména a žádný volný
   chat tomu většinu práce ušetří.
9. **Výpadky a limity.** Uspaný Supabase, vyčerpaný denní limit Cloudflare,
   nasazení uprostřed zápasu. Hra pro jednoho a soukromé odkazy musí
   fungovat dál a hráč má dostat srozumitelnou hlášku.
10. **Diváci a streamování.** Režim diváka pro pozdě příchozí a pro Twitch
    je levný (klient bez lodi) a pomáhá hru šířit.
11. **Zaučení.** Tři role a stavění nejde vysvětlit textem. Přípravná fáze
    s nápovědou podle role, první zápas proti botům.
12. **Rozsah.** Je to zhruba druhá taková hra. Co škrtnout první: věž, miny,
    zásobníky, bomba, postup a vzhledy, rozdělená obrazovka.

---

## 11. Rozhodnutí vlastníka

1. **Přenos:** Cloudflare Durable Objects (doporučeno; zdarma při malém
   provozu, při růstu $5/měs.), nebo P2P (0 Kč, víc práce a horší na telefonech)?
2. **První týmový mód:** Obléhání (doporučeno, hratelné od 1v1), nebo rovnou CTF?
3. **Frakce:** stejné týmy s rolemi (doporučeno), nebo v Obléhání volba
   „čisté frakce“ (brání jen ponorky a 6DoF, útočí jen stíhačky)?
4. **Jména:** generovaná (doporučeno), nebo vlastní s filtrem a nahlašováním?
5. **Rozdělená obrazovka** (M2b): ano, nebo vynechat?
6. **Supabase:** je volné místo pro projekt zdarma (limit 2 aktivní), nebo
   použít existující?
7. **Herní večery a Discord:** chce je vlastník provozovat?

---

## 12. Zdroje

- Supabase Realtime, limity: https://supabase.com/docs/guides/realtime/limits
- Supabase Realtime, ceny: https://supabase.com/docs/guides/realtime/pricing
- Supabase, počítání zpráv: https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages
- Supabase, plány: https://supabase.com/pricing
- Cloudflare Durable Objects, ceny a free plán: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare TURN: https://developers.cloudflare.com/realtime/turn/faq/

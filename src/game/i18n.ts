// Překlady cs/en. Angličtina je zdrojový jazyk (jako v Luanti), čeština
// odpovídá dw_core.cs.tr. Klíče jsou krátké identifikátory, @1… parametry.
export type Lang = 'cs' | 'en';

const en = {
  'mode.sub': 'SUBMARINE', 'mode.fighter': 'FIGHTER',
  'mode.subHelp': 'SUBMARINE: WASD move, mouse heading, Space/Shift up/down. Tricks and boost are off.',
  'mode.fighterHelp': 'FIGHTER: W/S throttle, mouse aims, A/D bank, Q/E roll.',
  'mode.space': '6DoF FIGHTER',
  'mode.spaceHelp': '6DoF FIGHTER: W/S forward/back, A/D strafe, Space/Shift up/down, mouse pitch/yaw, Q/E roll.',
  'hud.modeKey': 'M switches', 'weapon.gun': 'CANNON', 'weapon.drill': 'DRILL',
  'headlight.on': 'Headlight on.', 'headlight.off': 'Headlight off.',
  'music.on': 'Music on.', 'music.off': 'Music off.',
  'radar.on': 'Radar ON.', 'radar.off': 'Radar OFF.',
  'hud.score': 'SCORE', 'hud.bank': 'BANK',
  'start.title': 'DoggioWars', 'start.click': 'Click to fly', 'start.tap': 'Tap to fly',
  'help.keys': 'Mouse aims · W/S throttle · A/D bank (sub, 6DoF: strafe) · Space/Shift up/down · Q/E roll · F / right button boost · LMB fire · wheel / 1 / 2 cannon / drill',
  'help.keys2': 'M sub/fighter/6DoF · Z map · L headlight · V view · C controls · T horizon · O quality · R home · Esc settings · / commands',
  'menu.settings': 'Settings', 'menu.map': 'Map', 'menu.mode': 'Mode', 'menu.weapon': 'Weapon', 'menu.respawn': 'Home', 'menu.console': '/',
  'set.title': 'Settings', 'set.close': 'Back to game',
  'about.title': 'About & licences',
  'about.text': 'DoggioWars © 2026 lioilsources. Code MIT, textures, model and sounds CC BY-SA 4.0 (original work; music and sound effects AI-generated with ACE-Step 1.5 and MOSS-SoundEffect). Engine Babylon.js (Apache-2.0), app shell Capacitor (MIT).',
  'about.source': 'Source code', 'about.privacy': 'Privacy',
  'set.lang': 'Language', 'set.mode': 'Craft', 'set.control': 'Controls',
  'set.horizonTilt': 'Horizon tilt (fighter)', 'set.subTilt': 'Horizon tilt (sub)',
  'set.view': 'View', 'set.zoom': 'Zoom (field of view)', 'set.quality': 'Quality', 'set.mouseSens': 'Mouse sensitivity', 'set.invertY': 'Invert Y',
  'set.music': 'Music', 'set.musicVolume': 'Music volume', 'set.sfxVolume': 'Effects volume',
  'set.headlight': 'Headlight', 'set.radar': 'Radar', 'set.attitude': 'Attitude indicator', 'set.stats': 'Performance stats',
  'opt.sub': 'submarine', 'opt.fighter': 'fighter', 'opt.space': '6DoF fighter', 'opt.free': 'free (6DoF)', 'opt.direct': 'direct', 'opt.stick': 'mouse joystick', 'opt.classic': 'classic (Luanti)',
  'opt.nose': 'cockpit', 'opt.chase': 'chase', 'opt.low': 'low', 'opt.medium': 'medium', 'opt.high': 'high',
  'webgl2': 'This game needs WebGL2.',
  'cmd.unknown': 'Unknown command: /@1. Try /help',
  'cmd.biomes': 'Biomes: @1', 'cmd.noIsland': 'No “@1” island nearby.',
  'cmd.gotoUsage': 'Usage: /goto x y z', 'cmd.modeUsage': 'Usage: /mode sub | fighter | space', 'cmd.seed': 'Seed: @1',
  'cmd.island': '/island <biome> — fly to the nearest island of a biome',
  'cmd.goto': '/goto <x> <y> <z>', 'cmd.mode': '/mode [sub|fighter|space] — submarine / fighter / 6DoF fighter',
  'cmd.seedHelp': '/seed — world seed (another world: ?seed=… in the address)',
  'cmd.music': '/music [on|off] — island music', 'cmd.headlight': '/headlight [on|off] — the fighter’s headlight',
  'cmd.radar': '/radar — toggle the island radar', 'cmd.map': '/map — fullscreen world map', 'cmd.lang': '/lang cs|en',
  'cmd.race': '/race [stop] — greyhound race: chase the golden hare!',
  'race.started': 'Race started — follow the hare!', 'race.cancelled': 'Race cancelled.', 'race.none': 'No race is running.',
  'race.running': 'A race is already running — end it with /race stop.',
  'race.finished': 'Race finished in @1! Checkpoints @2/@3, score @4.', 'race.failed': 'Race failed — fighter destroyed.',
  'race.info': 'HARE @1 m  ·  CP @2/@3',
  'cmd.monster': '/monster <species> — spawn a monster nearby', 'cmd.monsters': 'Species: @1',
  'cmd.bridge': '/bridge <url>|off — Twitch chat via the chatbridge service', 'cmd.chatoff': '/chatoff — stop chat actions and clear what chat spawned',
  'cmd.chaton': '/chaton — resume chat actions',
  'chat.off': 'Chat actions OFF, world cleared.', 'chat.on': 'Chat actions ON.',
  'chat.status': 'chatbridge: @1 (@2)', 'chat.none': 'chatbridge off. Usage: /bridge <url>',
};

type Key = keyof typeof en;

const cs: Record<Key, string> = {
  'mode.sub': 'PONORKA', 'mode.fighter': 'STÍHAČKA',
  'mode.subHelp': 'PONORKA: WASD pohyb, myš kurz, Space/Shift nahoru/dolů. Triky a boost vypnuty.',
  'mode.fighterHelp': 'STÍHAČKA: W/S plyn, myš míří, A/D náklon, Q/E výkrut.',
  'mode.space': 'STÍHAČKA 6DoF',
  'mode.spaceHelp': 'STÍHAČKA 6DoF: W/S vpřed/vzad, A/D úkrok, Space/Shift nahoru/dolů, myš sklon/kurz, Q/E výkrut.',
  'hud.modeKey': 'M přepne', 'weapon.gun': 'KANÓN', 'weapon.drill': 'VRTÁK',
  'headlight.on': 'Světlomet zapnut.', 'headlight.off': 'Světlomet vypnut.',
  'music.on': 'Hudba zapnuta.', 'music.off': 'Hudba vypnuta.',
  'radar.on': 'Radar ZAP.', 'radar.off': 'Radar VYP.',
  'hud.score': 'SKÓRE', 'hud.bank': 'NÁKLON',
  'start.title': 'DoggioWars', 'start.click': 'Klikni a leť', 'start.tap': 'Ťukni a leť',
  'help.keys': 'Myš míří · W/S plyn · A/D náklon (ponorka a 6DoF úkrok) · Space/Shift nahoru/dolů · Q/E výkrut · F / pravé tl. boost · levé tl. střelba · kolečko / 1 / 2 kanón / vrták',
  'help.keys2': 'M ponorka/stíhačka/6DoF · Z mapa · L světlomet · V pohled · C řízení · T horizont · O kvalita · R domů · Esc nastavení · / příkazy',
  'menu.settings': 'Nastavení', 'menu.map': 'Mapa', 'menu.mode': 'Režim', 'menu.weapon': 'Zbraň', 'menu.respawn': 'Domů', 'menu.console': '/',
  'set.title': 'Nastavení', 'set.close': 'Zpět do hry',
  'about.title': 'O hře a licence',
  'about.text': 'DoggioWars © 2026 lioilsources. Kód MIT, textury, model a zvuky CC BY-SA 4.0 (vlastní tvorba; hudba a efekty generované AI: ACE-Step 1.5 a MOSS-SoundEffect). Engine Babylon.js (Apache-2.0), obálka aplikace Capacitor (MIT).',
  'about.source': 'Zdrojový kód', 'about.privacy': 'Soukromí',
  'set.lang': 'Jazyk', 'set.mode': 'Stroj', 'set.control': 'Řízení',
  'set.horizonTilt': 'Náklon horizontu (stíhačka)', 'set.subTilt': 'Náklon horizontu (ponorka)',
  'set.view': 'Pohled', 'set.zoom': 'Zoom (zorné pole)', 'set.quality': 'Kvalita', 'set.mouseSens': 'Citlivost myši', 'set.invertY': 'Obrátit osu Y',
  'set.music': 'Hudba', 'set.musicVolume': 'Hlasitost hudby', 'set.sfxVolume': 'Hlasitost efektů',
  'set.headlight': 'Světlomet', 'set.radar': 'Radar', 'set.attitude': 'Vodováha', 'set.stats': 'Výkon (FPS)',
  'opt.sub': 'ponorka', 'opt.fighter': 'stíhačka', 'opt.space': 'stíhačka 6DoF', 'opt.free': 'volné (6DoF)', 'opt.direct': 'přímé', 'opt.stick': 'myš jako joystick', 'opt.classic': 'klasické (Luanti)',
  'opt.nose': 'z kokpitu', 'opt.chase': 'zezadu', 'opt.low': 'nízká', 'opt.medium': 'střední', 'opt.high': 'vysoká',
  'webgl2': 'Tahle hra potřebuje WebGL2.',
  'cmd.unknown': 'Neznámý příkaz: /@1. Zkus /help',
  'cmd.biomes': 'Biomy: @1', 'cmd.noIsland': 'Žádný ostrov „@1“ v okolí.',
  'cmd.gotoUsage': 'Použití: /goto x y z', 'cmd.modeUsage': 'Použití: /mode sub | fighter | space', 'cmd.seed': 'Seed: @1',
  'cmd.island': '/island <biom> — přílet k nejbližšímu ostrovu biomu',
  'cmd.goto': '/goto <x> <y> <z>', 'cmd.mode': '/mode [sub|fighter|space] — ponorka / stíhačka / stíhačka 6DoF',
  'cmd.seedHelp': '/seed — seed světa (jiný svět: ?seed=… v adrese)',
  'cmd.music': '/music [on|off] — hudba ostrovů', 'cmd.headlight': '/headlight [on|off] — světlomet stíhačky',
  'cmd.radar': '/radar — zapne/vypne radar ostrovů', 'cmd.map': '/map — celoobrazovková mapa', 'cmd.lang': '/lang cs|en',
  'cmd.race': '/race [stop] — chrtí závod: leť za zlatým zajícem!',
  'race.started': 'Závod začal — následuj zajíce!', 'race.cancelled': 'Závod zrušen.', 'race.none': 'Žádný závod neběží.',
  'race.running': 'Závod už běží — ukonči ho přes /race stop.',
  'race.finished': 'Závod dokončen za @1! Checkpointy @2/@3, skóre @4.', 'race.failed': 'Závod nedokončen — stíhačka zničena.',
  'race.info': 'ZAJÍC @1 m  ·  CP @2/@3',
  'cmd.monster': '/monster <druh> — spawne monstrum poblíž', 'cmd.monsters': 'Druhy: @1',
  'cmd.bridge': '/bridge <url>|off — Twitch chat přes službu chatbridge', 'cmd.chatoff': '/chatoff — vypnout akce z chatu a uklidit, co chat přivolal',
  'cmd.chaton': '/chaton — zapnout akce z chatu',
  'chat.off': 'Akce z chatu VYP, svět uklizen.', 'chat.on': 'Akce z chatu ZAP.',
  'chat.status': 'chatbridge: @1 (@2)', 'chat.none': 'chatbridge vypnutý. Použití: /bridge <url>',
};

const DICT: Record<Lang, Record<Key, string>> = { en, cs };
let lang: Lang = 'en';

export const defaultLang = (): Lang =>
  (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('cs') ? 'cs' : 'en');

export function setLang(l: Lang): void {
  lang = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as Key);
  }
}

export const getLang = (): Lang => lang;

export function t(key: Key, ...args: (string | number)[]): string {
  let s = DICT[lang][key] ?? en[key] ?? key;
  args.forEach((a, i) => { s = s.replace(`@${i + 1}`, String(a)); });
  return s;
}

/** Hlášky simulace jsou anglicky (jako v Luanti); tady je přeložíme */
const FLASH_CS: Record<string, string> = {
  'BARREL ROLL!': 'VÝKRUT!', 'LOOPING!': 'LOOPING!', 'IMMELMANN!': 'IMMELMANN!',
  'BOOST!': 'BOOST!', 'DESTROYED! Respawn…': 'Stíhačka zničena! Respawn…',
  // race.lua / rabbit.lua (dw_core.cs.tr)
  'SLALOM! Stay on the hare': 'SLALOM! Drž se zajíce',
  'HARE: BARREL ROLL! (double-tap A/D)': 'ZAJÍC: BARREL ROLL! (dvojité A/D)',
  'HARD TURN! S+A/D = airbrake drift': 'OSTRÁ ZATÁČKA! S+A/D = airbrake drift',
  'TUNNEL! Slow down (S) and fly clean': 'TUNEL! Zpomal (S) a leť přesně',
  'CLIMB + DIVE! Shift down for extra speed': 'STOUPÁNÍ + STŘEMHLAV! Shift dolů = rychlost navíc',
  'RACE! Follow the golden hare!': 'ZÁVOD! Následuj zlatého zajíce!',
  'HARE WAITING — catch up!': 'ZAJÍC ČEKÁ — dohoň ho!',
  'HARE AT THE FINISH — fly to it!': 'ZAJÍC V CÍLI — doleť k němu!',
  'RACE FAILED': 'ZÁVOD NEDOKONČEN',
};
const FLASH_CS_RE: [RegExp, string][] = [[/^FINISH — (.*)\s+\|\s+SCORE (\d+)$/, 'CÍL — $1  |  SKÓRE $2']];
export function tFlash(text: string): string {
  if (lang !== 'cs') return text;
  for (const [re, rep] of FLASH_CS_RE) if (re.test(text)) return text.replace(re, rep);
  const m = /^(.*?)(\s*[×x]\d+)?$/.exec(text);
  const head = m?.[1] ?? text;
  return (FLASH_CS[head] ?? head) + (m?.[2] ?? '');
}

export type { Key as I18nKey };

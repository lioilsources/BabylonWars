// Registr nodů podle mods/dw_nodes/init.lua a mods/dw_core/nodes.lua.
// Jména dw_nodes:* / doggiowars:* zůstávají z Luanti. Id = index v DEFS
// (Uint16 ve voxelových datech). Vrstva textury = index v TEXTURES.

export type DrawType =
  | 'airlike' | 'normal' | 'allfaces' | 'glasslike' | 'plantlike' | 'firelike'
  | 'nodebox' | 'liquid';

export interface NodeDef {
  name: string;
  drawtype: DrawType;
  /** top, bottom, side — jako Luanti tiles se 3 položkami (kratší seznam se doplní posledním) */
  tiles: string[];
  /** blokuje let (walkable) */
  walkable: boolean;
  /** vlastní světlo 0..14 (light_source) */
  light: number;
  /** průhlednost: clip = alfa test, blend = průhledný průchod */
  alpha: 'opaque' | 'clip' | 'blend';
  /** pevné kvádry nodeboxu v rozsahu −0.5..0.5 */
  box?: number[][];
}

const DEFS: NodeDef[] = [];
const add = (name: string, d: Partial<NodeDef> & { tiles: string[] }): void => {
  DEFS.push({ name, drawtype: 'normal', walkable: true, light: 0, alpha: 'opaque', ...d });
};

DEFS.push({ name: 'air', drawtype: 'airlike', tiles: [], walkable: false, light: 0, alpha: 'opaque' });

// --- dw_nodes ---
for (const s of ['stone', 'desert_stone', 'sandstone', 'desert_sandstone', 'silver_sandstone',
  'obsidian', 'clay', 'permafrost', 'coral_skeleton']) add(`dw_nodes:${s}`, { tiles: [`dwn_${s}.png`] });
for (const s of ['sand', 'desert_sand', 'silver_sand', 'dirt', 'dry_dirt', 'gravel', 'snowblock', 'snow'])
  add(`dw_nodes:${s}`, { tiles: [`dwn_${s}.png`] });
for (const [n, top, side] of [
  ['dirt_with_grass', 'grass_top', 'grass_side'],
  ['dirt_with_dry_grass', 'dry_grass_top', 'dry_grass_side'],
  ['dirt_with_rainforest_litter', 'rainforest_litter_top', 'litter_side'],
]) add(`dw_nodes:${n}`, { tiles: [`dwn_${top}.png`, 'dwn_dirt.png', `dwn_${side}.png`] });
// led má use_texture_alpha=blend; kreslíme ho neprůhledně (jako pevný blok)
add('dw_nodes:ice', { tiles: ['dwn_ice.png'] });
add('dw_nodes:cave_ice', { tiles: ['dwn_cave_ice.png'] });
for (const t of ['tree', 'jungletree', 'pine_tree', 'aspen_tree', 'acacia_tree', 'bush_stem'])
  add(`dw_nodes:${t}`, { tiles: [`dwn_${t}_top.png`, `dwn_${t}_top.png`, `dwn_${t}.png`] });
for (const [n, tex] of [['leaves', 'leaves'], ['jungleleaves', 'jungleleaves'], ['pine_needles', 'pine_needles'],
  ['aspen_leaves', 'aspen_leaves'], ['acacia_leaves', 'acacia_leaves'], ['bush_leaves', 'bush_leaves'],
  ['acacia_bush_leaves', 'acacia_bush_leaves'], ['blueberry_bush_leaves_with_berries', 'blueberry_leaves']])
  add(`dw_nodes:${n}`, { drawtype: 'allfaces', alpha: 'clip', tiles: [`dwn_${tex}.png`] });
add('dw_nodes:cactus', { tiles: ['dwn_cactus_top.png', 'dwn_cactus_top.png', 'dwn_cactus_side.png'] });
for (const p of ['grass_1', 'grass_2', 'grass_3', 'grass_4', 'grass_5', 'dry_grass_1', 'dry_grass_2', 'dry_grass_3',
  'dry_grass_4', 'dry_grass_5', 'fern_1', 'fern_2', 'fern_3', 'marram_grass_1', 'marram_grass_2', 'marram_grass_3',
  'junglegrass', 'dry_shrub', 'papyrus', 'rose', 'tulip', 'viola', 'geranium', 'dandelion_yellow', 'dandelion_white',
  'mushroom_red', 'mushroom_brown'])
  add(`dw_nodes:${p}`, { drawtype: 'plantlike', alpha: 'clip', walkable: false, tiles: [`dwn_${p}.png`] });
add('dw_nodes:waterlily', {
  drawtype: 'nodebox', alpha: 'clip', walkable: false, tiles: ['dwn_waterlily.png'],
  box: [[-0.5, -0.5, -0.5, 0.5, -0.4375, 0.5]],
});
for (const [n, tex, light] of [['water', 'water', 0], ['river_water', 'river_water', 0], ['lava', 'lava', 13]] as const) {
  // tekutiny netečou (v1): flowing je jen alias vzhledu
  add(`dw_nodes:${n}_source`, { drawtype: 'liquid', alpha: light ? 'opaque' : 'blend', walkable: false, light, tiles: [`dwn_${tex}.png`] });
  add(`dw_nodes:${n}_flowing`, { drawtype: 'liquid', alpha: light ? 'opaque' : 'blend', walkable: false, light, tiles: [`dwn_${tex}.png`] });
}
add('dw_nodes:basic_flame', { drawtype: 'firelike', alpha: 'clip', walkable: false, light: 13, tiles: ['dwn_basic_flame.png'] });

// --- dw_core/nodes.lua ---
add('doggiowars:spore_block', { tiles: ['doggiowars_spore.png'] });
add('doggiowars:magma_block', { tiles: ['doggiowars_magma.png'], light: 8 });
add('doggiowars:ice_crystal', { drawtype: 'glasslike', alpha: 'blend', tiles: ['doggiowars_ice_crystal.png'] });
add('doggiowars:dead_stone', { tiles: ['doggiowars_dead_stone.png'] });
add('doggiowars:embers', { tiles: ['doggiowars_embers.png'], light: 10 });
add('doggiowars:ash', { tiles: ['doggiowars_ash.png'] });
add('doggiowars:mud', { tiles: ['doggiowars_mud.png'] });
add('doggiowars:crystal', { tiles: ['doggiowars_crystal.png'], light: 12 });
add('doggiowars:basalt', { tiles: ['doggiowars_basalt.png'] });
add('doggiowars:mossy_stone', { tiles: ['doggiowars_mossy_stone.png'] });

export const NODES: readonly NodeDef[] = DEFS;
export const AIR = 0;
const byName = new Map(DEFS.map((d, i) => [d.name, i]));
const STONE = byName.get('dw_nodes:stone')!;

/** Id nodu podle jména; neznámé → kámen (jako fallback v biomes.lua) */
export function nodeId(name: string): number {
  return byName.get(name) ?? STONE;
}

/** Seznam textur = vrstvy texture array (pořadí stabilní, odvozené z registru) */
export const TEXTURES: readonly string[] = [...new Set(DEFS.flatMap((d) => d.tiles))];
const layerOf = new Map(TEXTURES.map((t, i) => [t, i]));

// Tabulky pro mesher (index = id nodu)
const N = DEFS.length;
/** vrstva pro plochy: [top, bottom, side] */
export const NODE_TILE = new Uint16Array(N * 3);
/** plná neprůhledná krychle — zakrývá sousední plochy, vrhá AO */
export const NODE_OPAQUE = new Uint8Array(N);
/** pro raycast/kolize */
export const NODE_WALKABLE = new Uint8Array(N);
export const NODE_LIGHT = new Uint8Array(N);
export const NODE_DRAW = DEFS.map((d) => d.drawtype);

DEFS.forEach((d, i) => {
  const t = d.tiles;
  const top = t[0], bottom = t[1] ?? top, side = t[2] ?? bottom;
  NODE_TILE[i * 3] = layerOf.get(top) ?? 0;
  NODE_TILE[i * 3 + 1] = layerOf.get(bottom) ?? 0;
  NODE_TILE[i * 3 + 2] = layerOf.get(side) ?? 0;
  NODE_OPAQUE[i] = d.drawtype === 'normal' ? 1 : 0;
  NODE_WALKABLE[i] = d.walkable && d.drawtype !== 'airlike' ? 1 : 0;
  NODE_LIGHT[i] = d.light;
});

export const NODE_COUNT = N;

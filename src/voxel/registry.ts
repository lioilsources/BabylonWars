// Registr nodů. Jména dw_nodes:* / doggiowars:* zůstávají z Luanti.
// F0: jen barva (bez textur); F1 doplní vrstvy texture array a drawtypy.

export interface NodeDef {
  name: string;
  solid: boolean;
  color: [number, number, number];
  emissive?: boolean;
}

const DEFS: NodeDef[] = [
  { name: 'air', solid: false, color: [0, 0, 0] },
  { name: 'dw_nodes:stone', solid: true, color: [0.5, 0.5, 0.5] },
  { name: 'dw_nodes:dirt', solid: true, color: [0.45, 0.32, 0.2] },
  { name: 'dw_nodes:dirt_with_grass', solid: true, color: [0.33, 0.6, 0.22] },
  { name: 'dw_nodes:ice', solid: true, color: [0.65, 0.8, 0.95] },
  { name: 'dw_nodes:snowblock', solid: true, color: [0.93, 0.95, 0.98] },
  { name: 'dw_nodes:permafrost', solid: true, color: [0.4, 0.38, 0.36] },
  { name: 'dw_nodes:obsidian', solid: true, color: [0.12, 0.1, 0.15] },
  { name: 'dw_nodes:sand', solid: true, color: [0.88, 0.83, 0.6] },
  { name: 'dw_nodes:desert_sand', solid: true, color: [0.85, 0.65, 0.42] },
  { name: 'dw_nodes:desert_stone', solid: true, color: [0.6, 0.38, 0.28] },
  { name: 'dw_nodes:desert_sandstone', solid: true, color: [0.75, 0.55, 0.38] },
  { name: 'dw_nodes:silver_sand', solid: true, color: [0.82, 0.82, 0.78] },
  { name: 'dw_nodes:clay', solid: true, color: [0.62, 0.62, 0.68] },
  { name: 'dw_nodes:gravel', solid: true, color: [0.45, 0.43, 0.42] },
  { name: 'dw_nodes:dirt_with_rainforest_litter', solid: true, color: [0.35, 0.3, 0.15] },
  { name: 'dw_nodes:dirt_with_dry_grass', solid: true, color: [0.7, 0.62, 0.3] },
  { name: 'dw_nodes:dry_dirt', solid: true, color: [0.6, 0.45, 0.3] },
  { name: 'doggiowars:spore_block', solid: true, color: [0.55, 0.4, 0.6] },
  { name: 'doggiowars:dead_stone', solid: true, color: [0.42, 0.4, 0.38] },
  { name: 'doggiowars:embers', solid: true, color: [0.8, 0.3, 0.1], emissive: true },
  { name: 'doggiowars:ash', solid: true, color: [0.33, 0.32, 0.32] },
  { name: 'doggiowars:mud', solid: true, color: [0.3, 0.25, 0.18] },
  { name: 'doggiowars:crystal', solid: true, color: [0.7, 0.85, 1.0], emissive: true },
  { name: 'doggiowars:basalt', solid: true, color: [0.22, 0.21, 0.23] },
  { name: 'doggiowars:mossy_stone', solid: true, color: [0.38, 0.48, 0.32] },
];

export const NODES: readonly NodeDef[] = DEFS;
export const AIR = 0;
const byName = new Map(DEFS.map((d, i) => [d.name, i]));

export function nodeId(name: string): number {
  const id = byName.get(name);
  if (id === undefined) return byName.get('dw_nodes:stone')!;
  return id;
}

/** RGB tabulka pro mesher: [r,g,b, r,g,b, ...] podle id */
export const NODE_COLORS = new Float32Array(DEFS.flatMap((d) => d.color));
export const NODE_SOLID = new Uint8Array(DEFS.map((d) => (d.solid ? 1 : 0)));
export const NODE_EMISSIVE = new Uint8Array(DEFS.map((d) => (d.emissive ? 1 : 0)));

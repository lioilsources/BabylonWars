// Biomy z biomes.lua (12 typů). surface(depth) vrací jméno nodu.
import type { IslandShape } from './islands';

export interface Biome {
  name: string;
  shape: IslandShape;
  surface: (depth: number) => string;
  /** Barva pro F0 / impostory (RGB 0..1) */
  tint: [number, number, number];
}

export const BIOMES: Biome[] = [
  { name: 'verdant', shape: 'avatar', tint: [0.36, 0.62, 0.25],
    surface: (d) => d === 0 ? 'dw_nodes:dirt_with_grass' : d <= 3 ? 'dw_nodes:dirt' : 'dw_nodes:stone' },
  { name: 'glacial', shape: 'mesa', tint: [0.88, 0.93, 0.98],
    surface: (d) => d === 0 ? 'dw_nodes:snowblock' : d <= 2 ? 'dw_nodes:ice' : d <= 5 ? 'dw_nodes:permafrost' : 'dw_nodes:stone' },
  { name: 'volcanic', shape: 'avatar', tint: [0.22, 0.2, 0.22],
    surface: (d) => d === 0 ? 'doggiowars:basalt' : d <= 3 ? 'dw_nodes:obsidian' : 'dw_nodes:stone' },
  { name: 'atoll', shape: 'disc', tint: [0.9, 0.85, 0.6],
    surface: (d) => d === 0 ? 'dw_nodes:sand' : d <= 2 ? 'dw_nodes:clay' : 'dw_nodes:stone' },
  { name: 'mycelial', shape: 'avatar', tint: [0.55, 0.42, 0.6],
    surface: (d) => d === 0 ? 'doggiowars:spore_block' : d <= 3 ? 'dw_nodes:dirt' : 'dw_nodes:stone' },
  { name: 'barren', shape: 'cone', tint: [0.5, 0.48, 0.45],
    surface: (d) => d === 0 ? 'doggiowars:dead_stone' : 'dw_nodes:stone' },
  { name: 'jungle', shape: 'avatar', tint: [0.2, 0.45, 0.15],
    surface: (d) => d === 0 ? 'dw_nodes:dirt_with_rainforest_litter' : d <= 4 ? 'dw_nodes:dirt' : d <= 7 ? 'doggiowars:mossy_stone' : 'dw_nodes:stone' },
  { name: 'desert', shape: 'mesa', tint: [0.85, 0.65, 0.4],
    surface: (d) => d === 0 ? 'dw_nodes:desert_sand' : d <= 4 ? 'dw_nodes:desert_sandstone' : 'dw_nodes:desert_stone' },
  { name: 'crystal', shape: 'spire', tint: [0.75, 0.8, 0.9],
    surface: (d) => d === 0 ? 'dw_nodes:silver_sand' : d <= 2 ? 'dw_nodes:gravel' : d % 5 === 0 ? 'doggiowars:crystal' : 'dw_nodes:stone' },
  { name: 'ashen', shape: 'cone', tint: [0.35, 0.33, 0.32],
    surface: (d) => d === 0 ? 'doggiowars:ash' : d <= 2 ? 'doggiowars:embers' : d <= 5 ? 'doggiowars:basalt' : 'dw_nodes:stone' },
  { name: 'savanna', shape: 'mesa', tint: [0.7, 0.65, 0.35],
    surface: (d) => d === 0 ? 'dw_nodes:dirt_with_dry_grass' : d <= 3 ? 'dw_nodes:dry_dirt' : 'dw_nodes:stone' },
  { name: 'swamp', shape: 'disc', tint: [0.35, 0.38, 0.25],
    surface: (d) => d === 0 ? 'doggiowars:mud' : d <= 3 ? 'dw_nodes:dirt' : d <= 6 ? 'doggiowars:mossy_stone' : 'dw_nodes:stone' },
];

export const BIOME_COUNT = 12;

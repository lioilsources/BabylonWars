// Doslovný port hash_2d / nexth / unit z mapgen.lua.
// Počítá se v double: mezivýsledek h * 1103515245 přesahuje 2^53, takže
// zaokrouhlení je součást algoritmu. Žádný Math.imul ani BigInt.
// Lua `a % b` = a - floor(a/b)*b (ne fmod jako JS `%`) — i to je součást výsledku.

export const luaMod = (a: number, b: number): number => a - Math.floor(a / b) * b;

export function hash2d(cx: number, cz: number, seed: number): number {
  let h = cx * 73856093 + cz * 19349663 + seed;
  h = Math.abs(h);
  return luaMod(h * 1103515245 + 12345, 2147483648);
}

export const nexth = (h: number): number => luaMod(h * 1103515245 + 12345, 2147483648);

/** Rovnoměrné [0,1) z horních bitů hashe */
export const unit = (h: number): number => Math.floor(h / 32768) / 65536;

/** Převod seedu světa (mapgen.lua get_world_seed): číslice modulárně pod 2^31 */
export function parseSeed(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') n = luaMod(n * 10 + (ch.charCodeAt(0) - 48), 2147483648);
  }
  return n === 0 ? 42 : n;
}

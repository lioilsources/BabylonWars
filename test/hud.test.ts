import { describe, expect, it } from 'vitest';
import { compassTape } from '../src/game/hud/hud';
import { setLang, t, tFlash } from '../src/game/i18n';
import { islandsWithin, nearestIsland } from '../src/gen/islands';

describe('HUD', () => {
  it('kompasová páska jako hud.lua', () => {
    const tape = compassTape(0);
    expect(tape).toContain('[N ]');
    expect(tape.indexOf(' NW ')).toBeLessThan(tape.indexOf('[N ]'));
    expect(tape.indexOf(' NE ')).toBeGreaterThan(tape.indexOf('[N ]'));
    expect(tape.length).toBe(9 * 4);
    expect(compassTape(92)).toContain('[E ]');
    expect(compassTape(359)).toContain('[N ]');
  });

  it('překlady a hlášky', () => {
    setLang('cs');
    expect(t('cmd.seed', 42)).toBe('Seed: 42');
    expect(tFlash('BARREL ROLL!  ×3')).toBe('VÝKRUT!  ×3');
    setLang('en');
    expect(tFlash('BARREL ROLL!')).toBe('BARREL ROLL!');
  });

  it('ostrovy v okruhu obsahují nejbližší', () => {
    const near = nearestIsland(500, -300, 42)!;
    const list = islandsWithin(500, -300, 800, 42);
    expect(list).toContain(near.isl);
    for (const i of list) expect(Math.hypot(i.x - 500, i.z + 300) - i.radius).toBeLessThanOrEqual(800);
  });
});

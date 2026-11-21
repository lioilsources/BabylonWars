import { describe, expect, it } from 'vitest';
import { Creatures } from '../src/sim/creatures';
import { vec3 } from '../src/sim/math';
import { islandForCell } from '../src/gen/islands';
import { ChatBridge } from '../src/game/twitch';

describe('chatbridge', () => {
  const seed = 42;
  const home = islandForCell(0, 0, seed)!;
  const mk = (protect = vec3(1e6, 0, 0)) => {
    const creatures = new Creatures(() => false, seed);
    const notes: string[] = [];
    const player = vec3(home.x + 200, home.y + 60, home.z);
    const chat = new ChatBridge({ creatures, player: () => player, protectCenter: protect, notify: (m) => notes.push(m) });
    return { creatures, chat, notes, player };
  };

  it('spawn z chatu: druh, počet se stropem, TTL úklid, seq', () => {
    const { creatures, chat } = mk();
    chat.process({ events: [
      { seq: 1, type: 'spawn', action: 'dragon', params: { entity: 'doggiowars:dragon_fire', count: 3 }, ttl: 10 },
      { seq: 2, type: 'spawn', params: { entity: 'doggiowars:jelly', count: 99 } },
      { seq: 3, type: 'spawn', params: { entity: 'mobs:unknown' } },
      { seq: 4, type: 'weather', action: 'rain' },
    ] }, 0);
    expect(creatures.list.filter((c) => c.species === 'dragon_fire').length).toBe(3);
    expect(creatures.list.filter((c) => c.species === 'jelly').length).toBe(10);
    chat.update(0.01, 11);
    expect(creatures.list.filter((c) => c.species === 'dragon_fire').length).toBe(0);
    expect(creatures.list.filter((c) => c.species === 'jelly').length).toBe(10);   // ttl 0 = sám si řídí život
  });

  it('chráněná zóna, /chatoff, reset a system', () => {
    const p = mk();
    // zóna kolem hráče: nic se nespawne
    const z = mk(vec3(home.x + 200, home.y + 60, home.z));
    z.chat.process({ events: [{ seq: 1, type: 'spawn', params: { entity: 'doggiowars:worm', count: 5 } }] }, 0);
    expect(z.creatures.count).toBe(0);
    p.chat.process({ events: [{ seq: 5, type: 'spawn', params: { entity: 'doggiowars:worm', count: 2 }, ttl: 60 }] }, 0);
    expect(p.creatures.count).toBe(2);
    p.chat.setEnabled(false);
    expect(p.creatures.count).toBe(0);
    p.chat.process({ events: [{ seq: 6, type: 'spawn', params: { entity: 'doggiowars:worm' } }, { seq: 7, type: 'system', action: 'throttled' }] }, 0);
    expect(p.creatures.count).toBe(0);
    expect(p.notes.length).toBe(1);
    p.chat.process({ reset: true, latest: 500 }, 0);
    expect((p.chat as unknown as { lastSeq: number }).lastSeq).toBe(500);
  });
});

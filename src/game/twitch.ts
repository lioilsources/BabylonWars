// Twitch chat → hra přes službu chatbridge (port mods/chatbridge/init.lua).
// Hra se služby ptá GET <url>/events?since=&max= (jedna žádost naráz, 1 s mezi
// koly); služba musí povolit CORS pro origin hry. Události: spawn (entity
// "doggiowars:<druh>", count, ttl) a system (throttled). /chatoff vše
// uklidí, /chaton zase zapne.
import type { Creatures } from '../sim/creatures';
import { SPECIES } from '../sim/creatures';
import type { Vec3 } from '../sim/math';
import { TUNING } from './settings';

interface BridgeEvent {
  seq?: number;
  type?: string;
  action?: string;
  ttl?: number;
  params?: { entity?: string; count?: number };
}
interface BridgeResponse { events?: BridgeEvent[]; latest?: number; reset?: boolean }

export interface ChatHost {
  creatures: Creatures;
  player(): Vec3 | null;
  /** chráněná zóna (spawn) — sem chat nic nepustí */
  protectCenter: Vec3;
  notify(msg: string): void;
}

export class ChatBridge {
  enabled = true;
  private url = '';
  private lastSeq = 0;
  private timer = 0;
  private busy = false;
  private tracked: { id: number; expires: number }[] = [];
  private failures = 0;
  status = 'off';

  constructor(private host: ChatHost) {}

  /** Nastaví URL služby ('' = vypnout) */
  connect(url: string): void {
    this.url = url.trim().replace(/\/+$/, '');
    this.lastSeq = 0;
    this.failures = 0;
    this.status = this.url ? 'connecting' : 'off';
  }

  get active(): boolean { return this.url !== ''; }

  /** Volá se každý frame s časem v sekundách */
  update(dt: number, now: number): void {
    // TTL úklid
    if (this.tracked.length) {
      this.tracked = this.tracked.filter((r) => {
        if (!this.host.creatures.has(r.id)) return false;
        if (now >= r.expires) { this.host.creatures.despawn(r.id); return false; }
        return true;
      });
    }
    if (!this.url || this.busy) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = TUNING.chat.pollInterval * Math.min(8, 1 + this.failures);   // při výpadku řidší dotazy
    void this.poll(now);
  }

  private async poll(now: number): Promise<void> {
    this.busy = true;
    const url = `${this.url}/events?since=${this.lastSeq}&max=${TUNING.chat.maxEvents}`;
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), TUNING.chat.fetchTimeout * 1000);
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.process(await res.json() as BridgeResponse, now);
      this.failures = 0;
      this.status = 'ok';
    } catch (e) {
      this.failures++;
      this.status = `error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.busy = false;
    }
  }

  /** Zpracování odpovědi (veřejné kvůli testům) */
  process(data: BridgeResponse, now: number): void {
    if (data.reset) {
      // vypadli jsme z okna, které služba drží: srovnat na nejnovější, nepřehrávat
      this.lastSeq = Number(data.latest) || this.lastSeq;
      return;
    }
    for (const ev of data.events ?? []) {
      this.apply(ev, now);
      const s = Number(ev.seq);
      if (s > this.lastSeq) this.lastSeq = s;
    }
  }

  private apply(ev: BridgeEvent, now: number): void {
    if (typeof ev.type !== 'string') return;
    if (ev.type === 'system') {
      if (ev.action === 'throttled') this.host.notify('[chatbridge] world is full, spawns paused');
      return;
    }
    if (!this.enabled || ev.type !== 'spawn') return;   // neznámé typy ignorovat (dopředná kompatibilita)
    const entity = ev.params?.entity;
    if (typeof entity !== 'string') return;
    const species = entity.replace(/^doggiowars:/, '');
    if (!(species in SPECIES)) return;
    const base = this.host.player();
    if (!base) return;
    const C = TUNING.chat;
    const count = Math.max(1, Math.min(Number(ev.params?.count) || 1, C.countCap));
    const ttl = Number(ev.ttl) || 0;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2, r = C.spawnRMin + Math.random() * (C.spawnRMax - C.spawnRMin);
      const x = base.x + Math.cos(ang) * r, y = base.y + 1, z = base.z + Math.sin(ang) * r;
      const pc = this.host.protectCenter;
      // 3D vzdálenost: vodorovná by chránila celý sloupec vzduchu nad spawnem
      if (Math.hypot(x - pc.x, y - pc.y, z - pc.z) < C.protectRadius) continue;
      const c = this.host.creatures.spawn(species as keyof typeof SPECIES, x, y, z);
      if (c && ttl > 0) this.tracked.push({ id: c.id, expires: now + ttl });
    }
  }

  /** /chatoff: přestat a uklidit, co chat přivolal */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      for (const r of this.tracked) this.host.creatures.despawn(r.id);
      this.tracked = [];
    }
  }
}

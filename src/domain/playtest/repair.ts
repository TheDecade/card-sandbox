import { checkInvariants } from './invariants';
import { emptyZones, ZONE_IDS, type CardInstance, type PlaytestState, type Vec2, type ZoneId } from './types';
import { ZONE_RULES } from './zones';

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));

function normalize(inst: CardInstance, ownerId: number, zone: ZoneId): CardInstance {
  const rule = ZONE_RULES[zone];
  const pos: Vec2 = inst.position ?? { x: 0.5, y: 0.5 };
  const counters: CardInstance['counters'] = {};
  for (const [color, n] of Object.entries(inst.counters)) {
    if (Number.isInteger(n) && (n ?? 0) > 0) counters[color] = n;
  }
  return {
    ...inst,
    ownerId,
    zone,
    faceUp: rule.faceUp,
    position: rule.hasPosition ? { x: clamp01(pos.x), y: clamp01(pos.y) } : null,
    tapped: rule.keepsTapped && inst.tapped,
    counters,
  };
}

/**
 * Makes a saved playtest consistent again instead of throwing it away: duplicate or unknown zone
 * entries are dropped, and cards that ended up in no zone go to their owner's graveyard.
 */
export function repairPlaytest(s: PlaytestState): { state: PlaytestState; fixes: number } {
  const fixes = checkInvariants(s).length;
  if (fixes === 0) return { state: s, fixes: 0 };

  const players = s.players.map((_, index) => ({ id: index, zones: emptyZones() }));
  const instances: Record<string, CardInstance> = {};

  s.players.forEach((p, index) => {
    for (const zone of ZONE_IDS) {
      for (const id of p.zones[zone] ?? []) {
        const inst = s.instances[id];
        if (!inst || instances[id]) continue;
        players[index]!.zones[zone].push(id);
        instances[id] = normalize(inst, index, zone);
      }
    }
  });

  for (const inst of Object.values(s.instances)) {
    if (instances[inst.id]) continue;
    const owner = players[inst.ownerId] ? inst.ownerId : 0;
    players[owner]!.zones.graveyard.push(inst.id);
    instances[inst.id] = normalize(inst, owner, 'graveyard');
  }

  const currentPlayer = s.currentPlayer >= 0 && s.currentPlayer < players.length ? s.currentPlayer : 0;
  return { state: { ...s, players, instances, currentPlayer }, fixes };
}

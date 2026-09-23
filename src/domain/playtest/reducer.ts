import { produce, type Draft } from 'immer';
import type { PlaytestCommand, ZoneTarget } from './commands';
import {
  SHARED_OWNER,
  SHARED_ZONE_SIZE,
  ZONE_IDS,
  type CardInstance,
  type InstanceId,
  type PlaytestState,
  type Vec2,
} from './types';
import { ZONE_RULES } from './zones';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const MAX_VALUE = 999_999;
const clampPos = (p: Vec2): Vec2 => ({ x: clamp01(p.x), y: clamp01(p.y) });

/**
 * The only way a playtest changes. Pure: returns a new state and never touches the input.
 * Invalid commands (unknown ids, wrong zone) leave the state unchanged.
 */
export function applyCommand(state: PlaytestState, cmd: PlaytestCommand): PlaytestState {
  return produce(state, (draft) => {
    switch (cmd.type) {
      case 'moveCard':
        moveCard(draft, cmd.instanceId, cmd.to, cmd.playerId);
        break;

      case 'moveOnCanvas': {
        const inst = draft.instances[cmd.instanceId];
        if (!inst || inst.zone !== 'canvas') return;
        inst.position = clampPos(cmd.position);
        bringToFront(draft, cmd.instanceId);
        break;
      }

      case 'toggleTapped': {
        const inst = draft.instances[cmd.instanceId];
        if (!inst || !ZONE_RULES[inst.zone].keepsTapped) return;
        inst.tapped = !inst.tapped;
        break;
      }

      case 'untapAll': {
        for (const id of draft.players[cmd.playerId]?.zones.canvas ?? []) {
          const inst = draft.instances[id];
          if (inst) inst.tapped = false;
        }
        break;
      }

      case 'changeCounters': {
        const inst = draft.instances[cmd.instanceId];
        if (!inst || !inst.faceUp) return; // face-down cards can't be handled
        const next = Math.max(0, (inst.counters[cmd.color] ?? 0) + Math.trunc(cmd.delta));
        if (next === 0) delete inst.counters[cmd.color];
        else inst.counters[cmd.color] = next;
        break;
      }

      case 'setDeckOrder': {
        const deck = draft.players[cmd.playerId]?.zones.deck;
        if (!deck || !sameMembers(deck, cmd.order)) return;
        deck.splice(0, deck.length, ...cmd.order);
        break;
      }

      case 'setSharedDeckOrder': {
        const deck = draft.sharedDeck;
        if (!deck || !sameMembers(deck, cmd.order)) return;
        deck.splice(0, deck.length, ...cmd.order);
        break;
      }

      case 'refreshSharedDeck': {
        const deck = draft.sharedDeck;
        if (!deck) return;
        const fresh = cmd.instances.filter(
          (i) => i.shared && i.ownerId === SHARED_OWNER && i.zone === 'deck' && !draft.instances[i.id],
        );
        for (const id of deck) delete draft.instances[id];
        for (const i of fresh) draft.instances[i.id] = { ...i, faceUp: false, position: null, tapped: false, counters: {} };
        deck.splice(0, deck.length, ...fresh.map((i) => i.id));
        break;
      }

      case 'selectPlayer':
        if (cmd.playerId >= 0 && cmd.playerId < draft.players.length) draft.currentPlayer = cmd.playerId;
        break;

      case 'addPlayers':
        for (const p of cmd.players) draft.players.push(p);
        for (const i of cmd.instances) draft.instances[i.id] = i;
        break;

      case 'removePlayersFrom': {
        if (cmd.playerId < 1) return; // always keep at least one player
        // Shared cards the removed players hold go back under the shared deck; the rest is discarded.
        for (const player of draft.players.slice(cmd.playerId)) {
          for (const zone of ZONE_IDS) {
            for (const id of [...player.zones[zone]]) {
              const inst = draft.instances[id];
              if (inst?.shared && draft.sharedDeck) putInSharedDeck(draft, id, 'bottom');
              else delete draft.instances[id];
            }
          }
        }
        for (const id of [...draft.sharedZone]) {
          const inst = draft.instances[id];
          if (!inst || inst.ownerId < cmd.playerId) continue;
          draft.sharedZone.splice(draft.sharedZone.indexOf(id), 1);
          delete draft.instances[id];
        }
        draft.players.splice(cmd.playerId);
        if (draft.currentPlayer >= draft.players.length) draft.currentPlayer = 0;
        break;
      }

      case 'setRules':
        draft.rules = { ...draft.rules, ...cmd.rules };
        break;

      case 'addInstance': {
        const inst = cmd.instance;
        const player = draft.players[inst.ownerId];
        if (!player || draft.instances[inst.id] || inst.zone === 'sharedZone') return;
        draft.instances[inst.id] = { ...inst, counters: { ...inst.counters } };
        player.zones[inst.zone].push(inst.id);
        break;
      }

      case 'removeInstance': {
        const inst = draft.instances[cmd.instanceId];
        if (!inst) return;
        const zone = listOf(draft, inst);
        const at = zone?.indexOf(cmd.instanceId) ?? -1;
        if (zone && at >= 0) zone.splice(at, 1);
        delete draft.instances[cmd.instanceId];
        break;
      }

      case 'unbindInstance': {
        const inst = draft.instances[cmd.instanceId];
        if (inst) inst.bound = false;
        break;
      }

      case 'addMarker': {
        const player = draft.players[cmd.playerId];
        if (!player || player.markers.some((m) => m.id === cmd.marker.id)) return;
        player.markers.push({ ...cmd.marker, position: clampPos(cmd.marker.position) });
        break;
      }

      case 'moveMarker': {
        const markers = draft.players[cmd.playerId]?.markers;
        const at = markers?.findIndex((m) => m.id === cmd.markerId) ?? -1;
        if (!markers || at < 0) return;
        const [marker] = markers.splice(at, 1);
        markers.push({ ...marker!, position: clampPos(cmd.position) });
        break;
      }

      case 'removeMarker': {
        const markers = draft.players[cmd.playerId]?.markers;
        const at = markers?.findIndex((m) => m.id === cmd.markerId) ?? -1;
        if (markers && at >= 0) markers.splice(at, 1);
        break;
      }

      case 'setPlayerValue': {
        const player = draft.players[cmd.playerId];
        if (!player || !Number.isFinite(cmd.value)) return;
        player.values[cmd.valueId] = Math.max(-MAX_VALUE, Math.min(MAX_VALUE, Math.round(cmd.value)));
        break;
      }
    }
  });
}

/** The ordered list that holds a card: one of its owner's zones, the shared deck or the shared zone. */
function listOf(draft: Draft<PlaytestState>, inst: CardInstance): InstanceId[] | undefined {
  if (inst.zone === 'sharedZone') return draft.sharedZone;
  if (inst.ownerId === SHARED_OWNER) return draft.sharedDeck ?? undefined;
  return draft.players[inst.ownerId]?.zones[inst.zone];
}

function moveCard(draft: Draft<PlaytestState>, id: InstanceId, to: ZoneTarget, playerId?: number): void {
  const inst = draft.instances[id];
  if (!inst) return;
  if (inst.shared && to.zone === 'deck') {
    // The decks never mix: a shared card's only deck is the shared one.
    if (draft.sharedDeck) putInSharedDeck(draft, id, to.placement);
    return;
  }
  if (inst.token && to.zone === 'deck') return; // tokens only exist outside the decks
  const unowned = inst.ownerId === SHARED_OWNER;
  if (!unowned && playerId !== undefined && playerId !== inst.ownerId) return; // never to another player
  const from = listOf(draft, inst);
  if (!from) return;

  let target: InstanceId[];
  let ownerId: number;
  if (to.zone === 'sharedZone') {
    if (inst.zone !== 'sharedZone' && draft.sharedZone.length >= SHARED_ZONE_SIZE) return;
    target = draft.sharedZone;
    ownerId = inst.shared ? SHARED_OWNER : inst.ownerId;
  } else {
    ownerId = unowned ? (playerId ?? draft.currentPlayer) : inst.ownerId;
    const player = draft.players[ownerId];
    if (!player) return;
    target = player.zones[to.zone];
  }

  const zoneChanged = inst.zone !== to.zone;

  // 1. Remove from the current zone.
  const at = from.indexOf(id);
  if (at >= 0) from.splice(at, 1);

  // 2. Insert into the target zone.
  inst.ownerId = ownerId;
  if (to.zone === 'deck') {
    if (to.placement === 'top') target.unshift(id);
    else target.push(id);
  } else if (to.zone === 'hand' && to.index !== undefined) {
    target.splice(Math.max(0, Math.min(to.index, target.length)), 0, id);
  } else {
    target.push(id); // canvas: last = on top
  }

  // 3. Apply the target zone's rules.
  const rule = ZONE_RULES[to.zone];
  inst.zone = to.zone;
  inst.faceUp = rule.faceUp;
  inst.position = to.zone === 'canvas' ? clampPos(to.position) : null;
  if (!rule.keepsTapped) inst.tapped = false;
  if (zoneChanged && !draft.rules.countersPersist) inst.counters = {};
}

/** Moves a shared card (from wherever it is) onto the top or bottom of the shared deck. */
function putInSharedDeck(draft: Draft<PlaytestState>, id: InstanceId, placement: 'top' | 'bottom'): void {
  const inst = draft.instances[id];
  const deck = draft.sharedDeck;
  if (!inst || !deck) return;
  const from = listOf(draft, inst);
  const at = from?.indexOf(id) ?? -1;
  if (from && at >= 0) from.splice(at, 1);
  if (placement === 'top') deck.unshift(id);
  else deck.push(id);
  if (inst.zone !== 'deck' && !draft.rules.countersPersist) inst.counters = {};
  inst.ownerId = SHARED_OWNER;
  inst.zone = 'deck';
  inst.faceUp = ZONE_RULES.deck.faceUp;
  inst.position = null;
  inst.tapped = false;
}

function bringToFront(draft: Draft<PlaytestState>, id: InstanceId): void {
  const inst = draft.instances[id];
  const canvas = inst && draft.players[inst.ownerId]?.zones.canvas;
  if (!canvas) return;
  const at = canvas.indexOf(id);
  if (at >= 0 && at !== canvas.length - 1) {
    canvas.splice(at, 1);
    canvas.push(id);
  }
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

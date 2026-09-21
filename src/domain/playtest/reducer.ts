import { produce, type Draft } from 'immer';
import type { PlaytestCommand, ZoneTarget } from './commands';
import type { InstanceId, PlaytestState, Vec2 } from './types';
import { ZONE_RULES } from './zones';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampPos = (p: Vec2): Vec2 => ({ x: clamp01(p.x), y: clamp01(p.y) });

/**
 * The only way a playtest changes. Pure: returns a new state and never touches the input.
 * Invalid commands (unknown ids, wrong zone) leave the state unchanged.
 */
export function applyCommand(state: PlaytestState, cmd: PlaytestCommand): PlaytestState {
  return produce(state, (draft) => {
    switch (cmd.type) {
      case 'moveCard':
        moveCard(draft, cmd.instanceId, cmd.to);
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

      case 'changeCounters': {
        const inst = draft.instances[cmd.instanceId];
        if (!inst || !ZONE_RULES[inst.zone].keepsCounters) return;
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

      case 'selectPlayer':
        if (cmd.playerId >= 0 && cmd.playerId < draft.players.length) draft.currentPlayer = cmd.playerId;
        break;

      case 'addPlayers':
        for (const p of cmd.players) draft.players.push(p);
        for (const i of cmd.instances) draft.instances[i.id] = i;
        break;

      case 'removePlayersFrom': {
        if (cmd.playerId < 1) return; // always keep at least one player
        draft.players.splice(cmd.playerId);
        for (const [id, inst] of Object.entries(draft.instances)) {
          if (inst.ownerId >= cmd.playerId) delete draft.instances[id];
        }
        if (draft.currentPlayer >= draft.players.length) draft.currentPlayer = 0;
        break;
      }
    }
  });
}

function moveCard(draft: Draft<PlaytestState>, id: InstanceId, to: ZoneTarget): void {
  const inst = draft.instances[id];
  const player = inst && draft.players[inst.ownerId];
  if (!inst || !player) return;

  // 1. Remove from the current zone.
  const from = player.zones[inst.zone];
  const at = from.indexOf(id);
  if (at >= 0) from.splice(at, 1);

  // 2. Insert into the target zone.
  const target = player.zones[to.zone];
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
  if (!rule.keepsCounters) inst.counters = {};
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

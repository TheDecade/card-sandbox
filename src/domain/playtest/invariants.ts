import { ZONE_IDS, type PlaytestState } from './types';
import { ZONE_RULES } from './zones';

/** Consistency checks; returns human-readable violations (empty = healthy). */
export function checkInvariants(state: PlaytestState): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();

  if (state.currentPlayer < 0 || state.currentPlayer >= state.players.length) {
    errors.push(`currentPlayer ${state.currentPlayer} out of range`);
  }

  state.players.forEach((player, index) => {
    if (player.id !== index) errors.push(`player at index ${index} has id ${player.id}`);
    for (const zone of ZONE_IDS) {
      for (const id of player.zones[zone]) {
        const where = `player ${index} ${zone}`;
        if (seen.has(id)) errors.push(`${id} is in both ${seen.get(id)} and ${where}`);
        seen.set(id, where);
        const inst = state.instances[id];
        if (!inst) {
          errors.push(`${where} lists unknown instance ${id}`);
          continue;
        }
        if (inst.ownerId !== index) errors.push(`${id} owned by ${inst.ownerId} but in ${where}`);
        if (inst.zone !== zone) errors.push(`${id} says zone ${inst.zone} but is in ${where}`);
      }
    }
  });

  for (const [id, inst] of Object.entries(state.instances)) {
    if (!seen.has(id)) errors.push(`${id} is in no zone`);
    const rule = ZONE_RULES[inst.zone];
    if ((inst.position !== null) !== rule.hasPosition) errors.push(`${id} position mismatch in ${inst.zone}`);
    if (inst.faceUp !== rule.faceUp) errors.push(`${id} face state wrong for ${inst.zone}`);
    if (inst.tapped && !rule.keepsTapped) errors.push(`${id} tapped in ${inst.zone}`);
    for (const [color, n] of Object.entries(inst.counters)) {
      if (!rule.keepsCounters) errors.push(`${id} has counters in ${inst.zone}`);
      if (!Number.isInteger(n) || (n ?? 0) <= 0) errors.push(`${id} has invalid ${color} count ${n}`);
    }
  }
  return errors;
}

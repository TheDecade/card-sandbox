import type { CardDefinition, CardId } from '../cards/types';
import type { CardInstance, InstanceId, PlaytestState } from './types';

/**
 * What the UI may know about a card. A face-down card exposes nothing but its id, so the deck
 * can't leak hidden information. Components read cards only through viewCard.
 */
export type VisibleCard =
  | { kind: 'hidden'; instanceId: InstanceId }
  | {
      kind: 'revealed';
      instanceId: InstanceId;
      def: CardDefinition;
      tapped: boolean;
      shared: boolean;
      counters: CardInstance['counters'];
    }
  | { kind: 'missing'; instanceId: InstanceId }; // definition not found (should not happen)

export function viewCard(
  state: PlaytestState,
  getDefinition: (id: CardId) => CardDefinition | undefined,
  instanceId: InstanceId,
): VisibleCard {
  const inst = state.instances[instanceId];
  if (!inst) return { kind: 'missing', instanceId };
  if (!inst.faceUp) return { kind: 'hidden', instanceId };
  const def = getDefinition(inst.definitionId);
  if (!def) return { kind: 'missing', instanceId };
  return { kind: 'revealed', instanceId, def, tapped: inst.tapped, shared: inst.shared, counters: inst.counters };
}

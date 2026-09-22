import { newCardDefinition, type CardDefinition, type CardId } from '../cards/types';
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
      token: boolean;
      blank: boolean; // custom token: a plain card with just its text
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
  const blank = inst.tokenText !== undefined;
  const def = blank ? customTokenDefinition(inst.id, inst.tokenText!) : getDefinition(inst.definitionId);
  if (!def) return { kind: 'missing', instanceId };
  const { tapped, shared, token, counters } = inst;
  return { kind: 'revealed', instanceId, def, tapped, shared, token, blank, counters };
}

/** A stand-in card definition for a custom token, so it shows like any other card. */
function customTokenDefinition(id: InstanceId, text: string): CardDefinition {
  return {
    ...newCardDefinition(0),
    id: `token-${id}`,
    name: 'Token',
    description: text,
    isToken: true,
  };
}

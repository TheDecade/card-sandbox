import { newId } from '../../lib/id';

export type CardId = string;
export type ImageId = string;

/** A card in the Main Card List. Persistent and independent of any playtest. */
export interface CardDefinition {
  id: CardId; // generated once, never edited
  name: string;
  cost: string; // Oracle-style symbols "{2}{W}", or free text
  type: string; // usually one short word, shown between the picture and the description
  subtype: string; // shown next to the type, after a dash; may be empty
  description: string;
  imageId: ImageId | null; // reference into the image library, never a copy
  enabled: boolean; // only enabled cards go into newly built decks
  /** 0 = goes into the decks. N = starts on Player N's table; it can be moved away during play. */
  startingPlayer: number;
  /** Goes only into the shared deck (when the shared deck is on in Options). Has no starting table. */
  shared: boolean;
  /** Shared-deck cards: position in the shared deck (1 = top). One card per number is dealt. */
  eventNumber: number;
  /** A token: in no deck; created on the table from the "Create token" list. Never shared. */
  isToken: boolean;
  createdAt: number;
  updatedAt: number;
  extra?: Record<string, unknown>; // room for future custom properties
}

export function newCardDefinition(now = Date.now()): CardDefinition {
  return {
    id: newId(),
    name: '',
    cost: '',
    type: '',
    subtype: '',
    description: '',
    imageId: null,
    enabled: true,
    startingPlayer: 0,
    shared: false,
    eventNumber: 1,
    isToken: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** True when the user-editable fields differ (used for "unsaved changes"). */
export function cardFieldsDiffer(a: CardDefinition, b: CardDefinition): boolean {
  return (
    a.name !== b.name ||
    a.cost !== b.cost ||
    a.type !== b.type ||
    a.subtype !== b.subtype ||
    a.description !== b.description ||
    a.imageId !== b.imageId ||
    a.enabled !== b.enabled ||
    a.startingPlayer !== b.startingPlayer ||
    a.shared !== b.shared ||
    a.eventNumber !== b.eventNumber ||
    a.isToken !== b.isToken
  );
}

export const displayName = (card: Pick<CardDefinition, 'name'>) => card.name.trim() || 'Untitled card';

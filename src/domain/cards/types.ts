import { newId } from '../../lib/id';

export type CardId = string;
export type ImageId = string;

/** A card in the Main Card List. Persistent and independent of any playtest. */
export interface CardDefinition {
  id: CardId; // generated once, never edited
  name: string;
  cost: string; // free text: "3", "X", "2R", ...
  description: string;
  imageId: ImageId | null; // reference into the image library, never a copy
  enabled: boolean; // only enabled cards go into newly built decks
  createdAt: number;
  updatedAt: number;
  extra?: Record<string, unknown>; // room for future custom properties
}

export function newCardDefinition(now = Date.now()): CardDefinition {
  return {
    id: newId(),
    name: '',
    cost: '',
    description: '',
    imageId: null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** True when the user-editable fields differ (used for "unsaved changes"). */
export function cardFieldsDiffer(a: CardDefinition, b: CardDefinition): boolean {
  return (
    a.name !== b.name ||
    a.cost !== b.cost ||
    a.description !== b.description ||
    a.imageId !== b.imageId ||
    a.enabled !== b.enabled
  );
}

export const displayName = (card: Pick<CardDefinition, 'name'>) => card.name.trim() || 'Untitled card';

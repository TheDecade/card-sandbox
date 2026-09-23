// Card-list files: just the cards (no images, settings or playtest), e.g. generated from the
// game's spreadsheet by scripts/sheet-to-cards.mjs.
//   { "format": "card-sandbox-cards", "version": 1, "cards": [{ "name", "type", "cost", "description" }] }
import { z } from 'zod';
import { newCardDefinition, type CardDefinition } from '../domain/cards/types';

export const CARD_LIST_FORMAT = 'card-sandbox-cards';

const fileSchema = z.object({
  format: z.literal(CARD_LIST_FORMAT),
  version: z.number().int().max(1),
  cards: z.array(
    z.object({
      name: z.string(),
      type: z.string().default(''),
      subtype: z.string().default(''),
      cost: z.string().default(''),
      description: z.string().default(''),
      enabled: z.boolean().default(true),
      boundPlayer: z.number().int().min(0).default(0),
      shared: z.boolean().default(false),
      eventNumber: z.number().int().min(1).default(1),
      isToken: z.boolean().default(false),
    }),
  ),
});

export class CardListFileError extends Error {}

/** Reads a card-list file into new card definitions (fresh ids, in file order). */
export function parseCardListFile(text: string, now = Date.now()): CardDefinition[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new CardListFileError('This file is not a card list (it is not valid JSON).');
  }
  if (typeof raw === 'object' && raw && (raw as { format?: unknown }).format !== CARD_LIST_FORMAT) {
    throw new CardListFileError('This file is not a Card Sandbox card list.');
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const tooNew = (raw as { version?: unknown }).version;
    throw new CardListFileError(
      typeof tooNew === 'number' && tooNew > 1
        ? 'This card list was made by a newer version of the app. Update the app first.'
        : 'The card list file is damaged or incomplete.',
    );
  }
  // createdAt keeps the file's order in the Card Edit list.
  return parsed.data.cards.map((c, i) => ({ ...newCardDefinition(now + i), ...c, imageId: null }));
}

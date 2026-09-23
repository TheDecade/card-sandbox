// Validation for data read back from storage (and, later, from backup files).
import { z } from 'zod';
import {
  DEFAULT_SETTINGS,
  MAX_PLAYER_VALUES,
  MAX_PLAYERS,
  MAX_SHARED_EVENTS,
  MIN_PLAYERS,
  type Settings,
} from '../domain/settings/types';

/** Cards saved before the property was renamed carry boundPlayer. */
const renameLegacyFields = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || 'startingPlayer' in raw) return raw;
  const { boundPlayer, ...rest } = raw as Record<string, unknown>;
  return boundPlayer === undefined ? raw : { ...rest, startingPlayer: boundPlayer };
};

export const cardDefinitionSchema = z.preprocess(
  renameLegacyFields,
  z.object({
  id: z.string().min(1),
  name: z.string(),
  cost: z.string(),
  type: z.string().default(''), // added later: older cards have no type
  subtype: z.string().default(''), // added later
  description: z.string(),
  imageId: z.string().nullable(),
  enabled: z.boolean(),
  startingPlayer: z.number().int().min(0).default(0), // added later: older cards start in the decks
  shared: z.boolean().default(false), // added later: older cards go into the players' decks
  eventNumber: z.number().int().min(1).default(1), // added later
  isToken: z.boolean().default(false), // added later
  createdAt: z.number(),
  updatedAt: z.number(),
  extra: z.record(z.string(), z.unknown()).optional(),
  }),
);

export const settingsSchema = z.object({
  schemaVersion: z.number().int(),
  playerCount: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  countersPersist: z.boolean(),
  sharedDeck: z.boolean(),
  sharedDeckEvents: z.number().int().min(1).max(MAX_SHARED_EVENTS),
  playerValues: z
    .array(z.object({ id: z.string().min(1), name: z.string(), start: z.number().int() }))
    .max(MAX_PLAYER_VALUES),
  lastBackupAt: z.number().nullable(),
});

/** Settings from storage, falling back to defaults field by field when something is off. */
export function parseSettings(raw: unknown): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw ? raw : {}) };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
}

const zoneIdSchema = z.enum(['deck', 'hand', 'canvas', 'graveyard', 'exile', 'sharedZone']);
const vec2Schema = z.object({ x: z.number(), y: z.number() });
const idList = z.array(z.string());

export const playtestSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  createdAt: z.number(),
  rules: z.object({ countersPersist: z.boolean().optional() }).optional(), // added in v2
  players: z
    .array(
      z.object({
        id: z.number().int(),
        zones: z.object({ deck: idList, hand: idList, canvas: idList, graveyard: idList, exile: idList }),
        values: z.record(z.string(), z.number()).optional(), // added in v3
        markers: z.array(z.object({ id: z.string(), color: z.string(), position: vec2Schema })).optional(), // v6
      }),
    )
    .min(1),
  instances: z.record(
    z.string(),
    z.object({
      id: z.string(),
      definitionId: z.string(),
      ownerId: z.number().int().min(-1), // -1: in the shared deck
      zone: zoneIdSchema,
      position: vec2Schema.nullable(),
      faceUp: z.boolean(),
      tapped: z.boolean(),
      counters: z.record(z.string(), z.number()),
      bound: z.boolean().optional(), // v4, renamed in v6
      starter: z.boolean().optional(), // the copy placed on a table at the start
      shared: z.boolean().default(false), // added in v5
      token: z.boolean().default(false), // added in v6
      tokenText: z.string().optional(), // added in v6
    }),
  ),
  sharedDeck: idList.nullable().default(null), // added in v5
  sharedZone: idList.default([]), // added in v6
  currentPlayer: z.number().int(),
});

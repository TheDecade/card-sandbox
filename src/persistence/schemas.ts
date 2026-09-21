// Validation for data read back from storage (and, later, from backup files).
import { z } from 'zod';
import { DEFAULT_SETTINGS, MAX_PLAYERS, MIN_PLAYERS, type Settings } from '../domain/settings/types';

export const cardDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  cost: z.string(),
  description: z.string(),
  imageId: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const settingsSchema = z.object({
  schemaVersion: z.number().int(),
  playerCount: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  lastBackupAt: z.number().nullable(),
});

/** Settings from storage, falling back to defaults field by field when something is off. */
export function parseSettings(raw: unknown): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(typeof raw === 'object' && raw ? raw : {}) };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
}

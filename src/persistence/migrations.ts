// Upgrades stored data from older app versions. Used when loading and when importing backups.
import { DEFAULT_RULES, PLAYTEST_SCHEMA_VERSION, type PlaytestState } from '../domain/playtest/types';

/** A playtest as it may have been saved by any earlier version. */
export type StoredPlaytest = Omit<PlaytestState, 'rules'> & { rules?: Partial<PlaytestState['rules']> };

export function migratePlaytest(p: StoredPlaytest): PlaytestState {
  // v1 → v2: table rules added. v1 kept counters through zones, which matches the default.
  return {
    ...p,
    schemaVersion: PLAYTEST_SCHEMA_VERSION,
    rules: { ...DEFAULT_RULES, ...p.rules },
  };
}

// Upgrades stored data from older app versions. Used when loading and when importing backups.
import { DEFAULT_RULES, PLAYTEST_SCHEMA_VERSION, type PlaytestState } from '../domain/playtest/types';

/** A playtest as it may have been saved by any earlier version. */
export type StoredPlaytest = Omit<PlaytestState, 'rules' | 'players'> & {
  rules?: Partial<PlaytestState['rules']>;
  players: (Omit<PlaytestState['players'][number], 'values'> & { values?: Record<string, number> })[];
};

export function migratePlaytest(p: StoredPlaytest): PlaytestState {
  return {
    ...p,
    schemaVersion: PLAYTEST_SCHEMA_VERSION,
    // v1 → v2: table rules added. v1 kept counters through zones, which matches the default.
    rules: { ...DEFAULT_RULES, ...p.rules },
    // v2 → v3: player values added; none set yet means every value is at its start.
    players: p.players.map((pl) => ({ ...pl, values: pl.values ?? {} })),
  };
}

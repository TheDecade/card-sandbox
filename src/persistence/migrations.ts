// Upgrades stored data from older app versions. Used when loading and when importing backups.
import { DEFAULT_RULES, PLAYTEST_SCHEMA_VERSION, type PlaytestState } from '../domain/playtest/types';

/** A playtest as it may have been saved by any earlier version. */
export type StoredPlaytest = Omit<PlaytestState, 'rules' | 'players' | 'instances' | 'sharedDeck'> & {
  instances: Record<
    string,
    Omit<PlaytestState['instances'][string], 'bound' | 'shared'> & { bound?: boolean; shared?: boolean }
  >;
  sharedDeck?: string[] | null;
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
    // v3 → v4: bound instances added; v4 → v5: shared deck added. Older games have neither.
    instances: Object.fromEntries(
      Object.entries(p.instances).map(([id, i]) => [id, { ...i, bound: i.bound ?? false, shared: i.shared ?? false }]),
    ),
    sharedDeck: p.sharedDeck ?? null,
  };
}

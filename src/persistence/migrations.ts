// Upgrades stored data from older app versions. Used when loading and when importing backups.
import { DEFAULT_RULES, PLAYTEST_SCHEMA_VERSION, type PlaytestState } from '../domain/playtest/types';

/** A playtest as it may have been saved by any earlier version. */
type StoredInstance = Omit<PlaytestState['instances'][string], 'bound' | 'shared' | 'token'> & {
  bound?: boolean;
  shared?: boolean;
  token?: boolean;
};
type StoredPlayer = Omit<PlaytestState['players'][number], 'values' | 'markers'> & {
  values?: Record<string, number>;
  markers?: PlaytestState['players'][number]['markers'];
};
export type StoredPlaytest = Omit<PlaytestState, 'rules' | 'players' | 'instances' | 'sharedDeck' | 'sharedZone'> & {
  instances: Record<string, StoredInstance>;
  sharedDeck?: string[] | null;
  sharedZone?: string[];
  rules?: Partial<PlaytestState['rules']>;
  players: StoredPlayer[];
};

export function migratePlaytest(p: StoredPlaytest): PlaytestState {
  return {
    ...p,
    schemaVersion: PLAYTEST_SCHEMA_VERSION,
    // v1 → v2: table rules added. v1 kept counters through zones, which matches the default.
    rules: { ...DEFAULT_RULES, ...p.rules },
    // v2 → v3: player values added; none set yet means every value is at its start.
    // v5 → v6: counters on the table added.
    players: p.players.map((pl) => ({ ...pl, values: pl.values ?? {}, markers: pl.markers ?? [] })),
    // v3 → v4: bound instances; v4 → v5: shared deck; v5 → v6: tokens. Older games have none.
    instances: Object.fromEntries(
      Object.entries(p.instances).map(([id, i]) => [
        id,
        { ...i, bound: i.bound ?? false, shared: i.shared ?? false, token: i.token ?? false },
      ]),
    ),
    sharedDeck: p.sharedDeck ?? null,
    sharedZone: p.sharedZone ?? [], // v5 → v6
  };
}

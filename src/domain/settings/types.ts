export const SETTINGS_SCHEMA_VERSION = 1;
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4; // raising this is all it takes to support more players

export interface Settings {
  schemaVersion: number;
  playerCount: number;
  countersPersist: boolean; // counters stay on cards when they change zone
  lastBackupAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  playerCount: 2,
  countersPersist: true,
  lastBackupAt: null,
};

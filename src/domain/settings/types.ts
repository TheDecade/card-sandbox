export const SETTINGS_SCHEMA_VERSION = 1;
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4; // raising this is all it takes to support more players
export const MAX_PLAYER_VALUES = 6; // what fits in the slot under the deck

/** A value every player has, like life or poison. Defined in Options; each player has their own number. */
export interface PlayerValueDef {
  id: string;
  name: string;
  start: number; // value at the start of a playtest (and after a reset)
}

export interface Settings {
  schemaVersion: number;
  playerCount: number;
  countersPersist: boolean; // counters stay on cards when they change zone
  playerValues: PlayerValueDef[];
  lastBackupAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  playerCount: 2,
  countersPersist: true,
  playerValues: [{ id: 'life', name: 'Life', start: 20 }],
  lastBackupAt: null,
};

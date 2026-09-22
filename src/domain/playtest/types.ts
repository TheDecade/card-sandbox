import type { CardId } from '../cards/types';
import type { CounterColorId } from '../counters/colors';

export const PLAYTEST_SCHEMA_VERSION = 5; // 2: rules; 3: player values; 4: bound instances; 5: shared deck

export type InstanceId = string;
export type PlayerId = number; // 0-based index; shown as "Player N+1"
/** ownerId of a card lying in the shared deck: it belongs to no player until someone takes it. */
export const SHARED_OWNER = -1;
export type ZoneId = 'deck' | 'hand' | 'canvas' | 'graveyard' | 'exile';
export const ZONE_IDS: readonly ZoneId[] = ['deck', 'hand', 'canvas', 'graveyard', 'exile'];

/** Normalized position of a card's centre inside the canvas (0..1), so it survives rotation. */
export interface Vec2 {
  x: number;
  y: number;
}

/** One physical copy of a card in a playtest. */
export interface CardInstance {
  id: InstanceId;
  definitionId: CardId; // edits to the definition show up live on the table
  ownerId: PlayerId; // SHARED_OWNER while in the shared deck
  zone: ZoneId; // mirrors which PlayerState.zones array (or the shared deck) holds it
  position: Vec2 | null; // only on the canvas
  faceUp: boolean;
  tapped: boolean;
  counters: Partial<Record<CounterColorId, number>>;
  /** The copy of a player-bound card that belongs on its player's table (see CardDefinition.boundPlayer). */
  bound: boolean;
  /** A card of the shared deck: its "deck" is always the shared deck, never a player's. */
  shared: boolean;
}

export interface PlayerState {
  id: PlayerId;
  // Ordered ids per zone: the source of truth for membership AND order.
  // deck[0] = top; canvas order = stacking order (last on top); hand = left to right.
  zones: Record<ZoneId, InstanceId[]>;
  // Player values (life, poison, …) by PlayerValueDef id. Missing = the value's starting number,
  // so values added in Options mid-game simply start at their default.
  values: Record<string, number>;
}

/** Table rules that can change while a playtest runs. */
export interface PlaytestRules {
  /** On: counters stay on a card whatever zone it moves to. Off: removed when it changes zone. */
  countersPersist: boolean;
}

export const DEFAULT_RULES: PlaytestRules = { countersPersist: true };

export interface PlaytestState {
  schemaVersion: number;
  id: string;
  createdAt: number;
  rules: PlaytestRules;
  players: PlayerState[];
  instances: Record<InstanceId, CardInstance>;
  /** One deck every player draws from ([0] = top), or null when this playtest has none. */
  sharedDeck: InstanceId[] | null;
  currentPlayer: PlayerId;
}

export const emptyZones = (): Record<ZoneId, InstanceId[]> => ({
  deck: [],
  hand: [],
  canvas: [],
  graveyard: [],
  exile: [],
});

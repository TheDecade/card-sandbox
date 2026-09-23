import type { CardId } from '../cards/types';
import type { CounterColorId } from '../counters/colors';

// 2: rules; 3: player values; 4: bound instances; 5: shared deck; 6: shared zone, tokens, table counters
export const PLAYTEST_SCHEMA_VERSION = 6;

export type InstanceId = string;
export type PlayerId = number; // 0-based index; shown as "Player N+1"
/** ownerId of a card lying in the shared deck: it belongs to no player until someone takes it. */
export const SHARED_OWNER = -1;
/** Zones every player has. */
export type PlayerZoneId = 'deck' | 'hand' | 'canvas' | 'graveyard' | 'exile';
export const ZONE_IDS: readonly PlayerZoneId[] = ['deck', 'hand', 'canvas', 'graveyard', 'exile'];
/** Every zone a card can be in: a player's zones, or the shared zone next to the shared deck. */
export type ZoneId = PlayerZoneId | 'sharedZone';
export const SHARED_ZONE_SIZE = 4;

/** Normalized position of a card's centre inside the canvas (0..1), so it survives rotation. */
export interface Vec2 {
  x: number;
  y: number;
}

/** One physical copy of a card in a playtest. */
export interface CardInstance {
  id: InstanceId;
  definitionId: CardId; // edits to the definition show up live on the table
  // SHARED_OWNER while a shared card is in the shared deck or shared zone. Other cards in the
  // shared zone keep their owner: only they can take them back.
  ownerId: PlayerId;
  zone: ZoneId; // mirrors which list holds it: PlayerState.zones, the shared deck or the shared zone
  position: Vec2 | null; // only on the canvas
  faceUp: boolean;
  tapped: boolean;
  counters: Partial<Record<CounterColorId, number>>;
  /** The copy placed on a table at the start (see CardDefinition.startingPlayer). It may move away. */
  starter: boolean;
  /** A card of the shared deck: its "deck" is always the shared deck, never a player's. */
  shared: boolean;
  /** Created on the table (a token card, or a custom one); never goes into a deck. */
  token: boolean;
  /** Custom token: its only text. Such an instance has no card definition (definitionId ''). */
  tokenText?: string;
}

/** A loose counter lying on a player's table (not on a card). */
export interface CanvasMarker {
  id: string;
  color: CounterColorId;
  position: Vec2;
}

export interface PlayerState {
  id: PlayerId;
  // Ordered ids per zone: the source of truth for membership AND order.
  // deck[0] = top; canvas order = stacking order (last on top); hand = left to right.
  zones: Record<PlayerZoneId, InstanceId[]>;
  // Player values (life, poison, …) by PlayerValueDef id. Missing = the value's starting number,
  // so values added in Options mid-game simply start at their default.
  values: Record<string, number>;
  markers: CanvasMarker[]; // loose counters on the table, last on top
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
  /** Up to SHARED_ZONE_SIZE face-up cards everyone sees, left to right. */
  sharedZone: InstanceId[];
  currentPlayer: PlayerId;
}

export const emptyZones = (): Record<PlayerZoneId, InstanceId[]> => ({
  deck: [],
  hand: [],
  canvas: [],
  graveyard: [],
  exile: [],
});

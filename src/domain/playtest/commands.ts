import type { CounterColorId } from '../counters/colors';
import type { CanvasMarker, CardInstance, InstanceId, PlayerId, PlayerState, PlaytestRules, Vec2 } from './types';

export type ZoneTarget =
  | { zone: 'canvas'; position: Vec2 }
  | { zone: 'hand'; index?: number } // insertion index after removal from the old zone; default = end
  | { zone: 'deck'; placement: 'top' | 'bottom' }
  | { zone: 'graveyard' | 'exile' }
  | { zone: 'sharedZone' }; // at the end; refused when full

/**
 * Every change to a playtest is one of these. Randomness is decided before a command is created
 * (e.g. the shuffled order travels inside setDeckOrder), so applying commands is deterministic —
 * the basis for future undo/redo, replays and networked play.
 */
export type PlaytestCommand =
  // Within the owner's zones, or to/from the shared zone. A shared card's deck is the shared deck;
  // one taken from the shared deck or zone goes to playerId (default: the current player). Other
  // cards only ever go back to their owner; tokens never go into a deck.
  | { type: 'moveCard'; instanceId: InstanceId; to: ZoneTarget; playerId?: PlayerId }
  | { type: 'moveOnCanvas'; instanceId: InstanceId; position: Vec2 } // also brings to front
  | { type: 'toggleTapped'; instanceId: InstanceId }
  | { type: 'changeCounters'; instanceId: InstanceId; color: CounterColorId; delta: number }
  | { type: 'setDeckOrder'; playerId: PlayerId; order: InstanceId[] }
  | { type: 'setSharedDeckOrder'; order: InstanceId[] }
  | { type: 'refreshSharedDeck'; instances: CardInstance[] } // replaces the shared deck's cards, top first
  | { type: 'selectPlayer'; playerId: PlayerId }
  | { type: 'addPlayers'; players: PlayerState[]; instances: CardInstance[] }
  | { type: 'removePlayersFrom'; playerId: PlayerId }
  | { type: 'setRules'; rules: Partial<PlaytestRules> }
  | { type: 'setPlayerValue'; playerId: PlayerId; valueId: string; value: number }
  // Player-bound cards changed mid-game:
  | { type: 'addInstance'; instance: CardInstance } // placed in its zone (canvas: on top); also tokens
  | { type: 'removeInstance'; instanceId: InstanceId }
  | { type: 'unbindInstance'; instanceId: InstanceId } // becomes an ordinary card where it is
  | { type: 'addMarker'; playerId: PlayerId; marker: CanvasMarker }
  | { type: 'moveMarker'; playerId: PlayerId; markerId: string; position: Vec2 } // also brings to front
  | { type: 'removeMarker'; playerId: PlayerId; markerId: string };

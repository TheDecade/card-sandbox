import type { CounterColorId } from '../counters/colors';
import type { CardInstance, InstanceId, PlayerId, PlayerState, PlaytestRules, Vec2 } from './types';

export type ZoneTarget =
  | { zone: 'canvas'; position: Vec2 }
  | { zone: 'hand'; index?: number } // insertion index after removal from the old zone; default = end
  | { zone: 'deck'; placement: 'top' | 'bottom' }
  | { zone: 'graveyard' | 'exile' };

/**
 * Every change to a playtest is one of these. Randomness is decided before a command is created
 * (e.g. the shuffled order travels inside setDeckOrder), so applying commands is deterministic —
 * the basis for future undo/redo, replays and networked play.
 */
export type PlaytestCommand =
  // Within the owner's zones. A shared card's deck is the shared deck; one taken from the shared
  // deck goes to playerId (default: the current player).
  | { type: 'moveCard'; instanceId: InstanceId; to: ZoneTarget; playerId?: PlayerId }
  | { type: 'moveOnCanvas'; instanceId: InstanceId; position: Vec2 } // also brings to front
  | { type: 'toggleTapped'; instanceId: InstanceId }
  | { type: 'changeCounters'; instanceId: InstanceId; color: CounterColorId; delta: number }
  | { type: 'setDeckOrder'; playerId: PlayerId; order: InstanceId[] }
  | { type: 'setSharedDeckOrder'; order: InstanceId[] }
  | { type: 'selectPlayer'; playerId: PlayerId }
  | { type: 'addPlayers'; players: PlayerState[]; instances: CardInstance[] }
  | { type: 'removePlayersFrom'; playerId: PlayerId }
  | { type: 'setRules'; rules: Partial<PlaytestRules> }
  | { type: 'setPlayerValue'; playerId: PlayerId; valueId: string; value: number }
  // Player-bound cards changed mid-game:
  | { type: 'addInstance'; instance: CardInstance } // placed in its zone (canvas: on top)
  | { type: 'removeInstance'; instanceId: InstanceId }
  | { type: 'unbindInstance'; instanceId: InstanceId }; // becomes an ordinary card where it is

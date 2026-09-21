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
  | { type: 'moveCard'; instanceId: InstanceId; to: ZoneTarget } // within the owner's zones
  | { type: 'moveOnCanvas'; instanceId: InstanceId; position: Vec2 } // also brings to front
  | { type: 'toggleTapped'; instanceId: InstanceId }
  | { type: 'changeCounters'; instanceId: InstanceId; color: CounterColorId; delta: number }
  | { type: 'setDeckOrder'; playerId: PlayerId; order: InstanceId[] }
  | { type: 'selectPlayer'; playerId: PlayerId }
  | { type: 'addPlayers'; players: PlayerState[]; instances: CardInstance[] }
  | { type: 'removePlayersFrom'; playerId: PlayerId }
  | { type: 'setRules'; rules: Partial<PlaytestRules> };

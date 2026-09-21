import { newId } from '../../lib/id';
import { randomInt, shuffled, type RandomInt } from '../../lib/random';
import type { CardDefinition } from '../cards/types';
import type { PlaytestCommand } from './commands';
import {
  emptyZones,
  PLAYTEST_SCHEMA_VERSION,
  type CardInstance,
  type PlayerId,
  type PlayerState,
  type PlaytestState,
} from './types';

export interface SetupDeps {
  rand?: RandomInt;
  makeId?: () => string;
}

/** A player with one face-down copy of every enabled card, independently shuffled. */
export function createPlayer(
  playerId: PlayerId,
  cards: readonly CardDefinition[],
  { rand = randomInt, makeId = newId }: SetupDeps = {},
): { player: PlayerState; instances: CardInstance[] } {
  const instances: CardInstance[] = cards
    .filter((c) => c.enabled)
    .map((def) => ({
      id: makeId(),
      definitionId: def.id,
      ownerId: playerId,
      zone: 'deck',
      position: null,
      faceUp: false,
      tapped: false,
      counters: {},
    }));
  const zones = emptyZones();
  zones.deck = shuffled(
    instances.map((i) => i.id),
    rand,
  );
  return { player: { id: playerId, zones }, instances };
}

/** A fresh playtest. Reset Playtest = replacing the current state with this. */
export function createPlaytest(
  playerCount: number,
  cards: readonly CardDefinition[],
  deps: SetupDeps = {},
): PlaytestState {
  const created = Array.from({ length: playerCount }, (_, p) => createPlayer(p, cards, deps));
  return {
    schemaVersion: PLAYTEST_SCHEMA_VERSION,
    id: (deps.makeId ?? newId)(),
    createdAt: Date.now(),
    players: created.map((c) => c.player),
    instances: Object.fromEntries(created.flatMap((c) => c.instances).map((i) => [i.id, i])),
    currentPlayer: 0,
  };
}

/** Commands that change the number of players of a running playtest (existing players untouched). */
export function playerCountCommands(
  state: PlaytestState,
  count: number,
  cards: readonly CardDefinition[],
  deps: SetupDeps = {},
): PlaytestCommand[] {
  const current = state.players.length;
  if (count < current) return [{ type: 'removePlayersFrom', playerId: count }];
  if (count > current) {
    const created = Array.from({ length: count - current }, (_, i) => createPlayer(current + i, cards, deps));
    return [
      {
        type: 'addPlayers',
        players: created.map((c) => c.player),
        instances: created.flatMap((c) => c.instances),
      },
    ];
  }
  return [];
}

/** Command that shuffles the remaining cards of a player's deck. */
export function shuffleDeckCommand(
  state: PlaytestState,
  playerId: PlayerId,
  rand: RandomInt = randomInt,
): PlaytestCommand {
  const deck = state.players[playerId]?.zones.deck ?? [];
  return { type: 'setDeckOrder', playerId, order: shuffled(deck, rand) };
}

import { newId } from '../../lib/id';
import { randomInt, shuffled, type RandomInt } from '../../lib/random';
import type { CardDefinition } from '../cards/types';
import type { PlaytestCommand } from './commands';
import {
  DEFAULT_RULES,
  emptyZones,
  PLAYTEST_SCHEMA_VERSION,
  SHARED_OWNER,
  type PlaytestRules,
  type Vec2,
  type CardInstance,
  type PlayerId,
  type PlayerState,
  type PlaytestState,
} from './types';

export interface SetupDeps {
  rand?: RandomInt;
  makeId?: () => string;
  rules?: PlaytestRules;
  /** The playtest has a shared deck: cards marked "shared deck" go there instead of the players' decks. */
  sharedDeck?: boolean;
}

/**
 * Enabled, unbound cards, split into those for the players' decks and those for the shared deck.
 * Shared-deck cards never go into the players' decks: with the shared deck off they are left out.
 */
const deckCards = (cards: readonly CardDefinition[], sharedDeck: boolean) => {
  const unbound = cards.filter((c) => c.enabled && c.boundPlayer === 0);
  return {
    own: unbound.filter((c) => !c.shared),
    shared: sharedDeck ? unbound.filter((c) => c.shared) : [],
  };
};

const faceDown = (def: CardDefinition, ownerId: PlayerId, id: string, shared: boolean): CardInstance => ({
  id,
  definitionId: def.id,
  ownerId,
  zone: 'deck',
  position: null,
  faceUp: false,
  tapped: false,
  counters: {},
  bound: false,
  shared,
});

/** Where bound cards are laid out when a playtest starts: a row across the table. */
export const boundStartPosition = (index: number): Vec2 => ({
  x: 0.3 + (index % 6) * 0.11,
  y: 0.32 + Math.floor(index / 6) * 0.3,
});

/** Where a card bound mid-game appears: near the centre, fanned out so cards don't hide each other. */
export const boundLatePosition = (canvasCount: number): Vec2 => {
  const k = canvasCount % 6;
  return { x: 0.45 + k * 0.03, y: 0.45 + k * 0.03 };
};

function boundInstance(def: CardDefinition, ownerId: PlayerId, position: Vec2, id: string): CardInstance {
  return {
    id,
    definitionId: def.id,
    ownerId,
    zone: 'canvas',
    position,
    faceUp: true,
    tapped: false,
    counters: {},
    bound: true,
    shared: false,
  };
}

/**
 * A player's starting cards: one face-down copy of every enabled, unbound, non-shared card,
 * independently shuffled, plus the enabled cards bound to this player, face-up on their table.
 */
export function createPlayer(
  playerId: PlayerId,
  cards: readonly CardDefinition[],
  { rand = randomInt, makeId = newId, sharedDeck = false }: SetupDeps = {},
): { player: PlayerState; instances: CardInstance[] } {
  const deck = deckCards(cards, sharedDeck).own.map((def) => faceDown(def, playerId, makeId(), false));
  const boundCards = cards
    .filter((c) => c.enabled && c.boundPlayer === playerId + 1)
    .map((def, i) => boundInstance(def, playerId, boundStartPosition(i), makeId()));

  const zones = emptyZones();
  zones.deck = shuffled(
    deck.map((i) => i.id),
    rand,
  );
  zones.canvas = boundCards.map((i) => i.id);
  return { player: { id: playerId, zones, values: {} }, instances: [...deck, ...boundCards] };
}

/**
 * Commands that bring a running playtest in line with the cards' player bindings after cards were
 * edited: a bound card gets its copy on its player's table (moving it there from another player if
 * the binding changed); an unbound card's copy stays where it is as an ordinary card.
 * Disabled cards and copies already in decks or hands are left alone.
 */
export function syncBoundCardCommands(
  state: PlaytestState,
  cards: readonly CardDefinition[],
  makeId: () => string = newId,
): PlaytestCommand[] {
  const boundByDef = new Map<string, CardInstance[]>();
  for (const inst of Object.values(state.instances)) {
    if (!inst.bound) continue;
    boundByDef.set(inst.definitionId, [...(boundByDef.get(inst.definitionId) ?? []), inst]);
  }

  const cmds: PlaytestCommand[] = [];
  const added = new Map<PlayerId, number>(); // to fan out several cards arriving on one table
  for (const card of cards) {
    const copies = boundByDef.get(card.id) ?? [];
    if (card.boundPlayer === 0) {
      for (const c of copies) cmds.push({ type: 'unbindInstance', instanceId: c.id });
      continue;
    }
    if (!card.enabled) continue;
    const owner = card.boundPlayer - 1;
    const keep = copies.find((c) => c.ownerId === owner);
    for (const c of copies) if (c !== keep) cmds.push({ type: 'removeInstance', instanceId: c.id });
    const player = state.players[owner];
    if (!keep && player) {
      const n = added.get(owner) ?? 0;
      added.set(owner, n + 1);
      const position = boundLatePosition(player.zones.canvas.length + n);
      cmds.push({ type: 'addInstance', instance: boundInstance(card, owner, position, makeId()) });
    }
  }
  return cmds;
}

/** A fresh playtest. Reset Playtest = replacing the current state with this. */
export function createPlaytest(
  playerCount: number,
  cards: readonly CardDefinition[],
  deps: SetupDeps = {},
): PlaytestState {
  const created = Array.from({ length: playerCount }, (_, p) => createPlayer(p, cards, deps));
  const makeId = deps.makeId ?? newId;
  const shared = deckCards(cards, !!deps.sharedDeck).shared.map((def) => faceDown(def, SHARED_OWNER, makeId(), true));
  return {
    schemaVersion: PLAYTEST_SCHEMA_VERSION,
    id: makeId(),
    createdAt: Date.now(),
    rules: { ...(deps.rules ?? DEFAULT_RULES) },
    players: created.map((c) => c.player),
    instances: Object.fromEntries([...created.flatMap((c) => c.instances), ...shared].map((i) => [i.id, i])),
    sharedDeck: deps.sharedDeck
      ? shuffled(
          shared.map((i) => i.id),
          deps.rand ?? randomInt,
        )
      : null,
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
  deps = { ...deps, sharedDeck: state.sharedDeck !== null };
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

/** Command that shuffles the remaining cards of the shared deck. */
export function shuffleSharedDeckCommand(state: PlaytestState, rand: RandomInt = randomInt): PlaytestCommand {
  return { type: 'setSharedDeckOrder', order: shuffled(state.sharedDeck ?? [], rand) };
}

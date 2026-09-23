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
  /** N when the playtest has a shared deck: one card for each event number 1..N. Omitted: no shared deck. */
  sharedDeckEvents?: number;
}

const dealt = (cards: readonly CardDefinition[]) =>
  cards.filter((c) => c.enabled && c.startingPlayer === 0 && !c.isToken);
/** Cards for the players' own decks. Shared-deck cards never go there, even with the shared deck off. */
const ownDeckCards = (cards: readonly CardDefinition[]) => dealt(cards).filter((c) => !c.shared);
/** Candidates for the shared deck, by event number (numbers above N are left out). */
function sharedCandidates(cards: readonly CardDefinition[], events: number): Map<number, CardDefinition[]> {
  const byEvent = new Map<number, CardDefinition[]>();
  for (const c of dealt(cards)) {
    if (!c.shared || c.eventNumber < 1 || c.eventNumber > events) continue;
    byEvent.set(c.eventNumber, [...(byEvent.get(c.eventNumber) ?? []), c]);
  }
  return byEvent;
}
const pick = <T>(items: readonly T[], rand: RandomInt): T | undefined => items[rand(items.length)];

/** The shared deck's cards, top first: one random card per event number 1..N (numbers without cards are skipped). */
function dealSharedDeck(cards: readonly CardDefinition[], events: number, rand: RandomInt): CardDefinition[] {
  const byEvent = sharedCandidates(cards, events);
  return Array.from({ length: events }, (_, i) => pick(byEvent.get(i + 1) ?? [], rand)).filter(
    (c): c is CardDefinition => !!c,
  );
}

const faceDown = (def: CardDefinition, ownerId: PlayerId, id: string, shared: boolean): CardInstance => ({
  id,
  definitionId: def.id,
  ownerId,
  zone: 'deck',
  position: null,
  faceUp: false,
  tapped: false,
  counters: {},
  starter: false,
  shared,
  token: false,
});

/** A token placed on a player's table: a copy of a token card, or a custom one with just a text. */
export function tokenInstance(
  ownerId: PlayerId,
  position: Vec2,
  from: { definitionId: string } | { text: string },
  id: string = newId(),
): CardInstance {
  return {
    id,
    definitionId: 'definitionId' in from ? from.definitionId : '',
    ownerId,
    zone: 'canvas',
    position,
    faceUp: true,
    tapped: false,
    counters: {},
    starter: false,
    shared: false,
    token: true,
    ...('text' in from ? { tokenText: from.text } : {}),
  };
}

/** Where the starting cards are laid out when a playtest starts: a row across the table. */
export const startPosition = (index: number): Vec2 => ({
  x: 0.3 + (index % 6) * 0.11,
  y: 0.32 + Math.floor(index / 6) * 0.3,
});

/** Where a card arriving mid-game appears: near the centre, fanned out so cards don't hide each other. */
export const latePosition = (canvasCount: number): Vec2 => {
  const k = canvasCount % 6;
  return { x: 0.45 + k * 0.03, y: 0.45 + k * 0.03 };
};

function starterInstance(def: CardDefinition, ownerId: PlayerId, position: Vec2, id: string): CardInstance {
  return {
    id,
    definitionId: def.id,
    ownerId,
    zone: 'canvas',
    position,
    faceUp: true,
    tapped: false,
    counters: {},
    starter: true,
    shared: false,
    token: false,
  };
}

/**
 * A player's starting cards: one face-down copy of every enabled deck card, independently shuffled,
 * plus the enabled cards whose starting table is this player's, face-up on it.
 */
export function createPlayer(
  playerId: PlayerId,
  cards: readonly CardDefinition[],
  { rand = randomInt, makeId = newId }: SetupDeps = {},
): { player: PlayerState; instances: CardInstance[] } {
  const deck = ownDeckCards(cards).map((def) => faceDown(def, playerId, makeId(), false));
  const starterCards = cards
    .filter((c) => c.enabled && !c.isToken && c.startingPlayer === playerId + 1)
    .map((def, i) => starterInstance(def, playerId, startPosition(i), makeId()));

  const zones = emptyZones();
  zones.deck = shuffled(
    deck.map((i) => i.id),
    rand,
  );
  zones.canvas = starterCards.map((i) => i.id);
  return { player: { id: playerId, zones, values: {}, markers: [] }, instances: [...deck, ...starterCards] };
}

/**
 * Commands that bring a running playtest in line with the cards' starting tables after cards were
 * edited: a card that gained a starting table and has no copy in the game yet gets one there; a card
 * that lost it keeps its copy as an ordinary card. Copies already in play stay where they are — the
 * starting table only says where a card begins, and players may hand it around afterwards.
 */
export function syncStartingCardsCommands(
  state: PlaytestState,
  cards: readonly CardDefinition[],
  makeId: () => string = newId,
): PlaytestCommand[] {
  const startersByDef = new Map<string, CardInstance[]>();
  for (const inst of Object.values(state.instances)) {
    if (!inst.starter) continue;
    startersByDef.set(inst.definitionId, [...(startersByDef.get(inst.definitionId) ?? []), inst]);
  }

  const cmds: PlaytestCommand[] = [];
  const added = new Map<PlayerId, number>(); // to fan out several cards arriving on one table
  for (const card of cards) {
    const copies = startersByDef.get(card.id) ?? [];
    if (card.startingPlayer === 0 || card.isToken) {
      for (const c of copies) cmds.push({ type: 'clearStarter', instanceId: c.id });
      continue;
    }
    if (!card.enabled) continue;
    const owner = card.startingPlayer - 1;
    // A copy is already in the game, wherever it has been moved to: keep it, drop any duplicate.
    const [keep, ...extra] = copies;
    for (const c of extra) cmds.push({ type: 'removeInstance', instanceId: c.id });
    const player = state.players[owner];
    if (!keep && player) {
      const n = added.get(owner) ?? 0;
      added.set(owner, n + 1);
      const position = latePosition(player.zones.canvas.length + n);
      cmds.push({ type: 'addInstance', instance: starterInstance(card, owner, position, makeId()) });
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
  const rand = deps.rand ?? randomInt;
  const events = deps.sharedDeckEvents;
  const shared = events ? dealSharedDeck(cards, events, rand).map((def) => faceDown(def, SHARED_OWNER, makeId(), true)) : [];
  return {
    schemaVersion: PLAYTEST_SCHEMA_VERSION,
    id: makeId(),
    createdAt: Date.now(),
    rules: { ...(deps.rules ?? DEFAULT_RULES) },
    players: created.map((c) => c.player),
    instances: Object.fromEntries([...created.flatMap((c) => c.instances), ...shared].map((i) => [i.id, i])),
    sharedDeck: events ? shared.map((i) => i.id) : null,
    sharedZone: [],
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

/**
 * Command that swaps every card still in the shared deck for another random card with the same event
 * number, dealt in event order (1 on top). Cards the players hold are never dealt again, and a card
 * only stays when its number has no other candidate.
 */
export function refreshSharedDeckCommand(
  state: PlaytestState,
  cards: readonly CardDefinition[],
  events: number,
  { rand = randomInt, makeId = newId }: SetupDeps = {},
): PlaytestCommand | null {
  const deck = state.sharedDeck;
  if (!deck) return null;
  const defs = new Map(cards.map((c) => [c.id, c]));
  const current = new Map<number, Set<string>>(); // event number → cards now in the deck
  for (const id of deck) {
    const def = defs.get(state.instances[id]?.definitionId ?? '');
    if (!def) continue;
    current.set(def.eventNumber, (current.get(def.eventNumber) ?? new Set()).add(def.id));
  }
  const inDeck = new Set(deck);
  const held = new Set(
    Object.values(state.instances)
      .filter((i) => i.shared && !inDeck.has(i.id))
      .map((i) => i.definitionId),
  );
  const byEvent = sharedCandidates(cards, events);
  const instances: CardInstance[] = [];
  for (const n of [...current.keys()].sort((a, b) => a - b)) {
    const free = (byEvent.get(n) ?? []).filter((c) => !held.has(c.id));
    const others = free.filter((c) => !current.get(n)!.has(c.id));
    const def = pick(others.length ? others : free, rand);
    if (def) instances.push(faceDown(def, SHARED_OWNER, makeId(), true));
  }
  return { type: 'refreshSharedDeck', instances };
}

/** Command that shuffles the remaining cards of the shared deck. */
export function shuffleSharedDeckCommand(state: PlaytestState, rand: RandomInt = randomInt): PlaytestCommand {
  return { type: 'setSharedDeckOrder', order: shuffled(state.sharedDeck ?? [], rand) };
}

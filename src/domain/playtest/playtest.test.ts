import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { shuffled } from '../../lib/random';
import type { CardDefinition } from '../cards/types';
import type { PlaytestCommand, ZoneTarget } from './commands';
import { checkInvariants } from './invariants';
import { applyCommand } from './reducer';
import { repairPlaytest } from './repair';
import {
  createPlaytest,
  playerCountCommands,
  shuffleDeckCommand,
  shuffleSharedDeckCommand,
  syncBoundCardCommands,
} from './setup';
import { SHARED_OWNER, type PlaytestState } from './types';
import { viewCard } from './visibility';

function card(n: number, enabled = true, shared = false): CardDefinition {
  return {
    id: `def${n}`,
    name: `Card ${n}`,
    cost: String(n),
    type: '',
    description: '',
    imageId: null,
    enabled,
    boundPlayer: 0,
    shared,
    createdAt: n,
    updatedAt: n,
  };
}

const CARDS = [card(1), card(2), card(3), card(4, false), card(5)];

function idMaker() {
  let n = 0;
  return () => `i${++n}`;
}
const noShuffle = () => 0; // Fisher–Yates with j=0 is deterministic

function fresh(players = 2, countersPersist = true): PlaytestState {
  return createPlaytest(players, CARDS, { makeId: idMaker(), rand: noShuffle, rules: { countersPersist } });
}
const run = (s: PlaytestState, ...cmds: PlaytestCommand[]) => cmds.reduce(applyCommand, s);
const deckOf = (s: PlaytestState, p = 0) => s.players[p]!.zones.deck;

describe('createPlaytest', () => {
  it('gives each player one face-down copy of every enabled card', () => {
    const s = fresh(3);
    expect(s.players).toHaveLength(3);
    for (const p of s.players) {
      expect(p.zones.deck).toHaveLength(4); // card 4 is disabled
      const defs = p.zones.deck.map((id) => s.instances[id]!.definitionId).sort();
      expect(defs).toEqual(['def1', 'def2', 'def3', 'def5']);
      expect(p.zones.hand).toEqual([]);
      expect(p.zones.canvas).toEqual([]);
    }
    expect(Object.values(s.instances).every((i) => !i.faceUp && i.zone === 'deck')).toBe(true);
    expect(s.currentPlayer).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('shuffles every deck independently', () => {
    const s = createPlaytest(2, Array.from({ length: 40 }, (_, i) => card(i)));
    const defsOf = (p: number) => deckOf(s, p).map((id) => s.instances[id]!.definitionId);
    expect(defsOf(0)).not.toEqual(defsOf(1)); // 1 in 40! chance of a false failure
  });
});

describe('moveCard', () => {
  it('draws the top card to the hand face-up', () => {
    const s0 = fresh();
    const top = deckOf(s0)[0]!;
    const s = run(s0, { type: 'moveCard', instanceId: top, to: { zone: 'hand' } });
    expect(s.players[0]!.zones.hand).toEqual([top]);
    expect(deckOf(s)).not.toContain(top);
    expect(s.instances[top]).toMatchObject({ zone: 'hand', faceUp: true, position: null });
    expect(s0.instances[top]!.zone).toBe('deck'); // input untouched
  });

  it('places a card on the canvas at a clamped position', () => {
    const top = deckOf(fresh())[0]!;
    const s = run(fresh(), { type: 'moveCard', instanceId: top, to: { zone: 'canvas', position: { x: 1.4, y: 0.3 } } });
    expect(s.instances[top]!.position).toEqual({ x: 1, y: 0.3 });
    expect(s.players[0]!.zones.canvas).toEqual([top]);
  });

  it('puts a card on top or bottom of the deck face-down and untapped', () => {
    const s0 = fresh();
    const [a, b] = deckOf(s0);
    const s1 = run(
      s0,
      { type: 'moveCard', instanceId: a!, to: { zone: 'canvas', position: { x: 0.5, y: 0.5 } } },
      { type: 'toggleTapped', instanceId: a! },
      { type: 'changeCounters', instanceId: a!, color: 'red', delta: 3 },
      { type: 'moveCard', instanceId: a!, to: { zone: 'deck', placement: 'bottom' } },
    );
    expect(deckOf(s1).at(-1)).toBe(a);
    expect(s1.instances[a!]).toMatchObject({ faceUp: false, tapped: false, counters: { red: 3 }, position: null });
    // Hidden while in the deck: the counters can't be changed there.
    expect(run(s1, { type: 'changeCounters', instanceId: a!, color: 'red', delta: 1 })).toBe(s1);
    const s2 = run(s1, { type: 'moveCard', instanceId: b!, to: { zone: 'deck', placement: 'top' } });
    expect(deckOf(s2)[0]).toBe(b);
    expect(checkInvariants(s2)).toEqual([]);
  });

  it('keeps counters but untaps when a card goes to the graveyard', () => {
    const a = deckOf(fresh())[0]!;
    const s = run(
      fresh(),
      { type: 'moveCard', instanceId: a, to: { zone: 'canvas', position: { x: 0.5, y: 0.5 } } },
      { type: 'toggleTapped', instanceId: a },
      { type: 'changeCounters', instanceId: a, color: 'blue', delta: 2 },
      { type: 'moveCard', instanceId: a, to: { zone: 'graveyard' } },
    );
    expect(s.instances[a]).toMatchObject({ zone: 'graveyard', tapped: false, counters: { blue: 2 } });
  });

  it('inserts into the hand at an index', () => {
    const [a, b, c] = deckOf(fresh());
    const s = run(
      fresh(),
      { type: 'moveCard', instanceId: a!, to: { zone: 'hand' } },
      { type: 'moveCard', instanceId: b!, to: { zone: 'hand' } },
      { type: 'moveCard', instanceId: c!, to: { zone: 'hand', index: 1 } },
      { type: 'moveCard', instanceId: a!, to: { zone: 'hand', index: 99 } }, // reorder to the end
    );
    expect(s.players[0]!.zones.hand).toEqual([c, b, a]);
  });

  it('ignores unknown instances', () => {
    const s0 = fresh();
    expect(run(s0, { type: 'moveCard', instanceId: 'nope', to: { zone: 'hand' } })).toBe(s0);
  });
});

describe('counter persistence rule', () => {
  const withCounters = (persist: boolean) => {
    const s0 = fresh(2, persist);
    const [a, b] = deckOf(s0);
    const s = run(
      s0,
      { type: 'moveCard', instanceId: a!, to: { zone: 'canvas', position: { x: 0.5, y: 0.5 } } },
      { type: 'moveCard', instanceId: b!, to: { zone: 'hand' } },
      { type: 'changeCounters', instanceId: a!, color: 'red', delta: 2 },
      { type: 'changeCounters', instanceId: a!, color: 'p2', delta: 1 }, // player counter
      { type: 'changeCounters', instanceId: b!, color: 'blue', delta: 1 },
    );
    return { s, a: a!, b: b! };
  };

  it('on: counters follow the card through every zone, including the deck', () => {
    const { s, a } = withCounters(true);
    const moved = run(
      s,
      { type: 'moveCard', instanceId: a, to: { zone: 'graveyard' } },
      { type: 'moveCard', instanceId: a, to: { zone: 'deck', placement: 'top' } },
      { type: 'moveCard', instanceId: a, to: { zone: 'hand' } },
    );
    expect(moved.instances[a]!.counters).toEqual({ red: 2, p2: 1 });
  });

  it('off: counters are removed when the card changes zone, not when it moves within one', () => {
    const { s, a, b } = withCounters(false);
    const onTable = run(s, { type: 'moveOnCanvas', instanceId: a, position: { x: 0.1, y: 0.1 } });
    expect(onTable.instances[a]!.counters).toEqual({ red: 2, p2: 1 });
    const reordered = run(s, { type: 'moveCard', instanceId: b, to: { zone: 'hand', index: 0 } });
    expect(reordered.instances[b]!.counters).toEqual({ blue: 1 });
    const toHand = run(s, { type: 'moveCard', instanceId: a, to: { zone: 'hand' } });
    expect(toHand.instances[a]!.counters).toEqual({});
  });

  it('can be switched during a playtest', () => {
    const { s, a } = withCounters(true);
    const off = run(s, { type: 'setRules', rules: { countersPersist: false } });
    expect(off.rules.countersPersist).toBe(false);
    expect(off.instances[a]!.counters).toEqual({ red: 2, p2: 1 }); // existing counters untouched
    expect(run(off, { type: 'moveCard', instanceId: a, to: { zone: 'exile' } }).instances[a]!.counters).toEqual({});
  });
});

describe('player-bound cards', () => {
  const bound = (n: number, player: number, enabled = true) => ({ ...card(n, enabled), boundPlayer: player });
  const defsOn = (s: PlaytestState, p: number, zone: 'deck' | 'canvas') =>
    s.players[p]!.zones[zone].map((id) => s.instances[id]!.definitionId);

  it('start face-up on their player’s table and stay out of every deck', () => {
    const cards = [card(1), card(2), bound(7, 2), bound(8, 2), bound(9, 1, false), bound(10, 4)];
    const s = createPlaytest(2, cards, { makeId: idMaker(), rand: noShuffle });
    expect(defsOn(s, 0, 'canvas')).toEqual([]); // def9 is disabled
    expect(defsOn(s, 1, 'canvas')).toEqual(['def7', 'def8']);
    for (const p of [0, 1]) expect(defsOn(s, p, 'deck').sort()).toEqual(['def1', 'def2']);
    const onTable = s.players[1]!.zones.canvas.map((id) => s.instances[id]!);
    expect(onTable.every((i) => i.bound && i.faceUp && i.position !== null)).toBe(true);
    expect(onTable[0]!.position).not.toEqual(onTable[1]!.position);
    expect(checkInvariants(s)).toEqual([]);
    // def10 is bound to Player 4, who isn't in this game: it sits out until that player is added.
    const s4 = run(s, ...playerCountCommands(s, 4, cards, { makeId: idMaker2() }));
    expect(defsOn(s4, 3, 'canvas')).toEqual(['def10']);
  });

  it('mid-game: binding a card puts a copy on that player’s table', () => {
    const cards = [card(1), card(2)];
    const s0 = createPlaytest(2, cards, { makeId: idMaker(), rand: noShuffle });
    const edited = [card(1), { ...card(2), boundPlayer: 2 }];
    const s = run(s0, ...syncBoundCardCommands(s0, edited, idMaker2()));
    expect(defsOn(s, 1, 'canvas')).toEqual(['def2']);
    expect(defsOn(s, 1, 'deck').sort()).toEqual(['def1', 'def2']); // existing copies left alone
    expect(checkInvariants(s)).toEqual([]);
    expect(syncBoundCardCommands(s, edited)).toEqual([]); // already in line: nothing to do
  });

  it('mid-game: changing the player moves the bound copy; 0 leaves it as an ordinary card', () => {
    const cards = [card(1), bound(2, 1)];
    const s0 = createPlaytest(2, cards, { makeId: idMaker(), rand: noShuffle });
    const [copy] = s0.players[0]!.zones.canvas;
    const moved = run(s0, ...syncBoundCardCommands(s0, [card(1), bound(2, 2)], idMaker2()));
    expect(moved.instances[copy!]).toBeUndefined();
    expect(defsOn(moved, 0, 'canvas')).toEqual([]);
    expect(defsOn(moved, 1, 'canvas')).toEqual(['def2']);

    const unbound = run(moved, ...syncBoundCardCommands(moved, [card(1), card(2)]));
    const [kept] = unbound.players[1]!.zones.canvas;
    expect(unbound.instances[kept!]).toMatchObject({ bound: false, zone: 'canvas' });
    expect(checkInvariants(unbound)).toEqual([]);
  });

  it('mid-game: a bound copy that was moved (e.g. to the graveyard) is not duplicated', () => {
    const cards = [card(1), bound(2, 1)];
    const s0 = createPlaytest(1, cards, { makeId: idMaker(), rand: noShuffle });
    const [copy] = s0.players[0]!.zones.canvas;
    const s = run(s0, { type: 'moveCard', instanceId: copy!, to: { zone: 'graveyard' } });
    expect(syncBoundCardCommands(s, cards)).toEqual([]);
  });
});

describe('player values', () => {
  it('sets per-player values, as whole numbers that may go negative', () => {
    const s = run(
      fresh(2),
      { type: 'setPlayerValue', playerId: 0, valueId: 'life', value: 17 },
      { type: 'setPlayerValue', playerId: 1, valueId: 'life', value: -3.4 },
      { type: 'setPlayerValue', playerId: 1, valueId: 'poison', value: 2 },
    );
    expect(s.players[0]!.values).toEqual({ life: 17 });
    expect(s.players[1]!.values).toEqual({ life: -3, poison: 2 });
  });

  it('ignores unknown players and non-numbers', () => {
    const s0 = fresh(1);
    expect(run(s0, { type: 'setPlayerValue', playerId: 5, valueId: 'life', value: 1 })).toBe(s0);
    expect(run(s0, { type: 'setPlayerValue', playerId: 0, valueId: 'life', value: NaN })).toBe(s0);
  });

  it('gives new players no values yet (each value starts at its default)', () => {
    const s0 = fresh(1);
    const s = run(s0, ...playerCountCommands(s0, 2, CARDS, { makeId: idMaker2() }));
    expect(s.players[1]!.values).toEqual({});
  });
});

describe('tapping, counters, canvas moves', () => {
  const onCanvas = () => {
    const s0 = fresh();
    const [a, b] = deckOf(s0);
    const s = run(
      s0,
      { type: 'moveCard', instanceId: a!, to: { zone: 'canvas', position: { x: 0.2, y: 0.2 } } },
      { type: 'moveCard', instanceId: b!, to: { zone: 'canvas', position: { x: 0.4, y: 0.4 } } },
    );
    return { s, a: a!, b: b! };
  };

  it('toggles tapped only on the canvas', () => {
    const { s, a } = onCanvas();
    expect(run(s, { type: 'toggleTapped', instanceId: a }).instances[a]!.tapped).toBe(true);
    expect(run(s, { type: 'toggleTapped', instanceId: a }, { type: 'toggleTapped', instanceId: a }).instances[a]!.tapped).toBe(false);
    const inDeck = deckOf(s)[0]!;
    expect(run(s, { type: 'toggleTapped', instanceId: inDeck })).toBe(s);
  });

  it('adds and removes counters per color, never below zero', () => {
    const { s, a } = onCanvas();
    const s1 = run(
      s,
      { type: 'changeCounters', instanceId: a, color: 'red', delta: 3 },
      { type: 'changeCounters', instanceId: a, color: 'green', delta: 1 },
      { type: 'changeCounters', instanceId: a, color: 'red', delta: -5 },
    );
    expect(s1.instances[a]!.counters).toEqual({ green: 1 });
  });

  it('keeps counters per instance, not per card definition', () => {
    const s0 = fresh();
    const p0 = deckOf(s0, 0)[0]!;
    const sameDefOnP1 = deckOf(s0, 1).find((id) => s0.instances[id]!.definitionId === s0.instances[p0]!.definitionId)!;
    const s = run(
      s0,
      { type: 'moveCard', instanceId: p0, to: { zone: 'hand' } },
      { type: 'changeCounters', instanceId: p0, color: 'red', delta: 2 },
    );
    expect(s.instances[p0]!.counters).toEqual({ red: 2 });
    expect(s.instances[sameDefOnP1]!.counters).toEqual({});
  });

  it('moves on the canvas and brings the card to the front', () => {
    const { s, a, b } = onCanvas();
    const s1 = run(s, { type: 'moveOnCanvas', instanceId: a, position: { x: 0.9, y: 0.1 } });
    expect(s1.instances[a]!.position).toEqual({ x: 0.9, y: 0.1 });
    expect(s1.players[0]!.zones.canvas).toEqual([b, a]);
  });
});

describe('deck order, players', () => {
  it('applies a shuffle that keeps the same cards', () => {
    const s0 = fresh();
    const s = run(s0, shuffleDeckCommand(s0, 0, (n) => n - 1)); // "reverse-ish" deterministic rand
    expect([...deckOf(s)].sort()).toEqual([...deckOf(s0)].sort());
  });

  it('rejects a deck order with different cards', () => {
    const s0 = fresh();
    const bad = [...deckOf(s0).slice(1), 'intruder'];
    expect(run(s0, { type: 'setDeckOrder', playerId: 0, order: bad })).toBe(s0);
  });

  it('adds players with fresh decks and removes the highest ones', () => {
    const s0 = fresh(2);
    const s1 = run(s0, ...playerCountCommands(s0, 4, CARDS, { makeId: idMaker2(), rand: noShuffle }));
    expect(s1.players).toHaveLength(4);
    expect(deckOf(s1, 3)).toHaveLength(4);
    expect(checkInvariants(s1)).toEqual([]);

    const s2 = run(s1, { type: 'selectPlayer', playerId: 3 }, ...playerCountCommands(s1, 1, CARDS));
    expect(s2.players).toHaveLength(1);
    expect(s2.currentPlayer).toBe(0);
    expect(Object.values(s2.instances).every((i) => i.ownerId === 0)).toBe(true);
    expect(checkInvariants(s2)).toEqual([]);
  });

  it('never removes the last player', () => {
    const s0 = fresh(1);
    expect(run(s0, { type: 'removePlayersFrom', playerId: 0 })).toBe(s0);
  });
});

function idMaker2() {
  let n = 0;
  return () => `new${++n}`;
}

describe('visibility', () => {
  it('hides face-down cards and reveals face-up ones', () => {
    const s0 = fresh();
    const top = deckOf(s0)[0]!;
    const get = (id: string) => CARDS.find((c) => c.id === id);
    expect(viewCard(s0, get, top)).toEqual({ kind: 'hidden', instanceId: top });
    const s = run(s0, { type: 'moveCard', instanceId: top, to: { zone: 'hand' } });
    const v = viewCard(s, get, top);
    expect(v.kind).toBe('revealed');
    if (v.kind === 'revealed') expect(v.def.id).toBe(s.instances[top]!.definitionId);
  });
});

describe('shuffled', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffled(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is roughly uniform', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[shuffled([0, 1, 2])[0]!]!++;
    for (const c of counts) expect(c).toBeGreaterThan(850); // expected 1000 each
  });
});

describe('fuzz: random command sequences keep the state consistent', () => {
  const targetArb: fc.Arbitrary<ZoneTarget> = fc.oneof(
    fc.record({ zone: fc.constant('canvas' as const), position: fc.record({ x: fc.double({ min: -1, max: 2, noNaN: true }), y: fc.double({ min: -1, max: 2, noNaN: true }) }) }),
    fc.record({ zone: fc.constant('hand' as const), index: fc.option(fc.nat(10), { nil: undefined }) }),
    fc.record({ zone: fc.constant('deck' as const), placement: fc.constantFrom('top' as const, 'bottom' as const) }),
    fc.record({ zone: fc.constantFrom('graveyard' as const, 'exile' as const) }),
  );
  // Commands refer to instances by index; mapped to real ids when applied.
  const stepArb = fc.oneof(
    fc.record({ t: fc.constant('move' as const), i: fc.nat(), to: targetArb }),
    fc.record({ t: fc.constant('tap' as const), i: fc.nat() }),
    fc.record({ t: fc.constant('counter' as const), i: fc.nat(), color: fc.constantFrom('red', 'blue'), delta: fc.integer({ min: -3, max: 3 }) }),
    fc.record({ t: fc.constant('canvas' as const), i: fc.nat(), x: fc.double({ min: 0, max: 1, noNaN: true }) }),
    fc.record({ t: fc.constant('shuffle' as const), p: fc.nat(2) }),
    fc.record({ t: fc.constant('players' as const), n: fc.integer({ min: 1, max: 4 }) }),
    fc.record({ t: fc.constant('select' as const), p: fc.nat(4) }),
    fc.record({ t: fc.constant('rules' as const), on: fc.boolean() }),
    fc.record({ t: fc.constant('value' as const), p: fc.nat(4), v: fc.integer({ min: -50, max: 50 }) }),
  );

  it('holds all invariants and never loses or duplicates a card', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 200 }), (steps) => {
        let s = fresh(2);
        const makeId = idMaker2();
        for (const step of steps) {
          const ids = Object.keys(s.instances);
          const id = ids[('i' in step ? step.i : 0) % Math.max(1, ids.length)] ?? 'none';
          let cmds: PlaytestCommand[];
          switch (step.t) {
            case 'move': cmds = [{ type: 'moveCard', instanceId: id, to: step.to }]; break;
            case 'tap': cmds = [{ type: 'toggleTapped', instanceId: id }]; break;
            case 'counter': cmds = [{ type: 'changeCounters', instanceId: id, color: step.color, delta: step.delta }]; break;
            case 'canvas': cmds = [{ type: 'moveOnCanvas', instanceId: id, position: { x: step.x, y: step.x } }]; break;
            case 'shuffle': cmds = s.players[step.p] ? [shuffleDeckCommand(s, step.p)] : []; break;
            case 'players': cmds = playerCountCommands(s, step.n, CARDS, { makeId }); break;
            case 'select': cmds = [{ type: 'selectPlayer', playerId: step.p }]; break;
            case 'rules': cmds = [{ type: 'setRules', rules: { countersPersist: step.on } }]; break;
            case 'value': cmds = [{ type: 'setPlayerValue', playerId: step.p, valueId: 'life', value: step.v }]; break;
          }
          s = run(s, ...cmds);
          expect(checkInvariants(s)).toEqual([]);
          // Every player always owns exactly one copy of each enabled card.
          for (const p of s.players) {
            const owned = Object.values(s.instances).filter((i) => i.ownerId === p.id);
            expect(owned).toHaveLength(4);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('shared deck', () => {
  // Cards 1–3 go into every player's deck; 6 and 7 into the one shared deck.
  const SHARED_CARDS = [card(1), card(2), card(3), card(6, true, true), card(7, true, true), card(8, false, true)];
  const withShared = (players = 2, sharedDeck = true) =>
    createPlaytest(players, SHARED_CARDS, { makeId: idMaker(), rand: noShuffle, sharedDeck });
  const defsIn = (s: PlaytestState, ids: readonly string[]) => ids.map((id) => s.instances[id]!.definitionId).sort();

  it('puts shared cards only in the shared deck, one copy for everyone', () => {
    const s = withShared(3);
    expect(defsIn(s, s.sharedDeck!)).toEqual(['def6', 'def7']); // card 8 is disabled
    for (const p of s.players) expect(defsIn(s, p.zones.deck)).toEqual(['def1', 'def2', 'def3']);
    for (const id of s.sharedDeck!) expect(s.instances[id]).toMatchObject({ ownerId: SHARED_OWNER, shared: true });
    expect(checkInvariants(s)).toEqual([]);
  });

  it('leaves shared cards out of the game when the shared deck is off', () => {
    const s = withShared(2, false);
    expect(s.sharedDeck).toBeNull();
    for (const p of s.players) expect(defsIn(s, p.zones.deck)).toEqual(['def1', 'def2', 'def3']);
    expect(Object.values(s.instances).some((i) => i.definitionId === 'def6' || i.definitionId === 'def7')).toBe(false);
  });

  it('gives a card drawn from the shared deck to the player who drew it', () => {
    const s0 = withShared(2);
    const top = s0.sharedDeck![0]!;
    const s = run(s0, { type: 'moveCard', instanceId: top, to: { zone: 'hand' }, playerId: 1 });
    expect(s.sharedDeck).not.toContain(top);
    expect(s.players[1]!.zones.hand).toEqual([top]);
    expect(s.instances[top]).toMatchObject({ ownerId: 1, zone: 'hand', faceUp: true, shared: true });
    expect(checkInvariants(s)).toEqual([]);
  });

  it('draws for the current player when no player is given', () => {
    const s0 = run(withShared(2), { type: 'selectPlayer', playerId: 1 });
    const top = s0.sharedDeck![0]!;
    const s = run(s0, { type: 'moveCard', instanceId: top, to: { zone: 'graveyard' } });
    expect(s.players[1]!.zones.graveyard).toEqual([top]);
  });

  it("never mixes the decks: a shared card's deck is the shared deck", () => {
    const s0 = withShared(2);
    const top = s0.sharedDeck![0]!;
    const s1 = run(s0, { type: 'moveCard', instanceId: top, to: { zone: 'hand' }, playerId: 0 });
    const s = run(s1, { type: 'moveCard', instanceId: top, to: { zone: 'deck', placement: 'bottom' } });
    expect(s.players[0]!.zones.deck).not.toContain(top);
    expect(s.sharedDeck!.at(-1)).toBe(top);
    expect(s.instances[top]).toMatchObject({ ownerId: SHARED_OWNER, zone: 'deck', faceUp: false });
    // An ordinary card sent to the deck goes to its owner's deck, never the shared one.
    const own = s.players[0]!.zones.deck[0]!;
    const s2 = run(s, { type: 'moveCard', instanceId: own, to: { zone: 'hand' } }, { type: 'moveCard', instanceId: own, to: { zone: 'deck', placement: 'top' } });
    expect(s2.players[0]!.zones.deck[0]).toBe(own);
    expect(s2.sharedDeck).not.toContain(own);
    expect(checkInvariants(s2)).toEqual([]);
  });

  it('shuffles the shared deck', () => {
    const s0 = withShared(2);
    const s = run(s0, shuffleSharedDeckCommand(s0, () => 1));
    expect([...s.sharedDeck!].sort()).toEqual([...s0.sharedDeck!].sort());
    expect(run(s0, { type: 'setSharedDeckOrder', order: ['nope', 'nada'] })).toBe(s0);
  });

  it('returns shared cards held by removed players to the shared deck', () => {
    const s0 = withShared(3);
    const top = s0.sharedDeck![0]!;
    const s1 = run(s0, { type: 'moveCard', instanceId: top, to: { zone: 'canvas', position: { x: 0.5, y: 0.5 } }, playerId: 2 });
    const s = run(s1, { type: 'removePlayersFrom', playerId: 2 });
    expect(s.sharedDeck!.at(-1)).toBe(top);
    expect(s.instances[top]).toMatchObject({ ownerId: SHARED_OWNER, zone: 'deck', position: null });
    expect(checkInvariants(s)).toEqual([]);
  });

  it('keeps the shared deck out of new players\' decks', () => {
    const s0 = withShared(1);
    const s = run(s0, ...playerCountCommands(s0, 2, SHARED_CARDS, { makeId: () => 'new' + Math.random() }));
    expect(defsIn(s, s.players[1]!.zones.deck)).toEqual(['def1', 'def2', 'def3']);
    expect(s.sharedDeck).toEqual(s0.sharedDeck);
  });

  it('repairs a shared card found in a player deck by putting it back in the shared deck', () => {
    const s0 = withShared(2);
    const top = s0.sharedDeck![0]!;
    const broken: PlaytestState = {
      ...s0,
      sharedDeck: s0.sharedDeck!.slice(1),
      players: s0.players.map((p, i) => (i === 0 ? { ...p, zones: { ...p.zones, deck: [...p.zones.deck, top] } } : p)),
      instances: { ...s0.instances, [top]: { ...s0.instances[top]!, ownerId: 0 } },
    };
    expect(checkInvariants(broken)).not.toEqual([]);
    const { state } = repairPlaytest(broken);
    expect(checkInvariants(state)).toEqual([]);
    expect(state.sharedDeck).toContain(top);
  });

  it('fuzz: random moves keep every card in exactly one place', () => {
    const targetArb: fc.Arbitrary<ZoneTarget> = fc.oneof(
      fc.record({ zone: fc.constant('canvas' as const), position: fc.record({ x: fc.double({ min: 0, max: 1, noNaN: true }), y: fc.constant(0.5) }) }),
      fc.record({ zone: fc.constant('hand' as const) }),
      fc.record({ zone: fc.constant('deck' as const), placement: fc.constantFrom('top' as const, 'bottom' as const) }),
      fc.record({ zone: fc.constantFrom('graveyard' as const, 'exile' as const) }),
    );
    const stepArb = fc.oneof(
      fc.record({ t: fc.constant('move' as const), i: fc.nat(), to: targetArb, p: fc.nat(3) }),
      fc.record({ t: fc.constant('players' as const), n: fc.integer({ min: 1, max: 3 }) }),
      fc.record({ t: fc.constant('shuffle' as const) }),
    );
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        let s = withShared(2);
        let n = 0;
        for (const step of steps) {
          const ids = Object.keys(s.instances);
          let cmds: PlaytestCommand[];
          if (step.t === 'move') {
            const id = ids[step.i % ids.length]!;
            cmds = [{ type: 'moveCard', instanceId: id, to: step.to, playerId: step.p }];
          } else if (step.t === 'players') {
            cmds = playerCountCommands(s, step.n, SHARED_CARDS, { makeId: () => `f${++n}` });
          } else {
            cmds = [shuffleSharedDeckCommand(s)];
          }
          s = run(s, ...cmds);
          expect(checkInvariants(s)).toEqual([]);
          // The two shared cards always exist exactly once.
          expect(Object.values(s.instances).filter((i) => i.shared)).toHaveLength(2);
        }
      }),
      { numRuns: 200 },
    );
  });
});

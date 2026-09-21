import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { shuffled } from '../../lib/random';
import type { CardDefinition } from '../cards/types';
import type { PlaytestCommand, ZoneTarget } from './commands';
import { checkInvariants } from './invariants';
import { applyCommand } from './reducer';
import { createPlaytest, playerCountCommands, shuffleDeckCommand } from './setup';
import type { PlaytestState } from './types';
import { viewCard } from './visibility';

function card(n: number, enabled = true): CardDefinition {
  return {
    id: `def${n}`,
    name: `Card ${n}`,
    cost: String(n),
    description: '',
    imageId: null,
    enabled,
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

function fresh(players = 2): PlaytestState {
  return createPlaytest(players, CARDS, { makeId: idMaker(), rand: noShuffle });
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

  it('puts a card on top or bottom of the deck face-down, dropping tapped and counters', () => {
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
    expect(s1.instances[a!]).toMatchObject({ faceUp: false, tapped: false, counters: {}, position: null });
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

import { beforeEach, describe, expect, it } from 'vitest';
import type { CardDefinition } from '../domain/cards/types';
import { checkInvariants } from '../domain/playtest/invariants';
import { repairPlaytest } from '../domain/playtest/repair';
import { createPlaytest } from '../domain/playtest/setup';
import { startPlaytestAutosave } from '../persistence/autosave';
import { SandboxDB } from '../persistence/db';
import { createRepositories } from '../persistence/repositories';
import { createPlaytestStore } from './playtestStore';

const CARDS: CardDefinition[] = [1, 2, 3].map((n) => ({
  id: `def${n}`,
  name: `Card ${n}`,
  cost: '1',
  description: '',
  imageId: null,
  enabled: true,
  createdAt: n,
  updatedAt: n,
}));

let dbName: string;
let n = 0;
beforeEach(() => {
  dbName = `pt-${++n}-${Date.now()}`;
});

async function open() {
  const repos = createRepositories(new SandboxDB(dbName));
  const store = createPlaytestStore(repos);
  const autosave = startPlaytestAutosave(store, repos, 10);
  await store.getState().load();
  return { store, autosave, repos };
}

describe('playtest store', () => {
  it('has no playtest until one is started', async () => {
    const { store } = await open();
    expect(store.getState().state).toBeNull();
    store.getState().ensureStarted(CARDS, { playerCount: 2, countersPersist: true });
    const first = store.getState().state;
    expect(first?.players).toHaveLength(2);
    store.getState().ensureStarted(CARDS, { playerCount: 3, countersPersist: true }); // already running: unchanged
    expect(store.getState().state).toBe(first);
  });

  it('saves every change and restores it after reopening', async () => {
    const a = await open();
    a.store.getState().ensureStarted(CARDS, { playerCount: 2, countersPersist: true });
    const s = a.store.getState().state!;
    const top = s.players[0]!.zones.deck[0]!;
    a.store.getState().dispatch({ type: 'moveCard', instanceId: top, to: { zone: 'canvas', position: { x: 0.3, y: 0.6 } } });
    a.store.getState().dispatch({ type: 'toggleTapped', instanceId: top });
    a.store.getState().dispatch({ type: 'changeCounters', instanceId: top, color: 'red', delta: 2 });
    a.store.getState().dispatch({ type: 'selectPlayer', playerId: 1 });
    await a.autosave.flush();
    a.autosave.stop();

    const b = await open();
    expect(b.store.getState().state).toEqual(a.store.getState().state);
    expect(b.store.getState().state!.instances[top]).toMatchObject({
      zone: 'canvas',
      position: { x: 0.3, y: 0.6 },
      tapped: true,
      counters: { red: 2 },
    });
    expect(b.store.getState().state!.currentPlayer).toBe(1);
    b.autosave.stop();
  });

  it('reset rebuilds from the enabled cards and goes back to player 1', async () => {
    const { store, autosave } = await open();
    store.getState().ensureStarted(CARDS, { playerCount: 2, countersPersist: true });
    store.getState().dispatch({ type: 'selectPlayer', playerId: 1 });
    store.getState().reset([...CARDS.slice(0, 2), { ...CARDS[2]!, enabled: false }], {
      playerCount: 3,
      countersPersist: false,
    });
    const s = store.getState().state!;
    expect(s.rules.countersPersist).toBe(false);
    expect(s.players).toHaveLength(3);
    expect(s.currentPlayer).toBe(0);
    expect(s.players.every((p) => p.zones.deck.length === 2 && p.zones.hand.length === 0)).toBe(true);
    autosave.stop();
  });

  it('upgrades a playtest saved before table rules existed', async () => {
    const { rules: _dropped, ...v1 } = createPlaytest(1, CARDS);
    await new SandboxDB(dbName).kv.put({ key: 'playtest', value: { ...v1, schemaVersion: 1 } });
    const { store, autosave } = await open();
    expect(store.getState().state).toMatchObject({ schemaVersion: 2, rules: { countersPersist: true } });
    autosave.stop();
  });

  it('reports an unreadable saved playtest instead of failing', async () => {
    await new SandboxDB(dbName).kv.put({ key: 'playtest', value: { nonsense: true } });
    const { store, autosave } = await open();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().state).toBeNull();
    expect(store.getState().loadNotice).toMatch(/could not be read/);
    autosave.stop();
  });
});

describe('repairPlaytest', () => {
  it('fixes duplicates, orphans and wrong zone fields', () => {
    const s = createPlaytest(2, CARDS, { rand: () => 0 });
    const [a, b, c] = s.players[0]!.zones.deck;
    const broken = structuredClone(s);
    const p0 = broken.players[0]!;
    p0.zones.deck = [a!]; // b and c removed from every zone -> orphans
    p0.zones.hand = [a!, 'ghost']; // duplicate + unknown id
    broken.instances[a!]!.faceUp = true;
    broken.currentPlayer = 7;
    expect(checkInvariants(broken).length).toBeGreaterThan(0);

    const { state, fixes } = repairPlaytest(broken);
    expect(fixes).toBeGreaterThan(0);
    expect(checkInvariants(state)).toEqual([]);
    expect(state.players[0]!.zones.graveyard.sort()).toEqual([b, c].sort());
    expect(state.currentPlayer).toBe(0);
    expect(Object.keys(state.instances)).toHaveLength(Object.keys(s.instances).length);
  });

  it('returns a healthy state untouched', () => {
    const s = createPlaytest(1, CARDS);
    expect(repairPlaytest(s)).toEqual({ state: s, fixes: 0 });
  });
});

// The running playtest. Changes go through dispatch (the pure reducer); autosave writes them out.
import { create } from 'zustand';
import type { CardDefinition } from '../domain/cards/types';
import type { Settings } from '../domain/settings/types';
import type { PlaytestCommand } from '../domain/playtest/commands';
import { applyCommand } from '../domain/playtest/reducer';
import { repairPlaytest } from '../domain/playtest/repair';
import {
  createPlaytest,
  playerCountCommands,
  shuffleDeckCommand,
  shuffleSharedDeckCommand,
  syncBoundCardCommands,
} from '../domain/playtest/setup';
import type { PlayerId, PlaytestState } from '../domain/playtest/types';
import { repos as defaultRepos, type Repositories } from '../persistence/repositories';

export interface PlaytestStoreState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  state: PlaytestState | null; // null until a playtest has been started
  /** Set when the saved playtest needed fixing or could not be read; shown once to the user. */
  loadNotice: string | null;
  saveError: string | null;

  load(): Promise<void>;
  /** Starts a playtest if there is none yet. */
  ensureStarted(cards: readonly CardDefinition[], settings: TableSettings): void;
  reset(cards: readonly CardDefinition[], settings: TableSettings): void;
  dispatch(cmd: PlaytestCommand): void;
  shuffleDeck(playerId: PlayerId): void;
  shuffleSharedDeck(): void;
  /** Adds players with fresh decks, or removes the highest-numbered ones. */
  setPlayerCount(count: number, cards: readonly CardDefinition[]): void;
  /** Brings player-bound cards in line after cards were edited. */
  syncBoundCards(cards: readonly CardDefinition[]): void;
}

type TableSettings = Pick<Settings, 'playerCount' | 'countersPersist' | 'sharedDeck'>;
const newPlaytest = (cards: readonly CardDefinition[], s: TableSettings) =>
  createPlaytest(s.playerCount, cards, { rules: { countersPersist: s.countersPersist }, sharedDeck: s.sharedDeck });

export function createPlaytestStore(repos: Repositories) {
  return create<PlaytestStoreState>()((set, get) => ({
    status: 'loading',
    error: null,
    state: null,
    loadNotice: null,
    saveError: null,

    async load() {
      set({ status: 'loading', error: null });
      try {
        const { state: saved, unreadable } = await repos.loadPlaytest();
        if (!saved) {
          set({
            status: 'ready',
            state: null,
            loadNotice: unreadable ? 'The saved playtest could not be read, so a new one will be started.' : null,
          });
          return;
        }
        const { state, fixes } = repairPlaytest(saved);
        set({
          status: 'ready',
          state,
          loadNotice: fixes > 0 ? 'The saved playtest had inconsistencies and was repaired.' : null,
        });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    },

    ensureStarted(cards, settings) {
      if (!get().state) set({ state: newPlaytest(cards, settings) });
    },

    reset(cards, settings) {
      set({ state: newPlaytest(cards, settings) });
    },

    dispatch(cmd) {
      const current = get().state;
      if (!current) return;
      const next = applyCommand(current, cmd);
      if (next !== current) set({ state: next });
    },

    shuffleDeck(playerId) {
      const current = get().state;
      if (current) get().dispatch(shuffleDeckCommand(current, playerId));
    },

    shuffleSharedDeck() {
      const current = get().state;
      if (current) get().dispatch(shuffleSharedDeckCommand(current));
    },

    setPlayerCount(count, cards) {
      const current = get().state;
      if (current) playerCountCommands(current, count, cards).forEach(get().dispatch);
    },

    syncBoundCards(cards) {
      const current = get().state;
      if (current) syncBoundCardCommands(current, cards).forEach(get().dispatch);
    },
  }));
}

export type PlaytestStore = ReturnType<typeof createPlaytestStore>;
export const usePlaytest = createPlaytestStore(defaultRepos);

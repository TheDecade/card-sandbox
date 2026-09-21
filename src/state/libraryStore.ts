// Main Card List, image library and settings. Every change is written to IndexedDB first,
// then reflected in memory, so what you see is what is saved.
import { create } from 'zustand';
import { newCardDefinition, type CardDefinition, type CardId } from '../domain/cards/types';
import type { ImageAsset, ImageMeta } from '../domain/images/types';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings/types';
import { repos as defaultRepos, type Repositories } from '../persistence/repositories';
import { sampleCards } from './sampleCards';

export interface LibraryState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  cards: CardDefinition[]; // creation order
  images: ImageMeta[]; // creation order
  settings: Settings;

  load(): Promise<void>;
  saveCard(card: CardDefinition): Promise<void>;
  setEnabled(id: CardId, enabled: boolean): Promise<void>;
  addImages(images: ImageAsset[]): Promise<void>;
  addSampleCards(): Promise<void>;
  getCard(id: CardId): CardDefinition | undefined;
}

export function createLibraryStore(repos: Repositories) {
  return create<LibraryState>()((set, get) => ({
    status: 'loading',
    error: null,
    cards: [],
    images: [],
    settings: DEFAULT_SETTINGS,

    async load() {
      set({ status: 'loading', error: null });
      try {
        const [{ cards, skipped }, images, settings] = await Promise.all([
          repos.loadCards(),
          repos.loadImageMeta(),
          repos.loadSettings(),
        ]);
        if (skipped > 0) console.warn(`Skipped ${skipped} unreadable card record(s)`);
        set({ status: 'ready', cards, images, settings });
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    },

    async saveCard(card) {
      const saved = { ...card, updatedAt: Date.now() };
      await repos.saveCard(saved);
      set((s) => {
        const exists = s.cards.some((c) => c.id === saved.id);
        return {
          cards: exists ? s.cards.map((c) => (c.id === saved.id ? saved : c)) : [...s.cards, saved],
        };
      });
    },

    async setEnabled(id, enabled) {
      const card = get().getCard(id);
      if (card && card.enabled !== enabled) await get().saveCard({ ...card, enabled });
    },

    async addImages(images) {
      if (images.length === 0) return;
      await repos.saveImages(images);
      const metas = images.map(({ blob: _b, thumb: _t, ...meta }) => meta);
      set((s) => ({ images: [...s.images, ...metas] }));
    },

    async addSampleCards() {
      const now = Date.now();
      const cards = sampleCards().map((c, i) => ({ ...newCardDefinition(now + i), ...c }));
      await repos.saveCards(cards);
      set((s) => ({ cards: [...s.cards, ...cards] }));
    },

    getCard(id) {
      return get().cards.find((c) => c.id === id);
    },
  }));
}

export const useLibrary = createLibraryStore(defaultRepos);

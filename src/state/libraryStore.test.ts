import { beforeEach, describe, expect, it } from 'vitest';
import { newCardDefinition } from '../domain/cards/types';
import type { ImageAsset } from '../domain/images/types';
import { SandboxDB } from '../persistence/db';
import { createRepositories } from '../persistence/repositories';
import { createLibraryStore } from './libraryStore';

let dbName: string;
let n = 0;
beforeEach(() => {
  dbName = `test-${++n}-${Date.now()}`;
});

/** A store over a fresh database; a second call with the same name simulates reopening the app. */
async function openStore() {
  const store = createLibraryStore(createRepositories(new SandboxDB(dbName)));
  await store.getState().load();
  return store;
}

describe('library store', () => {
  it('starts empty with default settings', async () => {
    const s = (await openStore()).getState();
    expect(s.status).toBe('ready');
    expect(s.cards).toEqual([]);
    expect(s.settings.playerCount).toBe(2);
  });

  it('saves new and edited cards, and they survive reopening', async () => {
    const store = await openStore();
    const card = { ...newCardDefinition(), name: 'Ember Scout', cost: '1' };
    await store.getState().saveCard(card);
    await store.getState().saveCard({ ...card, description: 'Look at the top card.' });
    expect(store.getState().cards).toHaveLength(1);

    const reopened = (await openStore()).getState();
    expect(reopened.cards).toHaveLength(1);
    expect(reopened.cards[0]).toMatchObject({
      id: card.id,
      name: 'Ember Scout',
      description: 'Look at the top card.',
    });
  });

  it('enables and disables cards persistently', async () => {
    const store = await openStore();
    const card = newCardDefinition();
    await store.getState().saveCard(card);
    await store.getState().setEnabled(card.id, false);
    expect(store.getState().getCard(card.id)?.enabled).toBe(false);
    expect((await openStore()).getState().getCard(card.id)?.enabled).toBe(false);
  });

  it('keeps cards in creation order', async () => {
    const store = await openStore();
    await store.getState().addSampleCards();
    const names = store.getState().cards.map((c) => c.name);
    expect(names[0]).toBe('Ember Scout');
    expect((await openStore()).getState().cards.map((c) => c.name)).toEqual(names);
  });

  it('stores image metadata without keeping the blobs in memory', async () => {
    const store = await openStore();
    const image: ImageAsset = {
      id: 'img1',
      name: 'art.jpg',
      mime: 'image/jpeg',
      width: 10,
      height: 10,
      createdAt: 1,
      blob: 'full' as unknown as Blob, // fake-indexeddb can't clone jsdom Blobs; strings stand in
      thumb: 'thumb' as unknown as Blob,
    };
    await store.getState().addImages([image]);
    expect(store.getState().images).toEqual([
      { id: 'img1', name: 'art.jpg', mime: 'image/jpeg', width: 10, height: 10, createdAt: 1 },
    ]);
    const repos = createRepositories(new SandboxDB(dbName));
    expect(await repos.loadImageBlob('img1', 'thumb')).toBe('thumb');
    expect((await openStore()).getState().images).toHaveLength(1);
  });

  it('skips unreadable card records instead of failing', async () => {
    const db = new SandboxDB(dbName);
    await db.cards.put({ id: 'broken', createdAt: 0 } as never);
    await db.cards.put({ ...newCardDefinition(), name: 'Fine' });
    const s = (await openStore()).getState();
    expect(s.status).toBe('ready');
    expect(s.cards.map((c) => c.name)).toEqual(['Fine']);
  });
});

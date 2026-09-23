import { describe, expect, it } from 'vitest';
import { CardListFileError, parseCardListFile } from './cardListFile';

const file = (cards: unknown[], extra: object = {}) =>
  JSON.stringify({ format: 'card-sandbox-cards', version: 1, cards, ...extra });

describe('parseCardListFile', () => {
  it('reads cards in order with fresh ids and sensible defaults', () => {
    const cards = parseCardListFile(
      file([
        { name: 'Alpha', type: 'Planet', cost: '{Y}{Y}{Y}', description: '' },
        { name: 'Beta ship', type: 'Fleet', cost: '{X}', description: 'line one 🧱\nline two' },
        { name: 'Bare' },
      ]),
      1000,
    );
    expect(cards.map((c) => c.name)).toEqual(['Alpha', 'Beta ship', 'Bare']);
    expect(cards[1]).toMatchObject({ type: 'Fleet', cost: '{X}', description: 'line one 🧱\nline two' });
    expect(cards[2]).toMatchObject({ type: '', cost: '', description: '', enabled: true, startingPlayer: 0, imageId: null });
    expect(cards.map((c) => c.createdAt)).toEqual([1000, 1001, 1002]);
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
  });

  it('rejects other files with a readable message', () => {
    expect(() => parseCardListFile('not json')).toThrow(CardListFileError);
    expect(() => parseCardListFile(JSON.stringify({ format: 'card-sandbox-backup' }))).toThrow(/not a Card Sandbox card list/);
    expect(() => parseCardListFile(file([{ type: 'no name' }]))).toThrow(/damaged/);
    expect(() => parseCardListFile(file([], { version: 2 }))).toThrow(/newer version/);
  });
});

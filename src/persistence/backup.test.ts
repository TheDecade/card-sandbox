// @vitest-environment node
// (Node's Blob supports arrayBuffer(); jsdom's does not.)
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newCardDefinition } from '../domain/cards/types';
import type { ImageAsset } from '../domain/images/types';
import { applyCommand } from '../domain/playtest/reducer';
import { createPlaytest } from '../domain/playtest/setup';
import { DEFAULT_SETTINGS } from '../domain/settings/types';
import { BackupError, packBackup, unpackBackup, type BackupContents } from './backup';

function sample(): BackupContents {
  const cards = [
    { ...newCardDefinition(1), name: 'Ember Scout', cost: '1', imageId: 'img1' },
    { ...newCardDefinition(2), name: 'Stone Warden', cost: '3', enabled: false },
  ];
  const image: ImageAsset = {
    id: 'img1',
    name: 'ember.png',
    mime: 'image/png',
    width: 2,
    height: 2,
    createdAt: 5,
    blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
    thumb: new Blob([new Uint8Array([9, 8])], { type: 'image/png' }),
  };
  let playtest = createPlaytest(2, cards);
  const top = playtest.players[0]!.zones.deck[0]!;
  playtest = applyCommand(playtest, { type: 'moveCard', instanceId: top, to: { zone: 'hand' } });
  playtest = applyCommand(playtest, { type: 'changeCounters', instanceId: top, color: 'p2', delta: 3 });
  return {
    exportedAt: 1_700_000_000_000,
    settings: { ...DEFAULT_SETTINGS, playerCount: 3, countersPersist: false },
    cards,
    images: [image],
    playtest,
  };
}

const bytesOf = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];

describe('backup', () => {
  it('round-trips cards, settings, images and the playtest', async () => {
    const data = sample();
    const restored = unpackBackup(await packBackup(data, '0.1.0'));
    expect(restored.cards).toEqual(data.cards);
    expect(restored.settings).toEqual(data.settings);
    expect(restored.playtest).toEqual(data.playtest);
    expect(restored.playtestUnreadable).toBe(false);
    expect(restored.images).toHaveLength(1);
    const [img] = restored.images;
    expect(img).toMatchObject({ id: 'img1', name: 'ember.png', mime: 'image/png', width: 2, height: 2 });
    expect(await bytesOf(img!.blob)).toEqual([1, 2, 3, 4]);
    expect(await bytesOf(img!.thumb)).toEqual([9, 8]);
  });

  it('rejects files that are not backups', () => {
    expect(() => unpackBackup(new Uint8Array([1, 2, 3]))).toThrow(BackupError);
    const otherZip = zipSync({ 'hello.txt': strToU8('hi') });
    expect(() => unpackBackup(otherZip)).toThrow(/not a Card Sandbox backup/);
  });

  it('rejects backups from a newer app version', async () => {
    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({ format: 'card-sandbox-backup', version: 99, exportedAt: 1, settings: {}, cards: [], images: [], playtest: null }),
      ),
    });
    expect(() => unpackBackup(zip)).toThrow(/newer version/);
  });

  it('reports a missing image file', async () => {
    const data = sample();
    const zip = await packBackup(data);
    const { unzipSync } = await import('fflate');
    const files = unzipSync(zip);
    delete files['images/img1.png'];
    expect(() => unpackBackup(zipSync(files))).toThrow(/missing image "ember.png"/);
  });

  it('still restores cards when the playtest inside is unreadable', async () => {
    const data = { ...sample(), playtest: { broken: true } as never };
    const restored = unpackBackup(await packBackup(data));
    expect(restored.cards).toHaveLength(2);
    expect(restored.playtest).toBeNull();
    expect(restored.playtestUnreadable).toBe(true);
  });

  it('upgrades a playtest saved by an older version', async () => {
    const data = sample();
    const { rules: _r, ...v1 } = data.playtest!;
    const restored = unpackBackup(await packBackup({ ...data, playtest: { ...v1, schemaVersion: 1 } as never }));
    expect(restored.playtest?.rules).toEqual({ countersPersist: true });
  });
});

import Dexie, { type Table } from 'dexie';
import type { CardDefinition, CardId, ImageId } from '../domain/cards/types';
import type { ImageAsset } from '../domain/images/types';

export interface KvRecord {
  key: string; // 'settings' | 'playtest'
  value: unknown;
}

/** All app data, stored locally in the browser (IndexedDB). */
export class SandboxDB extends Dexie {
  cards!: Table<CardDefinition, CardId>;
  images!: Table<ImageAsset, ImageId>;
  kv!: Table<KvRecord, string>;

  constructor(name = 'card-sandbox') {
    super(name);
    // Schema changes: add this.version(2).stores({...}).upgrade(tx => ...) — never edit version 1.
    this.version(1).stores({
      cards: 'id, createdAt',
      images: 'id, createdAt',
      kv: 'key',
    });
  }
}

export const db = new SandboxDB();

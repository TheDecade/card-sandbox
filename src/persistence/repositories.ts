// The only code that talks to IndexedDB. Everything else goes through these functions.
import type { CardDefinition } from '../domain/cards/types';
import type { ImageAsset, ImageMeta, ImageVariant } from '../domain/images/types';
import type { Settings } from '../domain/settings/types';
import { db as defaultDb, type SandboxDB } from './db';
import { cardDefinitionSchema, parseSettings } from './schemas';

export function createRepositories(db: SandboxDB = defaultDb) {
  return {
    /** Loads all card definitions; malformed records are skipped and reported. */
    async loadCards(): Promise<{ cards: CardDefinition[]; skipped: number }> {
      const raw = await db.cards.orderBy('createdAt').toArray();
      const cards: CardDefinition[] = [];
      let skipped = 0;
      for (const r of raw) {
        const parsed = cardDefinitionSchema.safeParse(r);
        if (parsed.success) cards.push(parsed.data);
        else skipped++;
      }
      return { cards, skipped };
    },

    async saveCard(card: CardDefinition): Promise<void> {
      await db.cards.put(card);
    },

    async saveCards(cards: CardDefinition[]): Promise<void> {
      await db.cards.bulkPut(cards);
    },

    /** Image metadata only; the pixel blobs stay on disk until displayed. */
    async loadImageMeta(): Promise<ImageMeta[]> {
      const metas: ImageMeta[] = [];
      await db.images.orderBy('createdAt').each(({ blob: _b, thumb: _t, ...meta }) => {
        metas.push(meta);
      });
      return metas;
    },

    async saveImages(images: ImageAsset[]): Promise<void> {
      await db.images.bulkPut(images);
    },

    async loadImageBlob(id: string, variant: ImageVariant): Promise<Blob | undefined> {
      const image = await db.images.get(id);
      return variant === 'thumb' ? image?.thumb : image?.blob;
    },

    async loadSettings(): Promise<Settings> {
      return parseSettings((await db.kv.get('settings'))?.value);
    },

    async saveSettings(settings: Settings): Promise<void> {
      await db.kv.put({ key: 'settings', value: settings });
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
export const repos = createRepositories();

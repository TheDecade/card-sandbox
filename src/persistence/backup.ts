// Backup file: one .zip holding manifest.json (cards, settings, playtest, image list) plus the
// image files. Everything needed to rebuild the app's data on this or another device.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { z } from 'zod';
import type { CardDefinition } from '../domain/cards/types';
import type { ImageAsset, ImageMeta } from '../domain/images/types';
import type { PlaytestState } from '../domain/playtest/types';
import type { Settings } from '../domain/settings/types';
import { db as defaultDb, type SandboxDB } from './db';
import { migratePlaytest } from './migrations';
import { cardDefinitionSchema, parseSettings, playtestSchema } from './schemas';

export const BACKUP_FORMAT = 'card-sandbox-backup';
export const BACKUP_VERSION = 1;

export interface BackupContents {
  exportedAt: number;
  settings: Settings;
  cards: CardDefinition[];
  images: ImageAsset[];
  playtest: PlaytestState | null;
}

const imageMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  mime: z.string(),
  width: z.number(),
  height: z.number(),
  createdAt: z.number(),
});

const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int(),
  exportedAt: z.number(),
  appVersion: z.string().optional(),
  settings: z.unknown(),
  cards: z.array(cardDefinitionSchema),
  images: z.array(imageMetaSchema),
  playtest: z.unknown().nullable(),
});

export class BackupError extends Error {}

const ext = (mime: string) => (mime === 'image/png' ? 'png' : 'jpg');
const imagePath = (m: ImageMeta, variant: 'full' | 'thumb') =>
  `images/${m.id}${variant === 'thumb' ? '.thumb' : ''}.${ext(m.mime)}`;

/** Builds the zip. Images are stored as-is (already compressed); the manifest is deflated. */
export async function packBackup(data: BackupContents, appVersion = ''): Promise<Uint8Array> {
  const images: ImageMeta[] = data.images.map(({ blob: _b, thumb: _t, ...meta }) => meta);
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: data.exportedAt,
    appVersion,
    settings: data.settings,
    cards: data.cards,
    images,
    playtest: data.playtest,
  };
  const files: Zippable = { 'manifest.json': [strToU8(JSON.stringify(manifest)), { level: 6 }] };
  for (const img of data.images) {
    files[imagePath(img, 'full')] = [new Uint8Array(await img.blob.arrayBuffer()), { level: 0 }];
    files[imagePath(img, 'thumb')] = [new Uint8Array(await img.thumb.arrayBuffer()), { level: 0 }];
  }
  return zipSync(files);
}

/** Reads and validates a backup. Throws BackupError with a readable message when it can't. */
export function unpackBackup(bytes: Uint8Array): BackupContents & { playtestUnreadable: boolean } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new BackupError('This is not a Card Sandbox backup file.');
  }
  const manifestFile = files['manifest.json'];
  if (!manifestFile) throw new BackupError('This is not a Card Sandbox backup file.');

  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(manifestFile));
  } catch {
    throw new BackupError('The backup file is damaged (unreadable manifest).');
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) throw new BackupError('The backup file is damaged or not a Card Sandbox backup.');
  const m = parsed.data;
  if (m.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app first.');
  }

  const images: ImageAsset[] = m.images.map((meta) => {
    const full = files[imagePath(meta, 'full')];
    const thumb = files[imagePath(meta, 'thumb')];
    if (!full || !thumb) throw new BackupError(`The backup file is missing image "${meta.name}".`);
    return {
      ...meta,
      blob: new Blob([full as BlobPart], { type: meta.mime }),
      thumb: new Blob([thumb as BlobPart], { type: meta.mime }),
    };
  });

  let playtest: PlaytestState | null = null;
  let playtestUnreadable = false;
  if (m.playtest != null) {
    const p = playtestSchema.safeParse(m.playtest);
    if (p.success) playtest = migratePlaytest(p.data);
    else playtestUnreadable = true; // cards and images are still worth restoring
  }

  return {
    exportedAt: m.exportedAt,
    settings: parseSettings(m.settings),
    cards: m.cards,
    images,
    playtest,
    playtestUnreadable,
  };
}

/** Everything currently stored, as a zip file ready to share or download. */
export async function createBackupFile(db: SandboxDB = defaultDb, appVersion = ''): Promise<File> {
  const [cards, images, settings, playtest] = await Promise.all([
    db.cards.orderBy('createdAt').toArray(),
    db.images.orderBy('createdAt').toArray(),
    db.kv.get('settings'),
    db.kv.get('playtest'),
  ]);
  const now = Date.now();
  const bytes = await packBackup(
    {
      exportedAt: now,
      settings: parseSettings(settings?.value),
      cards,
      images,
      playtest: (playtest?.value as PlaytestState | undefined) ?? null,
    },
    appVersion,
  );
  const stamp = new Date(now).toISOString().slice(0, 10);
  return new File([bytes as BlobPart], `card-sandbox-${stamp}.zip`, { type: 'application/zip' });
}

/** Replaces all stored data with the backup, in one transaction (all or nothing). */
export async function restoreBackup(contents: BackupContents, db: SandboxDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.cards, db.images, db.kv, async () => {
    await Promise.all([db.cards.clear(), db.images.clear(), db.kv.clear()]);
    await db.cards.bulkPut(contents.cards);
    await db.images.bulkPut(contents.images);
    await db.kv.put({ key: 'settings', value: { ...contents.settings, lastBackupAt: contents.exportedAt } });
    if (contents.playtest) await db.kv.put({ key: 'playtest', value: contents.playtest });
  });
}

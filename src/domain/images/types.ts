import type { ImageId } from '../cards/types';

/** Image metadata, kept in memory for the whole library. */
export interface ImageMeta {
  id: ImageId;
  name: string; // original file name, shown in the picker
  mime: string; // image/jpeg | image/png
  width: number;
  height: number;
  createdAt: number;
}

/** Stored record: metadata plus the pixels. Blobs are only read when an image is displayed. */
export interface ImageAsset extends ImageMeta {
  blob: Blob; // downscaled full image
  thumb: Blob; // small version for lists, hand and table
}

export type ImageVariant = 'full' | 'thumb';

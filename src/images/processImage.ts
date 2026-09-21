// Turns a picked photo/file into a stored image: downscaled full size plus a thumbnail.
import type { ImageAsset } from '../domain/images/types';
import { newId } from '../lib/id';

export const MAX_FULL_SIDE = 1200;
export const MAX_THUMB_SIDE = 320;

type Source = { image: CanvasImageSource; width: number; height: number; close(): void };

async function decode(file: Blob): Promise<Source> {
  try {
    const bmp = await createImageBitmap(file);
    return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    // Fallback (e.g. HEIC from the Files app): let an <img> decode it.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('This file is not an image Safari can read.');
    }
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

function drawScaled(src: Source, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), mime, quality),
  );
}

export async function processImage(file: File): Promise<ImageAsset> {
  const src = await decode(file);
  try {
    const full = drawScaled(src, MAX_FULL_SIDE);
    const thumb = drawScaled(src, MAX_THUMB_SIDE);
    // Keep PNG only when the image really uses transparency; everything else becomes JPEG.
    const mayHaveAlpha = /png|webp|gif/i.test(file.type);
    const mime = mayHaveAlpha && hasTransparency(thumb) ? 'image/png' : 'image/jpeg';
    const [blob, thumbBlob] = await Promise.all([toBlob(full, mime, 0.85), toBlob(thumb, mime, 0.8)]);
    return {
      id: newId(),
      name: file.name || 'image',
      mime,
      width: full.width,
      height: full.height,
      createdAt: Date.now(),
      blob,
      thumb: thumbBlob,
    };
  } finally {
    src.close();
  }
}

/** Processes files one by one (keeps memory low on the iPad), reporting progress. */
export async function processImages(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ images: ImageAsset[]; failed: string[] }> {
  const images: ImageAsset[] = [];
  const failed: string[] = [];
  for (const [i, file] of files.entries()) {
    try {
      images.push(await processImage(file));
    } catch {
      failed.push(file.name || `file ${i + 1}`);
    }
    onProgress?.(i + 1, files.length);
  }
  return { images, failed };
}

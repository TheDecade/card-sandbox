// Object URLs for stored images, shared and reference-counted so each blob is read once and
// its URL revoked when nothing shows it any more.
import { useEffect, useState } from 'react';
import type { ImageId } from '../domain/cards/types';
import type { ImageVariant } from '../domain/images/types';
import { repos } from '../persistence/repositories';

interface Entry {
  url: string | null;
  refs: number;
  promise: Promise<string | null>;
  revokeTimer?: ReturnType<typeof setTimeout>;
}

const cache = new Map<string, Entry>();
const REVOKE_DELAY_MS = 30_000; // keep briefly: scrolling lists mount/unmount rows constantly

function acquire(id: ImageId, variant: ImageVariant): Entry {
  const key = `${id}:${variant}`;
  let entry = cache.get(key);
  if (!entry) {
    const created: Entry = {
      url: null,
      refs: 0,
      promise: repos.loadImageBlob(id, variant).then((blob) => {
        created.url = blob ? URL.createObjectURL(blob) : null;
        return created.url;
      }),
    };
    entry = created;
    cache.set(key, entry);
  }
  clearTimeout(entry.revokeTimer);
  entry.refs++;
  return entry;
}

function release(id: ImageId, variant: ImageVariant): void {
  const key = `${id}:${variant}`;
  const entry = cache.get(key);
  if (!entry || --entry.refs > 0) return;
  entry.revokeTimer = setTimeout(() => {
    if (entry.refs > 0) return;
    if (entry.url) URL.revokeObjectURL(entry.url);
    cache.delete(key);
  }, REVOKE_DELAY_MS);
}

/** URL of a stored image, or null while loading / when there is no image. */
export function useImageUrl(id: ImageId | null | undefined, variant: ImageVariant = 'thumb'): string | null {
  const cached = id ? cache.get(`${id}:${variant}`)?.url ?? null : null;
  const [url, setUrl] = useState<string | null>(cached);

  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let alive = true;
    const entry = acquire(id, variant);
    if (entry.url) setUrl(entry.url);
    else void entry.promise.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
      release(id, variant);
    };
  }, [id, variant]);

  return id ? url : null;
}

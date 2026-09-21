// Browser/iPad environment helpers. Kept free of React so they can be reused anywhere.

/** True when running as an installed Home Screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Stops Safari from pinch-zooming the page. Double-tap zoom and long-press callouts are
 * handled in CSS (touch-action / -webkit-touch-callout) — see global.css.
 */
export function suppressBrowserGestures(): void {
  const block = (e: Event) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, block, { passive: false });
  }
}

export type StorageStatus = {
  persisted: boolean | null; // null = API unavailable
  usageBytes: number | null;
  quotaBytes: number | null;
};

/** Asks the browser to protect our storage from eviction, then reports the result. */
export async function requestPersistentStorage(): Promise<StorageStatus> {
  const storage = navigator.storage;
  if (!storage?.persist) return { persisted: null, usageBytes: null, quotaBytes: null };
  const persisted = (await storage.persisted()) || (await storage.persist());
  const { usage, quota } = storage.estimate ? await storage.estimate() : {};
  return { persisted, usageBytes: usage ?? null, quotaBytes: quota ?? null };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

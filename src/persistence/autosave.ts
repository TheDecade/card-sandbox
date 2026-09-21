import type { PlaytestState } from '../domain/playtest/types';
import type { PlaytestStore } from '../state/playtestStore';
import type { Repositories } from './repositories';

let active: { flush(): Promise<void> } | null = null;

/** Writes any pending playtest change now (e.g. before a backup replaces the database). */
export async function flushPlaytestAutosave(): Promise<void> {
  await active?.flush();
}

/**
 * Saves the playtest shortly after every change, and immediately when the app goes to the
 * background: iPadOS may kill a backgrounded web app without warning.
 */
export function startPlaytestAutosave(store: PlaytestStore, repos: Repositories, delayMs = 300) {
  let pending: PlaytestState | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    clearTimeout(timer);
    const state = pending;
    pending = null;
    if (!state) return;
    try {
      await repos.savePlaytest(state);
      if (store.getState().saveError) store.setState({ saveError: null });
    } catch (e) {
      store.setState({ saveError: e instanceof Error ? e.message : String(e) });
    }
  };

  const unsubscribe = store.subscribe((cur, prev) => {
    if (!cur.state || cur.state === prev.state) return;
    pending = cur.state;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  });

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  const onPageHide = () => void flush();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  const handle = {
    flush,
    stop() {
      if (active === handle) active = null;
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
  active = handle;
  return handle;
}

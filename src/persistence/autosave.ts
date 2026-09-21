import type { PlaytestState } from '../domain/playtest/types';
import type { PlaytestStore } from '../state/playtestStore';
import type { Repositories } from './repositories';

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

  return {
    flush,
    stop() {
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
}

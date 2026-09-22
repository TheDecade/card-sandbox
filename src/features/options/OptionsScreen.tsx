import { useState } from 'react';
import { formatBytes, type StorageStatus } from '../../app/platform';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../domain/settings/types';
import { useLibrary } from '../../state/libraryStore';
import { usePlaytest } from '../../state/playtestStore';
import { ConfirmDialog } from '../../ui/Modal';
import { Toggle } from '../../ui/Toggle';
import { ResetPlaytestDialog } from '../playtest/PlaytestScreen';
import { BackupSection } from './BackupSection';
import { PlayerValuesSection } from './PlayerValuesSection';

export function OptionsScreen({
  storage,
  standalone,
  onBack,
}: {
  storage: StorageStatus | null;
  standalone: boolean;
  onBack: () => void;
}) {
  const playerCount = useLibrary((s) => s.settings.playerCount);
  const countersPersist = useLibrary((s) => s.settings.countersPersist);
  const sharedDeck = useLibrary((s) => s.settings.sharedDeck);
  const playtestPlayers = usePlaytest((s) => s.state?.players.length ?? null);
  const playtestHasSharedDeck = usePlaytest((s) => (s.state ? s.state.sharedDeck !== null : null));
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(count: number) {
    try {
      await useLibrary.getState().updateSettings({ playerCount: count });
      usePlaytest.getState().setPlayerCount(count, useLibrary.getState().cards);
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function setCountersPersist(on: boolean) {
    try {
      await useLibrary.getState().updateSettings({ countersPersist: on });
      usePlaytest.getState().dispatch({ type: 'setRules', rules: { countersPersist: on } });
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Decks are built when a playtest starts, so the running one keeps its decks until it's reset.
  async function setSharedDeck(on: boolean) {
    try {
      await useLibrary.getState().updateSettings({ sharedDeck: on });
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function change(count: number) {
    if (count < MIN_PLAYERS || count > MAX_PLAYERS) return;
    // Removing players from a running playtest discards their cards: ask first.
    if (playtestPlayers !== null && count < playtestPlayers) setConfirmRemove(count);
    else void apply(count);
  }

  const removed = confirmRemove === null ? [] : range(confirmRemove + 1, playtestPlayers ?? 0);
  const persisted =
    storage?.persisted == null ? 'unknown' : storage.persisted ? 'yes' : 'no (not guaranteed)';

  return (
    <main className="screen">
      <header className="screen-header">
        <button className="btn" onClick={onBack} aria-label="Back to menu">
          ‹ Menu
        </button>
        <h2>Options</h2>
      </header>

      <section className="panel">
        <h3>Players</h3>
        <div className="stepper">
          <button
            className="btn btn-big"
            aria-label="Fewer players"
            disabled={playerCount <= MIN_PLAYERS}
            onClick={() => change(playerCount - 1)}
          >
            −
          </button>
          <output className="stepper-value" aria-label="Number of players">
            {playerCount}
          </output>
          <button
            className="btn btn-big"
            aria-label="More players"
            disabled={playerCount >= MAX_PLAYERS}
            onClick={() => change(playerCount + 1)}
          >
            +
          </button>
        </div>
        <p className="muted panel-note">
          {playtestPlayers === null
            ? 'Used when the playtest starts.'
            : 'Changes apply to the running playtest: new players get a freshly shuffled deck of the enabled cards; existing players are not touched.'}
        </p>
        {error && <p className="picker-problem">{error}</p>}
      </section>

      <PlayerValuesSection />

      <section className="panel">
        <h3>Counters</h3>
        <div className="option-row">
          <span>Keep counters when a card changes zone</span>
          <Toggle
            checked={countersPersist}
            label="Keep counters when a card changes zone"
            onChange={(on) => void setCountersPersist(on)}
          />
        </div>
        <p className="muted panel-note">
          {countersPersist
            ? 'On: counters stay on a card wherever it goes — hand, table, graveyard, exile, even the deck.'
            : 'Off: a card loses its counters when it moves to another zone. Moving it around the table or within the hand keeps them.'}
        </p>
      </section>

      <section className="panel">
        <h3>Shared deck</h3>
        <div className="option-row">
          <span>One deck shared by all players</span>
          <Toggle
            checked={sharedDeck}
            label="One deck shared by all players"
            onChange={(on) => void setSharedDeck(on)}
          />
        </div>
        <p className="muted panel-note">
          {sharedDeck
            ? 'On: cards marked "Shared deck" go into one deck at the top right of every table, the same cards in the same order for all players. They never mix with the players\' own decks.'
            : 'Off: cards marked "Shared deck" are shuffled into every player\'s deck like any other card.'}
        </p>
        {playtestHasSharedDeck !== null && playtestHasSharedDeck !== sharedDeck && (
          <div className="option-row">
            <span className="muted">
              The running playtest {playtestHasSharedDeck ? 'still has' : 'has no'} shared deck. Reset it to apply the
              change.
            </span>
            <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
              Reset Playtest
            </button>
          </div>
        )}
      </section>

      <BackupSection />

      <section className="panel">
        <h3>About</h3>
        <dl className="facts">
          <dt>Version</dt>
          <dd>
            {__APP_VERSION__} ({__BUILD_HASH__})
          </dd>
          <dt>Built</dt>
          <dd>{new Date(__BUILD_TIME__).toLocaleString()}</dd>
          <dt>Installed app</dt>
          <dd>{standalone ? 'yes' : 'no, running in a browser tab'}</dd>
          <dt>Persistent storage</dt>
          <dd>{persisted}</dd>
          <dt>Storage used</dt>
          <dd>
            {storage?.usageBytes != null ? formatBytes(storage.usageBytes) : '—'}
            {storage?.quotaBytes != null ? ` of ${formatBytes(storage.quotaBytes)}` : ''}
          </dd>
        </dl>
      </section>

      {confirmRemove !== null && (
        <ConfirmDialog
          title={`Remove ${removed.map((n) => `Player ${n}`).join(' and ')}?`}
          message={`Their deck, hand, table, graveyard and exile will be discarded (shared-deck cards go back under the shared deck). The other players are not affected.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            void apply(confirmRemove);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
      {confirmReset && <ResetPlaytestDialog onDone={() => setConfirmReset(false)} />}
    </main>
  );
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

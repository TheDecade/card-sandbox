import { useEffect, useState } from 'react';
import { CardEditScreen } from '../features/cardEdit/CardEditScreen';
import { lastBackupText } from '../features/options/BackupSection';
import { OptionsScreen } from '../features/options/OptionsScreen';
import { PlaytestScreen, ResetPlaytestDialog } from '../features/playtest/PlaytestScreen';
import { startPlaytestAutosave } from '../persistence/autosave';
import { repos } from '../persistence/repositories';
import { useLibrary } from '../state/libraryStore';
import { usePlaytest } from '../state/playtestStore';
import { UpdateToast } from './UpdateToast';
import { isStandalone, requestPersistentStorage, type StorageStatus } from './platform';

type Screen = 'menu' | 'playtest' | 'cardEdit' | 'options';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [confirmReset, setConfirmReset] = useState(false);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const standalone = isStandalone();
  const libraryStatus = useLibrary((s) => s.status);
  const playtestStatus = usePlaytest((s) => s.status);
  const libraryError = useLibrary((s) => s.error);
  const playtestError = usePlaytest((s) => s.error);
  const loadNotice = usePlaytest((s) => s.loadNotice);

  useEffect(() => {
    requestPersistentStorage().then(setStorage, () => setStorage(null));
    const autosave = startPlaytestAutosave(usePlaytest, repos);
    void useLibrary.getState().load();
    void usePlaytest.getState().load();
    // Editing a card's player binding mid-game updates the running playtest.
    const unsubscribe = useLibrary.subscribe((s, prev) => {
      if (s.cards !== prev.cards && prev.status === 'ready') usePlaytest.getState().syncStartingCards(s.cards);
    });
    return () => {
      unsubscribe();
      autosave.stop();
    };
  }, []);

  const retry = () => {
    void useLibrary.getState().load();
    void usePlaytest.getState().load();
  };

  if (libraryStatus !== 'ready' || playtestStatus !== 'ready') {
    const failed = libraryStatus === 'error' || playtestStatus === 'error';
    return (
      <div className="app">
        <main className="menu">
          {!failed ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <p>Your cards could not be loaded.</p>
              <p className="muted">{libraryError ?? playtestError}</p>
              <button className="btn btn-big" onClick={retry}>
                Try again
              </button>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {!standalone && <InstallBanner />}

      {screen === 'menu' && <MainMenu onOpen={setScreen} onReset={() => setConfirmReset(true)} />}
      {screen === 'playtest' && (
        <PlaytestScreen onBack={() => setScreen('menu')} />
      )}
      {screen === 'cardEdit' && (
        <CardEditScreen onBack={() => setScreen('menu')} />
      )}
      {screen === 'options' && (
        <OptionsScreen storage={storage} standalone={standalone} onBack={() => setScreen('menu')} />
      )}

      {confirmReset && <ResetPlaytestDialog onDone={() => setConfirmReset(false)} />}
      {loadNotice && (
        <div className="toast" role="status">
          <span>{loadNotice}</span>
          <button className="btn btn-small" onClick={() => usePlaytest.setState({ loadNotice: null })}>
            OK
          </button>
        </div>
      )}

      <UpdateToast />
    </div>
  );
}

const BACKUP_REMINDER_DAYS = 14;

function MainMenu({ onOpen, onReset }: { onOpen: (s: Screen) => void; onReset: () => void }) {
  const lastBackupAt = useLibrary((s) => s.settings.lastBackupAt);
  const hasCards = useLibrary((s) => s.cards.length > 0);
  const overdue =
    hasCards && (lastBackupAt === null || Date.now() - lastBackupAt > BACKUP_REMINDER_DAYS * 86_400_000);
  return (
    <main className="menu">
      <h1 className="menu-title">Card Sandbox</h1>
      <nav className="menu-buttons">
        <button className="btn btn-big btn-primary" onClick={() => onOpen('playtest')}>
          Playtest
        </button>
        <button className="btn btn-big" onClick={() => onOpen('cardEdit')}>
          Card Edit
        </button>
        <button className="btn btn-big" onClick={() => onOpen('options')}>
          Options
        </button>
        <button className="btn btn-big btn-danger" onClick={onReset}>
          Reset Playtest
        </button>
      </nav>
      {hasCards && (
        <button className={`backup-reminder${overdue ? ' is-warning' : ''}`} onClick={() => onOpen('options')}>
          Last backup: {lastBackupText(lastBackupAt)}
          {overdue && ' · back up now'}
        </button>
      )}
      <p className="version">
        v{__APP_VERSION__} · {__BUILD_HASH__}
      </p>
    </main>
  );
}

function InstallBanner() {
  return (
    <div className="banner">
      Running in a browser tab. For reliable storage, install it with <b>Share → Add to Home Screen</b>{' '}
      and use only the installed app.
    </div>
  );
}

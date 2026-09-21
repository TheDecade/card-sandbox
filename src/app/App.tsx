import { useEffect, useState } from 'react';
import { CardEditScreen } from '../features/cardEdit/CardEditScreen';
import { PlaytestScreen, ResetPlaytestDialog } from '../features/playtest/PlaytestScreen';
import { startPlaytestAutosave } from '../persistence/autosave';
import { repos } from '../persistence/repositories';
import { useLibrary } from '../state/libraryStore';
import { usePlaytest } from '../state/playtestStore';
import { UpdateToast } from './UpdateToast';
import { formatBytes, isStandalone, requestPersistentStorage, type StorageStatus } from './platform';

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
    return () => autosave.stop();
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
        <Options storage={storage} standalone={standalone} onBack={() => setScreen('menu')} />
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

function MainMenu({ onOpen, onReset }: { onOpen: (s: Screen) => void; onReset: () => void }) {
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
      <p className="version">
        v{__APP_VERSION__} · {__BUILD_HASH__}
      </p>
    </main>
  );
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="screen-header">
      <button className="btn" onClick={onBack} aria-label="Back to menu">
        ‹ Menu
      </button>
      <h2>{title}</h2>
    </header>
  );
}

function Options({
  storage,
  standalone,
  onBack,
}: {
  storage: StorageStatus | null;
  standalone: boolean;
  onBack: () => void;
}) {
  const persisted =
    storage?.persisted == null ? 'unknown' : storage.persisted ? 'yes' : 'no (not guaranteed)';
  return (
    <main className="screen">
      <ScreenHeader title="Options" onBack={onBack} />
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

import { useEffect, useState } from 'react';
import { GestureLab } from '../features/playtest/GestureLab';
import { ConfirmDialog } from '../ui/Modal';
import { UpdateToast } from './UpdateToast';
import { formatBytes, isStandalone, requestPersistentStorage, type StorageStatus } from './platform';

type Screen = 'menu' | 'playtest' | 'cardEdit' | 'options';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [confirmReset, setConfirmReset] = useState(false);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const standalone = isStandalone();

  useEffect(() => {
    requestPersistentStorage().then(setStorage, () => setStorage(null));
  }, []);

  return (
    <div className="app">
      {!standalone && <InstallBanner />}

      {screen === 'menu' && <MainMenu onOpen={setScreen} onReset={() => setConfirmReset(true)} />}
      {screen === 'playtest' && (
        <GestureLab onBack={() => setScreen('menu')} />
      )}
      {screen === 'cardEdit' && (
        <Placeholder title="Card Edit" milestone="M3" onBack={() => setScreen('menu')} />
      )}
      {screen === 'options' && (
        <Options storage={storage} standalone={standalone} onBack={() => setScreen('menu')} />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset Playtest?"
          message="All hands, tables, graveyards, exile zones and counters will be discarded and every deck rebuilt from the enabled cards. Your card list is not affected."
          confirmLabel="Reset"
          danger
          onConfirm={() => setConfirmReset(false)}
          onCancel={() => setConfirmReset(false)}
        />
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

function Placeholder({ title, milestone, onBack }: { title: string; milestone: string; onBack: () => void }) {
  return (
    <main className="screen">
      <ScreenHeader title={title} onBack={onBack} />
      <p className="muted">Coming in milestone {milestone}.</p>
    </main>
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

import { useRef, useState } from 'react';
import { formatBytes } from '../../app/platform';
import { flushPlaytestAutosave } from '../../persistence/autosave';
import { BackupError, createBackupFile, restoreBackup, unpackBackup, type BackupContents } from '../../persistence/backup';
import { useLibrary } from '../../state/libraryStore';
import { usePlaytest } from '../../state/playtestStore';
import { ConfirmDialog } from '../../ui/Modal';

type Pending = BackupContents & { playtestUnreadable: boolean; fileName: string };

/** Human "last backup" text, shared with the main menu reminder. */
export function lastBackupText(at: number | null, now = Date.now()): string {
  if (at === null) return 'never';
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function BackupSection() {
  const lastBackupAt = useLibrary((s) => s.settings.lastBackupAt);
  const [file, setFile] = useState<File | null>(null); // prepared export, waiting to be saved
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const fail = (e: unknown) =>
    setMessage({ text: e instanceof BackupError ? e.message : `Something went wrong: ${String(e)}`, error: true });

  async function prepareExport() {
    setMessage(null);
    setBusy('Preparing backup…');
    try {
      await flushPlaytestAutosave();
      setFile(await createBackupFile(undefined, __APP_VERSION__));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const markSaved = () => {
    void useLibrary.getState().updateSettings({ lastBackupAt: Date.now() });
    setFile(null);
    setMessage({ text: 'Backup saved.' });
  };

  async function share(f: File) {
    // Called straight from the tap: Safari only allows share() during a user gesture.
    try {
      await navigator.share({ files: [f], title: f.name });
      markSaved();
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') fail(e); // AbortError = user closed the sheet
    }
  }

  function download(f: File) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    markSaved();
  }

  async function readImport(f: File) {
    setMessage(null);
    setBusy('Reading backup…');
    try {
      const contents = unpackBackup(new Uint8Array(await f.arrayBuffer()));
      setPending({ ...contents, fileName: f.name });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function applyImport(p: Pending) {
    setPending(null);
    setBusy('Restoring…');
    try {
      await flushPlaytestAutosave(); // so a delayed save can't overwrite the restored game
      await restoreBackup(p);
      await Promise.all([useLibrary.getState().load(), usePlaytest.getState().load()]);
      setMessage({
        text: p.playtestUnreadable
          ? 'Backup restored. The playtest inside could not be read, so a new one will start.'
          : 'Backup restored.',
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const canShare = (f: File) => typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });

  return (
    <section className="panel">
      <h3>Backup</h3>
      <p className="muted panel-note backup-note">
        Your cards, images and playtest live only on this device. Save a backup file now and then, for
        example to iCloud Drive. It also moves everything to another device.
      </p>
      <p className={`backup-last${lastBackupAt === null ? ' is-warning' : ''}`}>
        Last backup: <b>{lastBackupText(lastBackupAt)}</b>
      </p>

      {file ? (
        <div className="backup-ready">
          <span>
            Backup ready · {formatBytes(file.size)}
          </span>
          {canShare(file) ? (
            <button className="btn btn-primary" onClick={() => void share(file)}>
              Save to Files…
            </button>
          ) : null}
          <button className={`btn${canShare(file) ? '' : ' btn-primary'}`} onClick={() => download(file)}>
            Download
          </button>
          <button className="btn" onClick={() => setFile(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="backup-actions">
          <button className="btn btn-primary" disabled={busy !== null} onClick={() => void prepareExport()}>
            Export backup
          </button>
          <button className="btn" disabled={busy !== null} onClick={() => importInput.current?.click()}>
            Import backup…
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".zip,application/zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void readImport(f);
            }}
          />
        </div>
      )}

      {busy && <p className="picker-status">{busy}</p>}
      {message && <p className={message.error ? 'picker-problem' : 'picker-status'}>{message.text}</p>}

      {pending && (
        <ConfirmDialog
          title="Replace everything with this backup?"
          message={`${pending.fileName}, saved ${new Date(pending.exportedAt).toLocaleString()}: ${pending.cards.length} cards, ${pending.images.length} images, ${pending.playtest ? 'with' : 'without'} a playtest. Your current cards, images and playtest on this device will be replaced.`}
          confirmLabel="Replace"
          danger
          onConfirm={() => void applyImport(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

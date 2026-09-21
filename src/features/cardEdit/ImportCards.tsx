import { useRef, useState } from 'react';
import type { CardDefinition } from '../../domain/cards/types';
import { CardListFileError, parseCardListFile } from '../../persistence/cardListFile';
import { useLibrary } from '../../state/libraryStore';
import { usePlaytest } from '../../state/playtestStore';
import { Modal } from '../../ui/Modal';

/** "Import…" button: reads a card-list file, then replaces the card list or adds to it. */
export function ImportCardsButton({ onDone }: { onDone: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const existing = useLibrary((s) => s.cards.length);
  const [pending, setPending] = useState<{ fileName: string; cards: CardDefinition[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(file: File) {
    setError(null);
    try {
      setPending({ fileName: file.name, cards: parseCardListFile(await file.text()) });
    } catch (e) {
      setError(e instanceof CardListFileError ? e.message : `Could not read the file: ${String(e)}`);
    }
  }

  async function apply(mode: 'replace' | 'add') {
    if (!pending) return;
    setBusy(true);
    try {
      const library = useLibrary.getState();
      if (mode === 'replace') {
        await library.replaceCards(pending.cards);
        // The running playtest refers to the removed cards: start a fresh one with the new list.
        usePlaytest.getState().reset(pending.cards, useLibrary.getState().settings);
        onDone(`Card list replaced: ${pending.cards.length} cards. A new playtest was started.`);
      } else {
        await library.addCards(pending.cards);
        onDone(`${pending.cards.length} cards added. They join the decks at the next Reset Playtest.`);
      }
      setPending(null);
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={() => input.current?.click()}>
        Import…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void read(f);
        }}
      />
      {error && (
        <Modal onClose={() => setError(null)}>
          <div className="dialog" role="alertdialog" aria-modal="true">
            <h3>Import cards</h3>
            <p>{error}</p>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={() => setError(null)}>
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}
      {pending && (
        <Modal onClose={() => !busy && setPending(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Import cards">
            <h3>
              Import {pending.cards.length} cards
            </h3>
            <p>
              From {pending.fileName}. You have {existing} card{existing === 1 ? '' : 's'} now.
            </p>
            <div className="dialog-actions dialog-actions-stack">
              <button className="btn btn-big btn-danger" disabled={busy} onClick={() => void apply('replace')}>
                Replace all cards
              </button>
              <p className="muted import-note">
                Removes your current cards and starts a new playtest with the imported ones. Images are kept.
              </p>
              <button className="btn btn-big" disabled={busy} onClick={() => void apply('add')}>
                Add to the list
              </button>
              <button className="btn btn-big" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useState } from 'react';
import { cardFieldsDiffer, type CardDefinition } from '../../domain/cards/types';
import { useImageUrl } from '../../images/useImageUrl';
import { useLibrary } from '../../state/libraryStore';
import { ConfirmDialog, Modal } from '../../ui/Modal';
import { Toggle } from '../../ui/Toggle';
import { DefinitionCard } from '../cards/DefinitionCard';
import { CostView } from '../cards/CostView';
import { CostSymbolPad } from './CostSymbolPad';
import { ImagePicker } from './ImagePicker';

/**
 * Edits a copy of the card. Nothing is written until Save; Discard (or tapping outside) throws
 * the copy away, asking first when there are unsaved changes. A new card only exists once saved.
 */
export function CardEditorDialog({
  initial,
  isNew,
  onClose,
}: {
  initial: CardDefinition;
  isNew: boolean;
  onClose: () => void;
}) {
  const saveCard = useLibrary((s) => s.saveCard);
  const playerCount = useLibrary((s) => s.settings.playerCount);
  const sharedDeckOn = useLibrary((s) => s.settings.sharedDeck);
  const events = useLibrary((s) => s.settings.sharedDeckEvents);
  const [draft, setDraft] = useState(initial);
  const [pickingImage, setPickingImage] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageUrl = useImageUrl(draft.imageId, 'thumb');

  const dirty = isNew || cardFieldsDiffer(draft, initial);
  const update = (patch: Partial<CardDefinition>) => setDraft((d) => ({ ...d, ...patch }));
  const discard = () => (dirty ? setConfirmDiscard(true) : onClose());

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveCard(draft);
      onClose();
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  }

  return (
    <Modal onClose={discard}>
      <div className="dialog dialog-wide card-editor" role="dialog" aria-modal="true" aria-label="Edit card">
        <h3>{isNew ? 'New card' : 'Edit card'}</h3>
        <div className="editor-body">
          <div className="editor-preview">
            <DefinitionCard card={draft} variant="full" />
          </div>

          <div className="editor-form">
            <div className="field">
              <span className="field-label">Image</span>
              <button className="image-field" onClick={() => setPickingImage(true)}>
                <span className="image-field-thumb">
                  {imageUrl ? <img src={imageUrl} alt="" draggable={false} /> : null}
                </span>
                <span>{draft.imageId ? 'Change image…' : 'Choose image…'}</span>
              </button>
            </div>

            <label className="field">
              <span className="field-label">Name</span>
              <input
                value={draft.name}
                placeholder="Card name"
                autoComplete="off"
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>

            <div className="field field-cost">
              <label className="field" htmlFor="card-cost">
                <span className="field-label">Cost</span>
              </label>
              <div className="cost-input-row">
                <input
                  id="card-cost"
                  value={draft.cost}
                  placeholder="e.g. {2}{W}"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(e) => update({ cost: e.target.value })}
                />
                <CostView cost={draft.cost} className="row-cost-pips" />
              </div>
              <CostSymbolPad value={draft.cost} onChange={(cost) => update({ cost })} />
            </div>

            <label className="field field-type">
              <span className="field-label">Type</span>
              <input
                value={draft.type}
                placeholder="e.g. Creature"
                autoComplete="off"
                onChange={(e) => update({ type: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field-label">Description</span>
              <textarea
                value={draft.description}
                rows={5}
                placeholder="What the card does"
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>

            <div className="field field-row">
              <span className="field-label">Enabled</span>
              <Toggle
                checked={draft.enabled}
                label="Enabled"
                onChange={(enabled) => update({ enabled })}
              />
              <span className="muted field-hint">
                {draft.enabled ? 'Included in new decks' : 'Left out of new decks'}
              </span>
            </div>

            <div className="field field-row">
              <span className="field-label">Shared deck</span>
              <Toggle
                checked={draft.shared}
                label="Shared deck"
                // A card lives either in the shared deck or on one player's table, never both.
                onChange={(shared) => update(shared ? { shared, boundPlayer: 0 } : { shared })}
              />
              <span className="muted field-hint">
                {!draft.shared
                  ? "Goes into each player's own deck"
                  : sharedDeckOn
                    ? 'Goes only into the shared deck'
                    : 'Goes only into the shared deck (off in Options, so for now left out of the game)'}
              </span>
            </div>

            {draft.shared && (
              <div className="field field-row">
                <span className="field-label">Event number</span>
                <div className="stepper stepper-small">
                  <button
                    className="btn"
                    aria-label="Earlier event"
                    disabled={draft.eventNumber <= 1}
                    onClick={() => update({ eventNumber: draft.eventNumber - 1 })}
                  >
                    −
                  </button>
                  <output className="bound-value" aria-label="Event number">
                    {draft.eventNumber}
                  </output>
                  <button
                    className="btn"
                    aria-label="Later event"
                    disabled={draft.eventNumber >= Math.max(events, draft.eventNumber)}
                    onClick={() => update({ eventNumber: draft.eventNumber + 1 })}
                  >
                    +
                  </button>
                </div>
                <span className="muted field-hint">
                  {draft.eventNumber > events
                    ? `Above the ${events} events set in Options: not dealt`
                    : `Position ${draft.eventNumber} of ${events} in the shared deck (1 = top)`}
                </span>
              </div>
            )}

            <div className="field field-row">
              <span className="field-label">Bound to</span>
              <div className="stepper stepper-small">
                <button
                  className="btn"
                  aria-label="Bind to previous player"
                  disabled={draft.boundPlayer <= 0}
                  onClick={() => update({ boundPlayer: draft.boundPlayer - 1 })}
                >
                  −
                </button>
                <output className="bound-value" aria-label="Player binding">
                  {draft.boundPlayer === 0 ? 'None' : `Player ${draft.boundPlayer}`}
                </output>
                <button
                  className="btn"
                  aria-label="Bind to next player"
                  disabled={draft.shared || draft.boundPlayer >= Math.max(playerCount, draft.boundPlayer)}
                  onClick={() => update({ boundPlayer: draft.boundPlayer + 1 })}
                >
                  +
                </button>
              </div>
              <span className="muted field-hint">
                {draft.shared
                  ? 'Shared-deck cards are not bound'
                  : draft.boundPlayer === 0
                    ? 'Shuffled into every deck'
                    : `Starts on Player ${draft.boundPlayer}'s table, not in the decks`}
              </span>
            </div>

            <div className="field">
              <span className="field-label">ID</span>
              <code className="card-id">{draft.id}</code>
            </div>
          </div>
        </div>

        {error && <p className="picker-problem">{error}</p>}
        <div className="dialog-actions">
          <button className="btn" onClick={discard} disabled={saving}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {pickingImage && (
        <ImagePicker
          selected={draft.imageId}
          onSelect={(imageId) => {
            update({ imageId });
            setPickingImage(false);
          }}
          onClose={() => setPickingImage(false)}
        />
      )}
      {confirmDiscard && (
        <ConfirmDialog
          title={isNew ? 'Discard new card?' : 'Discard changes?'}
          message={isNew ? 'This card will not be created.' : 'Your changes to this card will be lost.'}
          confirmLabel="Discard"
          danger
          onConfirm={onClose}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </Modal>
  );
}

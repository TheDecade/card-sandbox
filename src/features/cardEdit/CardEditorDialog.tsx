import { useState } from 'react';
import { cardFieldsDiffer, type CardDefinition } from '../../domain/cards/types';
import { useImageUrl } from '../../images/useImageUrl';
import { useLibrary } from '../../state/libraryStore';
import { ConfirmDialog, Modal } from '../../ui/Modal';
import { Toggle } from '../../ui/Toggle';
import { DefinitionCard } from '../cards/DefinitionCard';
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

            <label className="field field-cost">
              <span className="field-label">Cost</span>
              <input
                value={draft.cost}
                placeholder="e.g. 3"
                autoComplete="off"
                onChange={(e) => update({ cost: e.target.value })}
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

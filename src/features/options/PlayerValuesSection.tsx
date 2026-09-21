import { useState } from 'react';
import { MAX_PLAYER_VALUES, type PlayerValueDef } from '../../domain/settings/types';
import { newId } from '../../lib/id';
import { useLibrary } from '../../state/libraryStore';
import { ConfirmDialog } from '../../ui/Modal';

/** Create, rename and remove the values every player has (life, poison, …). */
export function PlayerValuesSection() {
  const defs = useLibrary((s) => s.settings.playerValues);
  const [removing, setRemoving] = useState<PlayerValueDef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (playerValues: PlayerValueDef[]) =>
    useLibrary
      .getState()
      .updateSettings({ playerValues })
      .catch((e: unknown) => setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`));

  const update = (id: string, patch: Partial<PlayerValueDef>) =>
    void save(defs.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <section className="panel">
      <h3>Player values</h3>
      <p className="muted panel-note values-note">
        Every player has these, shown under their deck (like life or poison). New values start at
        their starting number for everyone; Reset Playtest puts all values back to their start.
      </p>
      {defs.length === 0 && <p className="muted">No player values.</p>}
      <div className="value-defs">
        {defs.map((d) => (
          <div key={d.id} className="value-def">
            <input
              className="value-def-name"
              aria-label="Value name"
              value={d.name}
              placeholder="Name"
              autoComplete="off"
              onChange={(e) => update(d.id, { name: e.target.value })}
            />
            <span className="muted value-def-start-label">Start</span>
            <StartInput value={d.start} onChange={(start) => update(d.id, { start })} />
            <button className="btn btn-danger" aria-label={`Remove ${d.name || 'value'}`} onClick={() => setRemoving(d)}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn"
        disabled={defs.length >= MAX_PLAYER_VALUES}
        onClick={() => void save([...defs, { id: newId(), name: 'New value', start: 0 }])}
      >
        + Add value
      </button>
      {defs.length >= MAX_PLAYER_VALUES && (
        <span className="muted"> Up to {MAX_PLAYER_VALUES} values fit under the deck.</span>
      )}
      {error && <p className="picker-problem">{error}</p>}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name || 'this value'}?`}
          message="It disappears from every player's table."
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            void save(defs.filter((d) => d.id !== removing.id));
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}

function StartInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <input
      className="value-input"
      aria-label="Starting value"
      inputMode="numeric"
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        if (/^-?\d+$/.test(e.target.value.trim())) onChange(Number(e.target.value));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

import { useEffect, useState } from 'react';
import type { PlayerId, PlayerState } from '../../domain/playtest/types';
import type { PlayerValueDef } from '../../domain/settings/types';
import { usePlaytest } from '../../state/playtestStore';
import { Modal } from '../../ui/Modal';

export const playerValue = (player: PlayerState, def: PlayerValueDef) => player.values[def.id] ?? def.start;

/** Compact list of the current player's values, under the deck. Tap to edit. */
export function PlayerValuesSlot({
  player,
  defs,
  onOpen,
}: {
  player: PlayerState;
  defs: PlayerValueDef[];
  onOpen: () => void;
}) {
  if (defs.length === 0) return null;
  return (
    <button className="player-values" onClick={onOpen} aria-label="Player values">
      {defs.map((d) => (
        <span key={d.id} className="player-value-row">
          <span className="player-value-name">{d.name || 'Value'}</span>
          <span className="player-value-num">{playerValue(player, d)}</span>
        </span>
      ))}
    </button>
  );
}

/** Dial in the current player's values. Changes apply (and save) immediately. */
export function PlayerValuesDialog({
  playerId,
  player,
  defs,
  onClose,
}: {
  playerId: PlayerId;
  player: PlayerState;
  defs: PlayerValueDef[];
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="dialog values-dialog" role="dialog" aria-modal="true" aria-label="Player values">
        <h3>Player {playerId + 1} · values</h3>
        <div className="values-list">
          {defs.map((d) => (
            <ValueRow key={d.id} playerId={playerId} def={d} value={playerValue(player, d)} />
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ValueRow({ playerId, def, value }: { playerId: PlayerId; def: PlayerValueDef; value: number }) {
  const dispatch = usePlaytest((s) => s.dispatch);
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const set = (v: number) => dispatch({ type: 'setPlayerValue', playerId, valueId: def.id, value: v });
  const name = def.name || 'Value';

  return (
    <div className="value-row">
      <span className="value-name">{name}</span>
      <div className="value-controls">
        <button className="btn value-step" aria-label={`${name} minus 5`} onClick={() => set(value - 5)}>
          −5
        </button>
        <button className="btn value-step" aria-label={`${name} minus 1`} onClick={() => set(value - 1)}>
          −1
        </button>
        <input
          className="value-input"
          aria-label={name}
          inputMode="numeric"
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setText(e.target.value);
            if (/^-?\d+$/.test(e.target.value.trim())) set(Number(e.target.value));
          }}
          onBlur={() => setText(String(value))} // drop half-typed input like "-"
        />
        <button className="btn value-step" aria-label={`${name} plus 1`} onClick={() => set(value + 1)}>
          +1
        </button>
        <button className="btn value-step" aria-label={`${name} plus 5`} onClick={() => set(value + 5)}>
          +5
        </button>
      </div>
    </div>
  );
}

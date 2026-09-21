import { useState } from 'react';
import { displayName } from '../../domain/cards/types';
import { COUNTER_COLORS, playerCounterTypes, type CounterColorId } from '../../domain/counters/colors';
import type { InstanceId } from '../../domain/playtest/types';
import type { VisibleCard } from '../../domain/playtest/visibility';
import { usePlaytest } from '../../state/playtestStore';
import { Modal } from '../../ui/Modal';
import { CounterChip, counterBadges } from './PlayCard';

const MAX_AMOUNT = 99;
let lastColor: CounterColorId = COUNTER_COLORS[0]!.id; // remembered while the app is open

/** Long-press dialog: add or remove counters (colors, or player counters p1…pN) on one card instance. */
export function CounterDialog({
  card,
  playerCount,
  onClose,
}: {
  card: VisibleCard;
  playerCount: number; // player counters p1…pN
  onClose: () => void;
}) {
  const dispatch = usePlaytest((s) => s.dispatch);
  const [amount, setAmount] = useState(1);
  const playerTypes = playerCounterTypes(playerCount);
  const [color, setColor] = useState<CounterColorId>(() =>
    COUNTER_COLORS.some((c) => c.id === lastColor) || playerTypes.some((p) => p.id === lastColor)
      ? lastColor
      : COUNTER_COLORS[0]!.id,
  );
  if (card.kind !== 'revealed') return null;

  const current = card.counters[color] ?? 0;
  const badges = counterBadges(card.counters);
  const change = (instanceId: InstanceId, delta: number) => {
    lastColor = color;
    dispatch({ type: 'changeCounters', instanceId, color, delta });
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="dialog counter-dialog" role="dialog" aria-modal="true" aria-label="Counters">
        <h3>Counters · {displayName(card.def)}</h3>
        <div className="current-counters">
          {badges.length === 0 ? (
            <span className="muted">No counters on this card.</span>
          ) : (
            badges.map((b) => <CounterChip key={b.id} badge={b} />)
          )}
        </div>

        <div className="field-label">Amount</div>
        <div className="stepper">
          <button
            className="btn btn-big"
            aria-label="Decrease amount"
            disabled={amount <= 1}
            onClick={() => setAmount((a) => Math.max(1, a - 1))}
          >
            −
          </button>
          <output className="stepper-value" aria-live="polite">
            {amount}
          </output>
          <button
            className="btn btn-big"
            aria-label="Increase amount"
            disabled={amount >= MAX_AMOUNT}
            onClick={() => setAmount((a) => Math.min(MAX_AMOUNT, a + 1))}
          >
            +
          </button>
        </div>

        <div className="field-label">Counter</div>
        <div className="swatches" role="radiogroup" aria-label="Counter type">
          {[...COUNTER_COLORS, ...playerTypes].map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={color === c.id}
              aria-label={c.kind === 'player' ? `Player counter ${c.label}` : c.label}
              className={`swatch${c.kind === 'player' ? ' swatch-player' : ''}${color === c.id ? ' is-selected' : ''}`}
              style={{ background: c.hex }}
              onClick={() => setColor(c.id)}
            >
              {c.kind === 'player' ? c.label : null}
            </button>
          ))}
        </div>

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={current === 0} onClick={() => change(card.instanceId, -amount)}>
            Remove Counters
          </button>
          <button className="btn btn-primary" onClick={() => change(card.instanceId, amount)}>
            Add Counters
          </button>
        </div>
      </div>
    </Modal>
  );
}

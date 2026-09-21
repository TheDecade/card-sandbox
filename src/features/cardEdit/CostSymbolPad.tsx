import { useState } from 'react';
import {
  appendSymbol,
  incrementGeneric,
  MANA_COLOR_KEYS,
  MANA_COLORS,
  removeLastSymbol,
  type ManaColor,
} from '../../domain/cards/cost';

/**
 * Buttons that write cost symbols, so braces never have to be typed on the iPad keyboard.
 * Hybrid: tap "Hybrid", then two colors → {A/B}.
 */
export function CostSymbolPad({ value, onChange }: { value: string; onChange: (cost: string) => void }) {
  const [hybrid, setHybrid] = useState<'off' | 'first' | ManaColor>('off');

  function tapColor(c: ManaColor) {
    if (hybrid === 'off') onChange(appendSymbol(value, c));
    else if (hybrid === 'first') setHybrid(c);
    else {
      onChange(appendSymbol(value, `${hybrid}/${c}`));
      setHybrid('off');
    }
  }

  return (
    <div className="cost-pad">
      <div className="cost-pad-row">
        {MANA_COLOR_KEYS.map((c) => (
          <button
            key={c}
            type="button"
            className={`cost-key cost-key-color${hybrid === c ? ' is-picked' : ''}`}
            style={{ background: MANA_COLORS[c].hex, color: MANA_COLORS[c].text }}
            aria-label={`Add ${MANA_COLORS[c].name}`}
            onClick={() => tapColor(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="cost-pad-row">
        <button type="button" className="cost-key" aria-label="Add 1 generic" onClick={() => onChange(incrementGeneric(value))}>
          +1
        </button>
        <button type="button" className="cost-key" aria-label="Add X" onClick={() => onChange(appendSymbol(value, 'X'))}>
          X
        </button>
        <button
          type="button"
          className={`cost-key cost-key-wide${hybrid !== 'off' ? ' is-active' : ''}`}
          aria-pressed={hybrid !== 'off'}
          onClick={() => setHybrid(hybrid === 'off' ? 'first' : 'off')}
        >
          Hybrid
        </button>
        <button
          type="button"
          className="cost-key"
          aria-label="Remove last symbol"
          onClick={() => {
            setHybrid('off');
            onChange(removeLastSymbol(value));
          }}
        >
          ⌫
        </button>
      </div>
      {hybrid !== 'off' && (
        <p className="cost-pad-hint">{hybrid === 'first' ? 'Hybrid: pick the first color' : 'Hybrid: pick the second color'}</p>
      )}
    </div>
  );
}

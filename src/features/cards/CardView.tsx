import './card.css';
import { CostView } from './CostView';

// Display-only card. Its size comes from the parent's width; all text scales with it.

export interface CardContent {
  name: string;
  cost: string;
  type?: string;
  description: string;
  imageUrl?: string | null;
  artHue?: number; // placeholder art color when there is no image
  counters?: { id: string; hex: string; count: number; label?: string }[];
}

export function CardView({ card, faceUp = true }: { card?: CardContent; faceUp?: boolean }) {
  if (!faceUp || !card) {
    return (
      <div className="card card-back" aria-label="Face-down card">
        <div className="card-back-emblem" />
      </div>
    );
  }
  const hue = card.artHue ?? 150;
  return (
    <div className="card" aria-label={card.name}>
      <div className="card-face">
        <div className="card-head">
          <span className="card-name">{card.name}</span>
          <CostView cost={card.cost} className="card-cost-pips" />
        </div>
        <div
          className="card-art"
          style={
            card.imageUrl
              ? undefined
              : { background: `linear-gradient(135deg, hsl(${hue} 40% 55%), hsl(${hue + 40} 35% 30%))` }
          }
        >
          {card.imageUrl && <img src={card.imageUrl} alt="" draggable={false} />}
          {card.counters && card.counters.length > 0 && (
            <div className="card-counters">
              {card.counters.map((c) =>
                c.label ? (
                  // Player counter: told apart by its label; the count sits in a small bubble.
                  <span key={c.id} className="counter counter-player" style={{ background: c.hex }}>
                    {c.label}
                    <span className="counter-count">{c.count}</span>
                  </span>
                ) : (
                  <span key={c.id} className="counter" style={{ background: c.hex }}>
                    {c.count}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
        {card.type ? <div className="card-type">{card.type}</div> : null}
        <div className="card-text">{card.description}</div>
      </div>
    </div>
  );
}

/** Stable pseudo-random hue from a string (e.g. a card id), for placeholder art. */
export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

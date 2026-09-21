import './card.css';

// Display-only card. Size comes from the parent's width; all text scales with it (container units).
// M2 version uses placeholder art; in M3 it will render a real CardDefinition + image.

export interface CardFace {
  name: string;
  cost: string;
  text: string;
  hue: number; // placeholder art color
  counters: number;
}

export function CardView({ face, faceUp = true }: { face?: CardFace; faceUp?: boolean }) {
  if (!faceUp || !face) {
    return (
      <div className="card card-back" aria-label="Face-down card">
        <div className="card-back-emblem" />
      </div>
    );
  }
  return (
    <div className="card" aria-label={face.name}>
      <div className="card-face">
        <div className="card-head">
          <span className="card-name">{face.name}</span>
          <span className="card-cost">{face.cost}</span>
        </div>
        <div
          className="card-art"
          style={{ background: `linear-gradient(135deg, hsl(${face.hue} 45% 55%), hsl(${face.hue + 40} 40% 32%))` }}
        >
          {face.counters > 0 && (
            <div className="card-counters">
              <span className="counter" style={{ background: '#e5484d' }}>
                {face.counters}
              </span>
            </div>
          )}
        </div>
        <div className="card-text">{face.text}</div>
      </div>
    </div>
  );
}

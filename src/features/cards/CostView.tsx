import { MANA_COLORS, parseCost, type CostPart, type CostToken } from '../../domain/cards/cost';

const GENERIC = { hex: '#cbc5b9', text: '#2b2924' };

function partColor(p: CostPart) {
  return p.kind === 'color' ? MANA_COLORS[p.color] : GENERIC;
}

function Pip({ token }: { token: CostToken }) {
  switch (token.kind) {
    case 'plain': // cost written without braces: one circle, as before
      return <span className="pip pip-plain">{token.text}</span>;
    case 'generic':
      return (
        <span className="pip" style={{ background: GENERIC.hex, color: GENERIC.text }}>
          {token.value}
        </span>
      );
    case 'x':
      return (
        <span className="pip" style={{ background: GENERIC.hex, color: GENERIC.text }}>
          X
        </span>
      );
    case 'color': {
      const c = MANA_COLORS[token.color];
      return <span className="pip" style={{ background: c.hex }} aria-label={c.name} title={c.name} />;
    }
    case 'hybrid': {
      // A circle split diagonally between the colors (generic halves show their number).
      const colors = token.parts.map(partColor);
      const step = 100 / colors.length;
      const stops = colors.map((c, i) => `${c.hex} ${i * step}% ${(i + 1) * step}%`).join(', ');
      const label = token.parts.map((p) => (p.kind === 'color' ? MANA_COLORS[p.color].name : p.value)).join('/');
      const generic = token.parts.find((p) => p.kind === 'generic');
      return (
        <span
          className="pip pip-hybrid"
          style={{ background: `linear-gradient(135deg, ${stops})`, color: GENERIC.text }}
          aria-label={label}
          title={label}
        >
          {generic?.kind === 'generic' ? <span className="pip-hybrid-num">{generic.value}</span> : null}
        </span>
      );
    }
    case 'unknown':
      return <span className="pip pip-unknown">{token.text}</span>;
  }
}

/** A card cost drawn as mana-style symbols. Renders nothing for an empty cost. */
export function CostView({ cost, className = '' }: { cost: string; className?: string }) {
  const tokens = parseCost(cost);
  if (tokens.length === 0) return null;
  return (
    <span className={`cost ${className}`} aria-label={`Cost ${cost}`}>
      {tokens.map((t, i) => (
        <Pip key={i} token={t} />
      ))}
    </span>
  );
}

import { useRef } from 'react';
import { parseRichText } from '../../domain/cards/richText';
import './card.css';
import { CostView } from './CostView';
import { useFitText } from './useFitText';

// Display-only card. Its size comes from the parent's width; all text scales with it.

export interface CardContent {
  name: string;
  cost: string;
  type?: string;
  subtype?: string;
  description: string;
  imageUrl?: string | null;
  artHue?: number; // placeholder art color when there is no image
  counters?: { id: string; hex: string; count: number; label?: string }[];
  blank?: boolean; // custom token: a plain card with nothing but its text
}

export function CardView({ card, faceUp = true }: { card?: CardContent; faceUp?: boolean }) {
  if (!faceUp || !card) {
    return <CardBack />;
  }
  return <CardFace card={card} />;
}

function CardBack() {
  return (
    <div className="card card-back" aria-label="Face-down card">
      <div className="card-back-emblem" />
    </div>
  );
}

function CardFace({ card }: { card: CardContent }) {
  return card.blank ? <BlankFace card={card} /> : <FullFace card={card} />;
}

function Counters({ counters }: { counters: CardContent['counters'] }) {
  if (!counters || counters.length === 0) return null;
  return (
    <div className="card-counters">
      {counters.map((c) =>
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
  );
}

function BlankFace({ card }: { card: CardContent }) {
  const textRef = useRef<HTMLDivElement>(null);
  useFitText(textRef, card.description, { min: 0.5 });
  return (
    <div className="card card-blank" aria-label={card.name}>
      <Counters counters={card.counters} />
      <div className="card-face">
        <div ref={textRef} className="card-text">
          <RichText text={card.description} />
        </div>
      </div>
    </div>
  );
}

/** Card text with its **bold** and *italic* markup drawn. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((s, i) => {
        const out = s.italic ? <em>{s.text}</em> : s.text;
        return <span key={i}>{s.bold ? <strong>{out}</strong> : out}</span>;
      })}
    </>
  );
}

function FullFace({ card }: { card: CardContent }) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // Long names and texts shrink to fit; text that still doesn't fit can be scrolled.
  useFitText(nameRef, `${card.name}|${card.cost}`, { min: 0.7, maxLines: 2 });
  useFitText(textRef, card.description, { min: 0.5 });
  const hue = card.artHue ?? 150;
  return (
    <div className="card" aria-label={card.name}>
      <div className="card-face">
        <div className="card-head">
          <span ref={nameRef} className="card-name">
            {card.name}
          </span>
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
          <Counters counters={card.counters} />
        </div>
        {card.type || card.subtype ? (
          <div className="card-type">
            {card.type}
            {card.type && card.subtype ? ' - ' : ''}
            {card.subtype && <span className="card-subtype">{card.subtype}</span>}
          </div>
        ) : null}
        <div ref={textRef} className="card-text">
          <RichText text={card.description} />
        </div>
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

import { useRef } from 'react';
import { useDropZone } from '../../gestures/dropZones';
import type { Point } from '../../gestures/recognizer';
import { useGestures } from '../../gestures/useGestures';
import { CardView } from '../cards/CardView';
import { offsetToCentre } from './PlayCard';

/** A face-down deck: tap for its menu, drag to draw the top card. Also used for the shared deck. */
export function DeckZone(props: {
  zoneId?: 'deck' | 'sharedDeck';
  label?: string;
  count: number;
  elRef: (el: HTMLDivElement | null) => void;
  onTap: () => void;
  onDragStart: (start: Point, offset: Point) => void;
  onDragMove: (p: Point) => void;
  onDragEnd: (p: Point) => void;
  onDragCancel: () => void;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const zoneId = props.zoneId ?? 'deck';
  const label = props.label ?? 'Deck';
  const zone = useDropZone(zoneId, 2);
  const bind = useGestures({
    onTap: props.onTap,
    onDragStart:
      props.count > 0 ? ({ start }) => props.onDragStart(start, offsetToCentre(el.current, start)) : undefined,
    onDragMove: props.onDragMove,
    onDragEnd: props.onDragEnd,
    onDragCancel: props.onDragCancel,
  });
  return (
    <div
      {...bind}
      ref={(node) => {
        el.current = node;
        zone(node);
        props.elRef(node);
      }}
      className={`deck drop-zone${zoneId === 'sharedDeck' ? ' deck-shared' : ''}${props.count === 0 ? ' is-empty' : ''}`}
      aria-label={`${label}, ${props.count} cards`}
    >
      {zoneId === 'sharedDeck' && <span className="deck-label">{label}</span>}
      {props.count > 0 ? <CardView faceUp={false} /> : <span className="deck-empty">Empty</span>}
      <span className="badge">{props.count}</span>
    </div>
  );
}

export type Pile = 'graveyard' | 'exile';
export const PILE_LABEL: Record<Pile, string> = { graveyard: 'Graveyard', exile: 'Exile' };

export function PileZone({ pile, count, onTap }: { pile: Pile; count: number; onTap: () => void }) {
  const zone = useDropZone(pile, 2);
  const bind = useGestures({ onTap });
  return (
    <div
      {...bind}
      ref={zone}
      className={`pile pile-${pile} drop-zone`}
      aria-label={`${PILE_LABEL[pile]}, ${count} cards`}
    >
      <span className="pile-label">{PILE_LABEL[pile]}</span>
      <span className="pile-count">{count}</span>
    </div>
  );
}

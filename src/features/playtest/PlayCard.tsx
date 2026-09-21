import { useRef, useState, type CSSProperties } from 'react';
import { COUNTER_COLORS } from '../../domain/counters/colors';
import type { CardInstance } from '../../domain/playtest/types';
import type { VisibleCard } from '../../domain/playtest/visibility';
import type { ImageVariant } from '../../domain/images/types';
import type { Point } from '../../gestures/recognizer';
import { useGestures } from '../../gestures/useGestures';
import { CardView, type CardContent } from '../cards/CardView';
import { DefinitionCard } from '../cards/DefinitionCard';

/** Counters in registry order, for display. Unknown colors are skipped. */
export function counterBadges(counters: CardInstance['counters']): CardContent['counters'] {
  return COUNTER_COLORS.flatMap((c) => {
    const count = counters[c.id] ?? 0;
    return count > 0 ? [{ id: c.id, hex: c.hex, count }] : [];
  });
}

/** Renders what the player may see of a card: its back, or its face with counters. */
export function VisibleCardView({ card, variant = 'thumb' }: { card: VisibleCard; variant?: ImageVariant }) {
  if (card.kind === 'hidden') return <CardView faceUp={false} />;
  if (card.kind === 'missing') {
    return <CardView card={{ name: 'Missing card', cost: '', description: 'This card no longer exists.' }} />;
  }
  return <DefinitionCard card={card.def} variant={variant} counters={counterBadges(card.counters)} />;
}

export interface CardActions {
  onTap: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onDragStart: (start: Point, offset: Point) => void;
  onDragMove: (p: Point) => void;
  onDragEnd: (p: Point) => void;
  onDragCancel: () => void;
}

/** Offset from a touch point to the centre of an element (so a card doesn't jump to the finger). */
export function offsetToCentre(el: HTMLElement | null, from: Point): Point {
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - from.x, y: r.top + r.height / 2 - from.y };
}

/** A card on the table or in the hand, wired to the gesture recognizer. */
export function PlayCard({
  card,
  actions,
  dragging,
  style,
}: {
  card: VisibleCard;
  actions: CardActions;
  dragging: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pressing, setPressing] = useState(false);
  const bind = useGestures({
    onTap: actions.onTap,
    onDoubleTap: actions.onDoubleTap,
    onLongPress: actions.onLongPress,
    onPressChange: setPressing,
    onDragStart: ({ start }) => actions.onDragStart(start, offsetToCentre(ref.current, start)),
    onDragMove: actions.onDragMove,
    onDragEnd: actions.onDragEnd,
    onDragCancel: actions.onDragCancel,
  });
  return (
    <div
      ref={ref}
      {...bind}
      data-card-id={card.instanceId}
      data-pressing={pressing || undefined}
      className={`table-card${dragging ? ' is-dragging' : ''}`}
      style={style}
    >
      <VisibleCardView card={card} />
    </div>
  );
}

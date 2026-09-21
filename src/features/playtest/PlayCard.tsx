import { useRef, useState, type CSSProperties } from 'react';
import { counterSortKey, counterType } from '../../domain/counters/colors';
import type { CardInstance } from '../../domain/playtest/types';
import type { VisibleCard } from '../../domain/playtest/visibility';
import type { ImageVariant } from '../../domain/images/types';
import type { Point } from '../../gestures/recognizer';
import { useGestures } from '../../gestures/useGestures';
import { CardView, type CardContent } from '../cards/CardView';
import { DefinitionCard } from '../cards/DefinitionCard';

/** Counters for display: colors first, then player counters (which carry a label). */
export function counterBadges(counters: CardInstance['counters']): NonNullable<CardContent['counters']> {
  return Object.entries(counters)
    .flatMap(([id, count]) => {
      const type = counterType(id);
      if (!type || !count || count <= 0) return [];
      return [{ id, hex: type.hex, count, label: type.kind === 'player' ? type.label : undefined }];
    })
    .sort((a, b) => counterSortKey(a.id) - counterSortKey(b.id));
}

/** Compact "● 3" / "p2 3" chip for lists and dialogs. */
export function CounterChip({ badge }: { badge: ReturnType<typeof counterBadges>[number] }) {
  return (
    <span className="counter-chip">
      {badge.label ? (
        <span className="counter-dot counter-dot-player" style={{ background: badge.hex }}>
          {badge.label}
        </span>
      ) : (
        <span className="counter-dot" style={{ background: badge.hex }} />
      )}
      {badge.count}
    </span>
  );
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
  canStartDrag?: (start: Point, point: Point) => boolean;
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
    canStartDrag: actions.canStartDrag,
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

// M2 gesture test table. Uses the real gesture system (src/gestures) with throwaway local state;
// the real playtest table (M4) replaces this and reuses the gestures, CardView and drop zones.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGestureConfig } from '../../gestures/config';
import { getDropZoneRect, hitTestDropZone, setDropHover, useDropZone } from '../../gestures/dropZones';
import type { Point } from '../../gestures/recognizer';
import { useGestures } from '../../gestures/useGestures';
import { Modal } from '../../ui/Modal';
import { CardView, type CardContent } from '../cards/CardView';
import { GestureSettings } from './GestureSettings';
import './table.css';

type Pile = 'graveyard' | 'exile';
type DropTarget = 'canvas' | 'hand' | 'deck' | Pile;

interface LabCard {
  id: string;
  name: string;
  cost: string;
  text: string;
  hue: number;
  counters: number;
  tapped: boolean;
  x: number; // normalized canvas position of the card centre (0..1)
  y: number;
}

interface LabState {
  cards: Record<string, LabCard>;
  canvas: string[]; // z-order, last on top
  hand: string[];
  graveyard: string[];
  exile: string[];
  deck: number;
  next: number;
}

type DragSource = { kind: 'deck' } | { kind: 'card'; id: string };
interface Drag {
  source: DragSource;
  start: Point;
  point: Point;
  offset: Point; // from the finger to the card centre, so the card doesn't jump under the finger
}

const CARD_TEXT = 'Drag me. Tap to magnify, double-tap to tap, hold for counters.';

function makeCard(n: number): LabCard {
  return {
    id: `c${n}`,
    name: `Test Card ${n}`,
    cost: String((n % 5) + 1),
    text: CARD_TEXT,
    hue: (n * 67) % 360,
    counters: 0,
    tapped: false,
    x: 0.5,
    y: 0.5,
  };
}

function initialState(): LabState {
  const onTable = [
    { ...makeCard(1), x: 0.4, y: 0.4 },
    { ...makeCard(2), x: 0.55, y: 0.45 },
    { ...makeCard(3), x: 0.7, y: 0.4 },
  ];
  const inHand = [makeCard(4), makeCard(5)];
  return {
    cards: Object.fromEntries([...onTable, ...inHand].map((c) => [c.id, c])),
    canvas: onTable.map((c) => c.id),
    hand: inHand.map((c) => c.id),
    graveyard: [],
    exile: [],
    deck: 20,
    next: 6,
  };
}

function removeEverywhere(s: LabState, id: string): LabState {
  const without = (ids: string[]) => ids.filter((x) => x !== id);
  return {
    ...s,
    canvas: without(s.canvas),
    hand: without(s.hand),
    graveyard: without(s.graveyard),
    exile: without(s.exile),
  };
}

const labContent = (c: LabCard): CardContent => ({
  name: c.name,
  cost: c.cost,
  description: c.text,
  artHue: c.hue,
  counters: c.counters > 0 ? [{ id: 'red', hex: '#e5484d', count: c.counters }] : [],
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ghostTransform = (p: Point, tapped: boolean) =>
  `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${tapped ? 90 : 0}deg) scale(1.06)`;

export function GestureLab({ onBack }: { onBack: () => void }) {
  const config = useGestureConfig();
  const [state, setState] = useState(initialState);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [magnified, setMagnified] = useState<string | null>(null);
  const [countersFor, setCountersFor] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  // The live drag also sits in a ref: pointer events can arrive before React re-renders.
  const dragRef = useRef<Drag | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const deckEl = useRef<HTMLDivElement | null>(null);
  const handEl = useRef<HTMLDivElement | null>(null);
  const canvasZone = useDropZone('canvas', 0);
  const handZone = useDropZone('hand', 1);
  const deckZone = useDropZone('deck', 2);

  const addLog = (msg: string) => setLog((l) => [msg, ...l].slice(0, 8));
  const nameOf = (id: string) => state.cards[id]?.name ?? id;
  const cardWidth = () => deckEl.current?.offsetWidth ?? 100;

  // ---------- dragging ----------
  const beginDrag = (source: DragSource, start: Point, point: Point, offset: Point) => {
    dragRef.current = { source, start, point, offset };
    setDrag(dragRef.current);
  };

  const moveDrag = (p: Point) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.point = p;
    const tapped = drag.source.kind === 'card' && !!state.cards[drag.source.id]?.tapped;
    const centre = { x: p.x + drag.offset.x, y: p.y + drag.offset.y };
    if (ghostRef.current) ghostRef.current.style.transform = ghostTransform(centre, tapped);
    setDropHover(hitTestDropZone(p));
  };

  const cancelDrag = (reason: string) => {
    dragRef.current = null;
    setDropHover(null);
    setDrag(null);
    addLog(reason);
  };

  const endDrag = (p: Point) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDropHover(null);
    setDrag(null);
    const target = hitTestDropZone(p) as DropTarget | null;
    const dist = Math.round(Math.hypot(p.x - drag.start.x, p.y - drag.start.y));
    if (!target || (drag.source.kind === 'deck' && target === 'deck')) {
      addLog(`drag cancelled · ${dist} px`);
      return;
    }
    const draggedId = drag.source.kind === 'card' ? drag.source.id : null;
    const centre = { x: p.x + drag.offset.x, y: p.y + drag.offset.y };
    const canvasPos = toCanvasPos(centre, draggedId ? !!state.cards[draggedId]?.tapped : false);
    const handIndex = handIndexAt(centre.x, draggedId);

    setState((s) => {
      let next = s;
      let card: LabCard;
      if (drag.source.kind === 'deck') {
        if (s.deck === 0) return s;
        card = makeCard(s.next);
        next = { ...s, deck: s.deck - 1, next: s.next + 1 };
      } else {
        const existing = s.cards[drag.source.id];
        if (!existing) return s;
        card = existing;
        next = removeEverywhere(s, card.id);
      }

      if (target === 'deck') {
        const cards = { ...next.cards };
        delete cards[card.id];
        return { ...next, cards, deck: next.deck + 1 };
      }
      if (target === 'canvas') {
        card = { ...card, ...canvasPos };
        next = { ...next, canvas: [...next.canvas, card.id] };
      } else {
        card = { ...card, tapped: false };
        if (target === 'hand') {
          const hand = [...next.hand];
          hand.splice(handIndex, 0, card.id);
          next = { ...next, hand };
        } else {
          next = { ...next, [target]: [...next[target], card.id] };
        }
      }
      return { ...next, cards: { ...next.cards, [card.id]: card } };
    });
    addLog(`drag → ${target} · ${dist} px`);
  };

  function toCanvasPos(centre: Point, tapped: boolean) {
    const r = getDropZoneRect('canvas');
    if (!r) return { x: 0.5, y: 0.5 };
    const w = cardWidth();
    const h = (w * 88) / 63;
    const [halfW, halfH] = tapped ? [h / 2, w / 2] : [w / 2, h / 2];
    return {
      x: clamp((centre.x - r.left) / r.width, halfW / r.width, 1 - halfW / r.width),
      y: clamp((centre.y - r.top) / r.height, halfH / r.height, 1 - halfH / r.height),
    };
  }

  function handIndexAt(x: number, excludeId: string | null) {
    const els = handEl.current?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [];
    let index = 0;
    for (const el of els) {
      if (el.dataset.cardId === excludeId) continue;
      const r = el.getBoundingClientRect();
      if (r.left + r.width / 2 < x) index++;
    }
    return index;
  }

  // ---------- card actions ----------
  const updateCard = (id: string, patch: Partial<LabCard>) =>
    setState((s) => {
      const card = s.cards[id];
      return card ? { ...s, cards: { ...s.cards, [id]: { ...card, ...patch } } } : s;
    });

  const cardActions = (id: string, where: 'canvas' | 'hand'): CardActions => ({
    onTap: (pressMs) => {
      addLog(`tap · ${nameOf(id)} · ${Math.round(pressMs)} ms press`);
      setMagnified(id);
    },
    onDoubleTap:
      where === 'canvas'
        ? (gapMs) => {
            const tapped = !state.cards[id]?.tapped;
            updateCard(id, { tapped });
            addLog(`double-tap · ${tapped ? 'tapped' : 'untapped'} · ${Math.round(gapMs)} ms gap`);
          }
        : undefined,
    onLongPress: () => {
      addLog(`long-press · ${nameOf(id)}`);
      setCountersFor(id);
    },
    onDragStart: (start, point, offset) => {
      if (where === 'canvas') {
        // Bring to front as soon as it's picked up.
        setState((s) => ({ ...s, canvas: [...s.canvas.filter((x) => x !== id), id] }));
      }
      beginDrag({ kind: 'card', id }, start, point, offset);
    },
    onDragMove: moveDrag,
    onDragEnd: endDrag,
    onDragCancel: () => cancelDrag('drag cancelled by system'),
  });

  // Hand cards overlap when they don't fit.
  const [handWidth, setHandWidth] = useState(0);
  useEffect(() => {
    const el = handEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHandWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const handGap = (() => {
    const n = state.hand.length;
    if (n < 2) return 8;
    const w = cardWidth();
    return Math.min(8, (handWidth - 24 - n * w) / (n - 1));
  })();

  const draggedCard = drag?.source.kind === 'card' ? state.cards[drag.source.id] : undefined;
  const magnifiedCard = magnified ? state.cards[magnified] : undefined;
  const counterCard = countersFor ? state.cards[countersFor] : undefined;

  return (
    <div className="table" style={{ '--lp-ms': `${config.longPressMs}ms` } as CSSProperties}>
      <header className="table-bar">
        <button className="btn" onClick={onBack} aria-label="Back to menu">
          ‹ Menu
        </button>
        <div className="table-title">Player 1 · gesture test</div>
        <button className="btn" onClick={() => setShowSettings(true)}>
          Gesture settings
        </button>
      </header>

      <div className="table-main">
        <div className="canvas drop-zone" ref={canvasZone}>
          {/* Rendered in a stable order and stacked with z-index: moving a DOM node mid-drag
              would make the browser release the pointer capture and cancel the drag. */}
          {[...state.canvas].sort().map((id) => {
            const card = state.cards[id];
            if (!card) return null;
            const z = state.canvas.indexOf(id);
            return (
              <TableCard
                key={id}
                card={card}
                actions={cardActions(id, 'canvas')}
                dragging={draggedCard?.id === id}
                style={{
                  left: `${card.x * 100}%`,
                  top: `${card.y * 100}%`,
                  zIndex: z + 1,
                  ...({ '--rot': card.tapped ? '90deg' : '0deg' } as CSSProperties),
                }}
              />
            );
          })}
        </div>

        <div className="corner">
          <div className="piles">
            <PileZone pile="graveyard" count={state.graveyard.length} onTap={addLog} />
            <PileZone pile="exile" count={state.exile.length} onTap={addLog} />
          </div>
          <DeckZone
            count={state.deck}
            elRef={(el) => {
              deckEl.current = el;
              deckZone(el);
            }}
            onTap={() => addLog(`tap · deck (${state.deck} cards) · shuffle dialog comes in M4`)}
            onDragStart={(start, point, offset) => beginDrag({ kind: 'deck' }, start, point, offset)}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
            onDragCancel={() => cancelDrag('drag cancelled by system')}
          />
        </div>

        <ol className="gesture-log" aria-live="polite">
          {log.length === 0 && <li className="muted">Gestures you make will be listed here.</li>}
          {log.map((line, i) => (
            <li key={`${log.length - i}`}>{line}</li>
          ))}
        </ol>
      </div>

      <footer className="hand-bar">
        <button className="nav-arrow" aria-label="Previous player" onClick={() => addLog('previous player (M5)')}>
          ‹
        </button>
        <div
          className="hand drop-zone"
          ref={(el) => {
            handEl.current = el;
            handZone(el);
          }}
        >
          {state.hand.length === 0 && <span className="hand-empty">Hand</span>}
          {state.hand.map((id, i) => {
            const card = state.cards[id];
            if (!card) return null;
            return (
              <TableCard
                key={id}
                card={card}
                actions={cardActions(id, 'hand')}
                dragging={draggedCard?.id === id}
                style={{ marginLeft: i === 0 ? 0 : handGap }}
              />
            );
          })}
        </div>
        <button className="nav-arrow" aria-label="Next player" onClick={() => addLog('next player (M5)')}>
          ›
        </button>
      </footer>

      {drag && (
        <div
          ref={ghostRef}
          className="drag-ghost"
          style={{
            transform: ghostTransform(
              {
                x: (dragRef.current ?? drag).point.x + drag.offset.x,
                y: (dragRef.current ?? drag).point.y + drag.offset.y,
              },
              !!draggedCard?.tapped,
            ),
          }}
        >
          <CardView card={draggedCard && labContent(draggedCard)} faceUp={drag.source.kind === 'card'} />
        </div>
      )}

      {magnifiedCard && (
        <Modal className="scrim magnify-scrim" onClose={() => setMagnified(null)}>
          <div className="magnify-card">
            <CardView card={labContent(magnifiedCard)} />
          </div>
        </Modal>
      )}

      {counterCard && (
        <Modal onClose={() => setCountersFor(null)}>
          <div className="dialog" role="dialog" aria-modal="true">
            <h3>Counters · {counterCard.name}</h3>
            <p>Test version: one red counter type. The full dialog with colors comes in M5.</p>
            <div className="counter-row">
              <button
                className="btn btn-big"
                aria-label="Remove counter"
                onClick={() => updateCard(counterCard.id, { counters: Math.max(0, counterCard.counters - 1) })}
              >
                −
              </button>
              <span className="counter-value">{counterCard.counters}</span>
              <button
                className="btn btn-big"
                aria-label="Add counter"
                onClick={() => updateCard(counterCard.id, { counters: counterCard.counters + 1 })}
              >
                +
              </button>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={() => setCountersFor(null)}>
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showSettings && <GestureSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

interface CardActions {
  onTap: (pressMs: number) => void;
  onDoubleTap?: (gapMs: number) => void;
  onLongPress: () => void;
  onDragStart: (start: Point, point: Point, offset: Point) => void;
  onDragMove: (p: Point) => void;
  onDragEnd: (p: Point) => void;
  onDragCancel: () => void;
}

/** Offset from the touch point to the centre of an element. */
function offsetToCentre(el: HTMLElement | null, from: Point): Point {
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - from.x, y: r.top + r.height / 2 - from.y };
}

function TableCard({
  card,
  actions,
  dragging,
  style,
}: {
  card: LabCard;
  actions: CardActions;
  dragging: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pressing, setPressing] = useState(false);
  const bind = useGestures({
    onTap: ({ pressMs }) => actions.onTap(pressMs),
    onDoubleTap: actions.onDoubleTap && (({ gapMs }) => actions.onDoubleTap?.(gapMs)),
    onLongPress: actions.onLongPress,
    onPressChange: setPressing,
    onDragStart: ({ start, point }) => actions.onDragStart(start, point, offsetToCentre(ref.current, start)),
    onDragMove: actions.onDragMove,
    onDragEnd: actions.onDragEnd,
    onDragCancel: actions.onDragCancel,
  });
  return (
    <div
      ref={ref}
      {...bind}
      data-card-id={card.id}
      data-pressing={pressing || undefined}
      className={`table-card${dragging ? ' is-dragging' : ''}`}
      style={style}
    >
      <CardView card={labContent(card)} />
    </div>
  );
}

function DeckZone(props: {
  count: number;
  elRef: (el: HTMLDivElement | null) => void;
  onTap: () => void;
  onDragStart: (start: Point, point: Point, offset: Point) => void;
  onDragMove: (p: Point) => void;
  onDragEnd: (p: Point) => void;
  onDragCancel: () => void;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const bind = useGestures({
    onTap: props.onTap,
    onDragStart:
      props.count > 0
        ? ({ start, point }) => props.onDragStart(start, point, offsetToCentre(el.current, start))
        : undefined,
    onDragMove: props.onDragMove,
    onDragEnd: props.onDragEnd,
    onDragCancel: props.onDragCancel,
  });
  return (
    <div
      {...bind}
      ref={(node) => {
        el.current = node;
        props.elRef(node);
      }}
      className={`deck drop-zone${props.count === 0 ? ' is-empty' : ''}`}
      aria-label={`Deck, ${props.count} cards`}
    >
      {props.count > 0 ? <CardView faceUp={false} /> : <span className="deck-empty">Empty</span>}
      <span className="badge">{props.count}</span>
    </div>
  );
}

function PileZone({ pile, count, onTap }: { pile: Pile; count: number; onTap: (msg: string) => void }) {
  const zone = useDropZone(pile, 2);
  const label = pile === 'graveyard' ? 'Graveyard' : 'Exile';
  const bind = useGestures({
    onTap: () => onTap(`tap · ${label} (${count}) · list dialog comes in M5`),
  });
  return (
    <div {...bind} ref={zone} className={`pile pile-${pile} drop-zone`} aria-label={`${label}, ${count} cards`}>
      <span className="pile-label">{label}</span>
      <span className="pile-count">{count}</span>
    </div>
  );
}

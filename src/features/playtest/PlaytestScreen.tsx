import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CardDefinition, CardId } from '../../domain/cards/types';
import type { PlaytestCommand, ZoneTarget } from '../../domain/playtest/commands';
import type { InstanceId, PlaytestState, Vec2 } from '../../domain/playtest/types';
import { viewCard, type VisibleCard } from '../../domain/playtest/visibility';
import { useGestureConfig } from '../../gestures/config';
import { useGestures } from '../../gestures/useGestures';
import { getDropZoneRect, hitTestDropZone, setDropHover, useDropZone } from '../../gestures/dropZones';
import type { Point } from '../../gestures/recognizer';
import { useLibrary } from '../../state/libraryStore';
import { usePlaytest } from '../../state/playtestStore';
import { ConfirmDialog, Modal } from '../../ui/Modal';
import { CardView } from '../cards/CardView';
import { CounterDialog } from './CounterDialog';
import { GestureSettings } from './GestureSettings';
import { PileListDialog } from './PileListDialog';
import { PlayerValuesDialog, PlayerValuesSlot } from './PlayerValues';
import { PlayCard, VisibleCardView, type CardActions } from './PlayCard';
import { DeckZone, PileZone, type Pile } from './Zones';
import { useCanvasZoom } from './useCanvasZoom';
import './table.css';

type DropTarget = 'canvas' | 'hand' | 'deck' | 'sharedDeck' | Pile;
type DragSource = { kind: 'deck' | 'sharedDeck' | 'card'; instanceId: InstanceId };
interface Drag {
  id: number; // new ghost element per drag, so a finishing snap-back never affects the next drag
  source: DragSource;
  point: Point;
  offset: Point; // finger → card centre
  scale: number; // canvas zoom for cards picked up from the table, so they keep their size
}

let dragCounter = 0;
const SNAP_BACK_MS = 180;
const SWIPE_MIN_PX = 60; // horizontal distance for a swipe on the table to switch player

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ghostTransform = (p: Point, tapped: boolean, scale: number, lift = 1.06) =>
  `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${tapped ? 90 : 0}deg) scale(${scale * lift})`;

/** Starts a playtest on first entry, then shows the table. */
export function PlaytestScreen({ onBack }: { onBack: () => void }) {
  const state = usePlaytest((s) => s.state);
  useEffect(() => {
    if (!state) {
      const { cards, settings } = useLibrary.getState();
      usePlaytest.getState().ensureStarted(cards, settings);
    }
  }, [state]);
  return state ? <Table state={state} onBack={onBack} /> : null;
}

function Table({ state, onBack }: { state: PlaytestState; onBack: () => void }) {
  const config = useGestureConfig();
  const cards = useLibrary((s) => s.cards);
  const dispatch = usePlaytest((s) => s.dispatch);
  const saveError = usePlaytest((s) => s.saveError);
  const valueDefs = useLibrary((s) => s.settings.playerValues);
  const sharedDeckEvents = useLibrary((s) => s.settings.sharedDeckEvents);

  const defs = useMemo(() => new Map<CardId, CardDefinition>(cards.map((c) => [c.id, c])), [cards]);
  const view = (id: InstanceId): VisibleCard => viewCard(state, (d) => defs.get(d), id);

  const playerId = state.currentPlayer;
  const player = state.players[playerId]!;
  const playerCount = state.players.length;

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null); // pointer events can outrun React renders
  const ghostRef = useRef<HTMLDivElement>(null);
  const deckEl = useRef<HTMLDivElement | null>(null);
  const sharedDeckEl = useRef<HTMLDivElement | null>(null);
  const handEl = useRef<HTMLDivElement | null>(null);
  const canvasZone = useDropZone('canvas', 0);
  const handZone = useDropZone('hand', 1);
  const zoom = useCanvasZoom();

  const [magnified, setMagnified] = useState<InstanceId | null>(null);
  const [counterFor, setCounterFor] = useState<InstanceId | null>(null);
  const [openPile, setOpenPile] = useState<Pile | null>(null);
  const [deckDrop, setDeckDrop] = useState<InstanceId | null>(null);
  const [dialog, setDialog] = useState<'deck' | 'sharedDeck' | 'menu' | 'gestures' | 'reset' | 'values' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = (msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2200);
  };
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const cardWidth = () => deckEl.current?.offsetWidth ?? 100;
  const isTapped = (id: InstanceId) => !!state.instances[id]?.tapped;

  // ---------- dragging ----------
  function beginDrag(source: DragSource, start: Point, offset: Point) {
    const onCanvas = source.kind === 'card' && state.instances[source.instanceId]?.zone === 'canvas';
    dragRef.current = { id: ++dragCounter, source, point: start, offset, scale: onCanvas ? zoom.view.current.zoom : 1 };
    setDrag(dragRef.current);
  }

  function moveDrag(p: Point) {
    const d = dragRef.current;
    if (!d) return;
    d.point = p;
    const centre = { x: p.x + d.offset.x, y: p.y + d.offset.y };
    const ghost = ghostRef.current;
    if (ghost) ghost.style.transform = ghostTransform(centre, isTapped(d.source.instanceId), d.scale);
    setDropHover(hitTestDropZone(p));
  }

  function finishDrag() {
    dragRef.current = null;
    setDropHover(null);
    setDrag(null);
  }

  /** The card slides back to where it was picked up, then the original reappears. */
  function snapBack() {
    const d = dragRef.current;
    dragRef.current = null;
    setDropHover(null);
    if (!d) return;
    const ghost = ghostRef.current;
    const origin =
      d.source.kind === 'deck'
        ? deckEl.current
        : d.source.kind === 'sharedDeck'
          ? sharedDeckEl.current
          : document.querySelector<HTMLElement>(`[data-card-id="${d.source.instanceId}"]`);
    if (!ghost || !origin) {
      setDrag(null);
      return;
    }
    const r = origin.getBoundingClientRect();
    ghost.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`;
    ghost.style.transform = ghostTransform(
      { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      d.source.kind === 'card' && isTapped(d.source.instanceId),
      d.scale,
      1,
    );
    setTimeout(() => setDrag((cur) => (cur?.id === d.id ? null : cur)), SNAP_BACK_MS);
  }

  function endDrag(p: Point) {
    const d = dragRef.current;
    if (!d) return;
    const target = hitTestDropZone(p) as DropTarget | null;
    const id = d.source.instanceId;
    const inst = state.instances[id];
    // Dropped outside any zone, or put back on the deck it came from: return it.
    if (!target || !inst || target === d.source.kind) {
      snapBack();
      return;
    }
    // The two decks never mix.
    if ((target === 'deck' && inst.shared) || (target === 'sharedDeck' && !inst.shared)) {
      snapBack();
      notify(inst.shared ? 'Shared cards go back to the shared deck' : 'Only shared cards go in the shared deck');
      return;
    }
    finishDrag();
    if (target === 'deck' || target === 'sharedDeck') {
      setDeckDrop(id); // ask: top or bottom?
      return;
    }
    const centre = { x: p.x + d.offset.x, y: p.y + d.offset.y };
    let cmd: PlaytestCommand;
    if (target === 'canvas') {
      const position = toCanvasPos(centre, inst.zone === 'canvas' && inst.tapped);
      cmd =
        inst.zone === 'canvas'
          ? { type: 'moveOnCanvas', instanceId: id, position }
          : { type: 'moveCard', instanceId: id, to: { zone: 'canvas', position } };
    } else {
      const to: ZoneTarget = target === 'hand' ? { zone: 'hand', index: handIndexAt(centre.x, id) } : { zone: target };
      cmd = { type: 'moveCard', instanceId: id, to };
    }
    if (cmd.type === 'moveCard' && d.source.kind === 'sharedDeck') cmd.playerId = playerId; // drawn by this player
    dispatch(cmd);
  }

  function toCanvasPos(centre: Point, tapped: boolean): Vec2 {
    const r = getDropZoneRect('canvas');
    if (!r) return { x: 0.5, y: 0.5 };
    const w = cardWidth();
    const h = (w * 88) / 63;
    const [halfW, halfH] = tapped ? [h / 2, w / 2] : [w / 2, h / 2];
    // Undo the canvas zoom: positions are fractions of the unzoomed table.
    const v = zoom.view.current;
    return {
      x: clamp(((centre.x - r.left) / r.width - v.x) / v.zoom, halfW / r.width, 1 - halfW / r.width),
      y: clamp(((centre.y - r.top) / r.height - v.y) / v.zoom, halfH / r.height, 1 - halfH / r.height),
    };
  }

  function handIndexAt(x: number, excludeId: InstanceId) {
    let index = 0;
    for (const el of handEl.current?.querySelectorAll<HTMLElement>('[data-card-id]') ?? []) {
      if (el.dataset.cardId === excludeId) continue;
      const r = el.getBoundingClientRect();
      if (r.left + r.width / 2 < x) index++;
    }
    return index;
  }

  const cardActions = (id: InstanceId, where: 'canvas' | 'hand'): CardActions => ({
    onTap: () => setMagnified(id),
    onDoubleTap: where === 'canvas' ? () => dispatch({ type: 'toggleTapped', instanceId: id }) : undefined,
    onLongPress: () => setCounterFor(id),
    // In a scrollable hand, sideways swipes scroll it; moving mostly up or down picks the card up.
    canStartDrag:
      where === 'hand'
        ? (start, point) => !handScrollable || Math.abs(point.y - start.y) > Math.abs(point.x - start.x)
        : undefined,
    onDragStart: (start, offset) => beginDrag({ kind: 'card', instanceId: id }, start, offset),
    onDragMove: moveDrag,
    onDragEnd: endDrag,
    onDragCancel: snapBack,
  });

  // ---------- hand layout: overlap cards up to 40%, then scroll sideways ----------
  const [handWidth, setHandWidth] = useState(0);
  const [handScrollable, setHandScrollable] = useState(false);
  useEffect(() => {
    const el = handEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHandWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hand = player.zones.hand;
  const w = cardWidth();
  const handGap =
    hand.length < 2 ? 8 : Math.max(-0.4 * w, Math.min(8, (handWidth - 24 - hand.length * w) / (hand.length - 1)));
  useLayoutEffect(() => {
    const el = handEl.current;
    if (el) setHandScrollable(el.scrollWidth > el.clientWidth + 1);
  });

  // The new table slides in from the side the player is "coming from".
  const [slide, setSlide] = useState<'from-right' | 'from-left' | null>(null);
  const switchPlayer = (delta: number) => {
    if (playerCount < 2) return;
    setSlide(delta > 0 ? 'from-right' : 'from-left');
    dispatch({ type: 'selectPlayer', playerId: (playerId + delta + playerCount) % playerCount });
  };

  // Swiping sideways on an empty part of the table switches player (cards handle their own drags).
  const swipeStart = useRef<Point | null>(null);
  const canvasGestures = useGestures({
    onDragStart: ({ start }) => (swipeStart.current = zoom.pinched.current ? null : start),
    onDragEnd: (p) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start || zoom.pinched.current) return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) switchPlayer(dx < 0 ? 1 : -1);
    },
    onDragCancel: () => (swipeStart.current = null),
  });

  const draggedId = drag?.source.instanceId ?? null;
  const ghostPoint = drag ? (dragRef.current ?? drag).point : null;
  const magnifiedCard = magnified ? view(magnified) : null;
  const deckDropCard = deckDrop ? view(deckDrop) : null;

  return (
    <div className="table" style={{ '--lp-ms': `${config.longPressMs}ms` } as CSSProperties}>
      <header className="table-bar">
        <button className="btn" onClick={onBack} aria-label="Back to menu">
          ‹ Menu
        </button>
        <div className="table-title">
          Player {playerId + 1}
          {playerCount > 1 && <span className="table-subtitle"> of {playerCount}</span>}
        </div>
        <button className="btn" onClick={() => setDialog('menu')} aria-label="Playtest menu">
          ☰
        </button>
      </header>
      {saveError && (
        <div className="banner" role="alert">
          Couldn't save the playtest: {saveError}
        </div>
      )}

      <div className="table-main">
        <div
          className="canvas drop-zone"
          ref={(el) => {
            canvasZone(el);
            zoom.canvasRef(el);
          }}
          {...canvasGestures}
          onPointerDownCapture={zoom.onPointerDownCapture}
        >
          <div key={playerId} className={`canvas-layer${slide ? ` slide-${slide}` : ''}`}>
            <div className="canvas-zoom" ref={zoom.layerRef}>
              {/* Stable DOM order, stacked by z-index: moving a node mid-drag would cancel the drag. */}
              {[...player.zones.canvas].sort().map((id) => {
                const inst = state.instances[id];
                if (!inst?.position) return null;
                return (
                  <PlayCard
                    key={id}
                    card={view(id)}
                    actions={cardActions(id, 'canvas')}
                    dragging={draggedId === id}
                    style={{
                      left: `${inst.position.x * 100}%`,
                      top: `${inst.position.y * 100}%`,
                      zIndex: player.zones.canvas.indexOf(id) + 1,
                      ...({ '--rot': inst.tapped ? '90deg' : '0deg' } as CSSProperties),
                    }}
                  />
                );
              })}
              {Object.keys(state.instances).length === 0 && (
                <p className="canvas-hint">
                  No enabled cards were in the list when this playtest started. Add cards in Card Edit, then
                  use Reset Playtest.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="corner">
          <div className="piles">
            <PileZone pile="graveyard" count={player.zones.graveyard.length} onTap={() => setOpenPile('graveyard')} />
            <PileZone pile="exile" count={player.zones.exile.length} onTap={() => setOpenPile('exile')} />
          </div>
          <DeckZone
            count={player.zones.deck.length}
            elRef={(el) => (deckEl.current = el)}
            onTap={() => setDialog('deck')}
            onDragStart={(start, offset) => {
              const top = player.zones.deck[0];
              if (top) beginDrag({ kind: 'deck', instanceId: top }, start, offset);
            }}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
            onDragCancel={snapBack}
          />
          <PlayerValuesSlot player={player} defs={valueDefs} onOpen={() => setDialog('values')} />
        </div>

        {state.sharedDeck && (
          <div className="corner corner-right">
            <DeckZone
              zoneId="sharedDeck"
              label="Shared"
              count={state.sharedDeck.length}
              elRef={(el) => (sharedDeckEl.current = el)}
              onTap={() => setDialog('sharedDeck')}
              onDragStart={(start, offset) => {
                const top = state.sharedDeck?.[0];
                if (top) beginDrag({ kind: 'sharedDeck', instanceId: top }, start, offset);
              }}
              onDragMove={moveDrag}
              onDragEnd={endDrag}
              onDragCancel={snapBack}
            />
          </div>
        )}
      </div>

      <footer className="hand-bar">
        <button
          className="nav-arrow"
          aria-label="Previous player"
          disabled={playerCount < 2 || drag !== null}
          onClick={() => switchPlayer(-1)}
        >
          ‹
        </button>
        <div
          className={`hand drop-zone${handScrollable ? ' is-scrollable' : ''}`}
          ref={(el) => {
            handEl.current = el;
            handZone(el);
          }}
        >
          {/* margin:auto centres the cards when they fit and aligns them left when scrolling */}
          <div className="hand-inner">
            {hand.length === 0 && <span className="hand-empty">Hand</span>}
            {hand.map((id, i) => (
              <PlayCard
                key={id}
                card={view(id)}
                actions={cardActions(id, 'hand')}
                dragging={draggedId === id}
                style={{ marginLeft: i === 0 ? 0 : handGap, zIndex: i }}
              />
            ))}
          </div>
        </div>
        <button
          className="nav-arrow"
          aria-label="Next player"
          disabled={playerCount < 2 || drag !== null}
          onClick={() => switchPlayer(1)}
        >
          ›
        </button>
      </footer>

      {drag && ghostPoint && (
        <div
          key={drag.id}
          ref={ghostRef}
          className="drag-ghost"
          style={{
            transform: ghostTransform(
              { x: ghostPoint.x + drag.offset.x, y: ghostPoint.y + drag.offset.y },
              isTapped(drag.source.instanceId),
              drag.scale,
            ),
          }}
        >
          {/* Cards drawn from the deck stay face-down until they land. */}
          {drag.source.kind !== 'card' ? <CardView faceUp={false} /> : <VisibleCardView card={view(drag.source.instanceId)} />}
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {openPile && (
        <PileListDialog
          pile={openPile}
          cards={player.zones[openPile].map(view)}
          onMagnify={setMagnified}
          onMove={(id, to) => {
            if (to.zone === 'canvas') {
              // Fan out cards brought back to the table so they don't hide each other.
              const k = player.zones.canvas.length % 6;
              to = { zone: 'canvas', position: { x: 0.45 + k * 0.03, y: 0.45 + k * 0.03 } };
            }
            dispatch({ type: 'moveCard', instanceId: id, to });
          }}
          onClose={() => setOpenPile(null)}
        />
      )}
      {counterFor && (
        <CounterDialog card={view(counterFor)} playerCount={playerCount} onClose={() => setCounterFor(null)} />
      )}

      {magnifiedCard && magnifiedCard.kind !== 'hidden' && (
        <Modal className="scrim magnify-scrim" onClose={() => setMagnified(null)}>
          <div className="magnify-card">
            <VisibleCardView card={magnifiedCard} variant="full" />
          </div>
        </Modal>
      )}

      {deckDrop && deckDropCard && (
        <Modal onClose={() => setDeckDrop(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Put card into deck">
            <h3>
              Put {deckDropCard.kind === 'revealed' ? deckDropCard.def.name || 'this card' : 'this card'} into the{' '}
              {state.instances[deckDrop]?.shared ? 'shared deck' : 'deck'}
            </h3>
            <p>It will be placed face-down.</p>
            <div className="dialog-actions dialog-actions-stack">
              <button
                className="btn btn-big btn-primary"
                onClick={() => {
                  dispatch({ type: 'moveCard', instanceId: deckDrop, to: { zone: 'deck', placement: 'top' } });
                  setDeckDrop(null);
                }}
              >
                Place on Top
              </button>
              <button
                className="btn btn-big btn-primary"
                onClick={() => {
                  dispatch({ type: 'moveCard', instanceId: deckDrop, to: { zone: 'deck', placement: 'bottom' } });
                  setDeckDrop(null);
                }}
              >
                Place on Bottom
              </button>
              <button className="btn btn-big" onClick={() => setDeckDrop(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dialog === 'deck' && (
        <Modal onClose={() => setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Deck">
            <h3>Deck</h3>
            <p>
              {player.zones.deck.length} card{player.zones.deck.length === 1 ? '' : 's'} left.
            </p>
            <div className="dialog-actions dialog-actions-stack">
              <button
                className="btn btn-big btn-primary"
                disabled={player.zones.deck.length < 2}
                onClick={() => {
                  usePlaytest.getState().shuffleDeck(playerId);
                  setDialog(null);
                  notify('Deck shuffled');
                }}
              >
                Shuffle Deck
              </button>
              <button className="btn btn-big" onClick={() => setDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dialog === 'sharedDeck' && state.sharedDeck && (
        <Modal onClose={() => setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Shared deck">
            <h3>Shared deck</h3>
            <p>
              {state.sharedDeck.length} card{state.sharedDeck.length === 1 ? '' : 's'} left, the same for every
              player. Refresh swaps them for other cards with the same event numbers, in event order.
            </p>
            <div className="dialog-actions dialog-actions-stack">
              <button
                className="btn btn-big btn-primary"
                disabled={state.sharedDeck.length === 0}
                onClick={() => {
                  usePlaytest.getState().refreshSharedDeck(cards, sharedDeckEvents);
                  setDialog(null);
                  notify('Shared deck refreshed');
                }}
              >
                Refresh Shared Deck
              </button>
              <button
                className="btn btn-big"
                disabled={state.sharedDeck.length < 2}
                onClick={() => {
                  usePlaytest.getState().shuffleSharedDeck();
                  setDialog(null);
                  notify('Shared deck shuffled');
                }}
              >
                Shuffle Shared Deck
              </button>
              <button className="btn btn-big" onClick={() => setDialog(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dialog === 'menu' && (
        <Modal onClose={() => setDialog(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Playtest menu">
            <h3>Playtest</h3>
            <div className="dialog-actions dialog-actions-stack">
              <button className="btn btn-big" onClick={() => setDialog('gestures')}>
                Gesture settings
              </button>
              <button className="btn btn-big btn-danger" onClick={() => setDialog('reset')}>
                Reset Playtest
              </button>
              <button className="btn btn-big" onClick={onBack}>
                Back to main menu
              </button>
              <button className="btn btn-big" onClick={() => setDialog(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === 'gestures' && <GestureSettings onClose={() => setDialog(null)} />}
      {dialog === 'values' && (
        <PlayerValuesDialog playerId={playerId} player={player} defs={valueDefs} onClose={() => setDialog(null)} />
      )}
      {dialog === 'reset' && (
        <ResetPlaytestDialog
          onDone={(didReset) => {
            setDialog(null);
            if (didReset) notify('New playtest started');
          }}
        />
      )}
    </div>
  );
}

/** Confirmation, then a fresh playtest from the currently enabled cards. */
export function ResetPlaytestDialog({ onDone }: { onDone: (didReset: boolean) => void }) {
  return (
    <ConfirmDialog
      title="Reset Playtest?"
      message="All hands, tables, graveyards, exile zones and counters will be discarded and every deck rebuilt from the enabled cards. Your card list is not affected."
      confirmLabel="Reset"
      danger
      onConfirm={() => {
        const { cards, settings } = useLibrary.getState();
        usePlaytest.getState().reset(cards, settings);
        onDone(true);
      }}
      onCancel={() => onDone(false)}
    />
  );
}


import { useRef, useState } from 'react';
import { displayName, type CardDefinition } from '../../domain/cards/types';
import { COUNTER_COLORS, counterType, playerCounterTypes } from '../../domain/counters/colors';
import { tokenInstance } from '../../domain/playtest/setup';
import { SHARED_ZONE_SIZE, type CanvasMarker, type InstanceId, type PlayerId, type Vec2 } from '../../domain/playtest/types';
import type { VisibleCard } from '../../domain/playtest/visibility';
import { useDropZone } from '../../gestures/dropZones';
import type { Point } from '../../gestures/recognizer';
import { useGestures } from '../../gestures/useGestures';
import { newId } from '../../lib/id';
import { usePlaytest } from '../../state/playtestStore';
import { Modal } from '../../ui/Modal';
import { DefinitionCard } from '../cards/DefinitionCard';
import { PlayCard, type CardActions } from './PlayCard';

/** The few face-up cards next to the shared deck, the same on every player's table. */
export function SharedZone({
  cards,
  actions,
  draggedId,
}: {
  cards: VisibleCard[];
  actions: (id: InstanceId) => CardActions;
  draggedId: InstanceId | null;
}) {
  const zone = useDropZone('sharedZone', 2);
  return (
    <div
      ref={zone}
      className="shared-zone drop-zone"
      aria-label={`Shared zone, ${cards.length} of ${SHARED_ZONE_SIZE} cards`}
    >
      <span className="deck-label">Shared zone</span>
      {cards.map((card) => (
        <PlayCard
          key={card.instanceId}
          card={card}
          actions={actions(card.instanceId)}
          dragging={draggedId === card.instanceId}
        />
      ))}
      {Array.from({ length: SHARED_ZONE_SIZE - cards.length }, (_, i) => (
        <span key={i} className="shared-slot" />
      ))}
    </div>
  );
}

export const MARKER_SIZE = { w: 36, h: 36 };

/** A loose counter on the table: drag it around, tap it to remove it. */
export function CanvasMarkerView({
  marker,
  zIndex,
  getZoom,
  onTap,
  onDrop,
}: {
  marker: CanvasMarker;
  zIndex: number;
  getZoom: () => number;
  onTap: () => void;
  onDrop: (p: Point) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const settle = () => {
    start.current = null;
    if (ref.current) ref.current.style.translate = '';
  };
  const bind = useGestures({
    onTap,
    onDragStart: ({ start: s }) => (start.current = s),
    onDragMove: (p) => {
      const s = start.current;
      // The marker lives inside the zoomed layer: undo the zoom so it stays under the finger.
      if (s && ref.current) ref.current.style.translate = `${(p.x - s.x) / getZoom()}px ${(p.y - s.y) / getZoom()}px`;
    },
    onDragEnd: (p) => {
      settle();
      onDrop(p);
    },
    onDragCancel: settle,
  });
  const type = counterType(marker.color);
  if (!type) return null;
  return (
    <div
      ref={ref}
      {...bind}
      className={`table-marker${type.kind === 'player' ? ' is-player' : ''}`}
      aria-label={`${type.kind === 'player' ? `Player counter ${type.label}` : `${type.label} counter`} on the table`}
      style={{ left: `${marker.position.x * 100}%`, top: `${marker.position.y * 100}%`, zIndex, background: type.hex }}
    >
      {type.kind === 'player' ? type.label : null}
    </div>
  );
}

/** Double-tap on the table: put a counter or a token there. */
export function AddToTableDialog({
  playerId,
  playerCount,
  position,
  tokens,
  onClose,
}: {
  playerId: PlayerId;
  playerCount: number;
  position: Vec2;
  tokens: CardDefinition[]; // pre-made tokens (cards marked "Token")
  onClose: () => void;
}) {
  const dispatch = usePlaytest((s) => s.dispatch);
  const [text, setText] = useState('');
  const addToken = (from: { definitionId: string } | { text: string }) => {
    dispatch({ type: 'addInstance', instance: tokenInstance(playerId, position, from) });
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="dialog dialog-wide add-dialog" role="dialog" aria-modal="true" aria-label="Add to the table">
        <h3>Add to the table</h3>

        <div className="field-label">Counter</div>
        <div className="swatches" aria-label="Counters">
          {[...COUNTER_COLORS, ...playerCounterTypes(playerCount)].map((c) => (
            <button
              key={c.id}
              aria-label={c.kind === 'player' ? `Player counter ${c.label}` : `${c.label} counter`}
              className={`swatch${c.kind === 'player' ? ' swatch-player' : ''}`}
              style={{ background: c.hex }}
              onClick={() => {
                dispatch({ type: 'addMarker', playerId, marker: { id: newId(), color: c.id, position } });
                onClose();
              }}
            >
              {c.kind === 'player' ? c.label : null}
            </button>
          ))}
        </div>

        <div className="field-label">Token</div>
        {tokens.length === 0 ? (
          <p className="muted">No token cards yet. Turn on “Token” for a card in Card Edit to list it here.</p>
        ) : (
          <ul className="pile-list token-list">
            {tokens.map((t) => (
              <li key={t.id} className="pile-row">
                <button className="pile-row-main" onClick={() => addToken({ definitionId: t.id })}>
                  <span className="pile-thumb">
                    <DefinitionCard card={t} />
                  </span>
                  <span className="row-text">
                    <span className="row-name">{displayName(t)}</span>
                    <span className="row-desc">{t.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="field">
          <span className="field-label">Custom token</span>
          <textarea
            value={text}
            rows={3}
            placeholder="What the token does"
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => addToken({ text: text.trim() })}>
            Create Custom Token
          </button>
        </div>
      </div>
    </Modal>
  );
}

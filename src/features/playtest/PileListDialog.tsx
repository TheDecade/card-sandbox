import { useState } from 'react';
import { plainText } from '../../domain/cards/richText';
import { displayName } from '../../domain/cards/types';
import type { ZoneTarget } from '../../domain/playtest/commands';
import type { InstanceId } from '../../domain/playtest/types';
import type { VisibleCard } from '../../domain/playtest/visibility';
import { Modal } from '../../ui/Modal';
import { CostView } from '../cards/CostView';
import { CounterChip, counterBadges, VisibleCardView } from './PlayCard';
import { PILE_LABEL, type Pile } from './Zones';

/** List of the cards in the Graveyard or Exile, newest first, each with a Move to… menu. */
export function PileListDialog({
  pile,
  cards,
  onMagnify,
  onMove,
  onClose,
}: {
  pile: Pile;
  cards: VisibleCard[]; // in pile order (oldest first)
  onMagnify: (id: InstanceId) => void;
  onMove: (id: InstanceId, to: ZoneTarget) => void;
  onClose: () => void;
}) {
  const [moving, setMoving] = useState<InstanceId | null>(null);
  const other: Pile = pile === 'graveyard' ? 'exile' : 'graveyard';
  const newestFirst = [...cards].reverse();
  const movingCard = moving ? cards.find((c) => c.instanceId === moving) : undefined;

  // A shared card's deck is the shared deck (the reducer sends it there).
  const deck = movingCard?.kind === 'revealed' && movingCard.shared ? 'shared deck' : 'deck';
  const destinations: { label: string; to: ZoneTarget }[] = [
    { label: 'Hand', to: { zone: 'hand' } },
    { label: 'Table', to: { zone: 'canvas', position: { x: 0.5, y: 0.5 } } },
    // Tokens never go into a deck.
    ...(movingCard?.kind === 'revealed' && movingCard.token
      ? []
      : [
          { label: `Top of ${deck}`, to: { zone: 'deck', placement: 'top' } } as const,
          { label: `Bottom of ${deck}`, to: { zone: 'deck', placement: 'bottom' } } as const,
        ]),
    { label: PILE_LABEL[other], to: { zone: other } },
  ];

  return (
    <Modal onClose={onClose}>
      <div className="dialog dialog-wide pile-dialog" role="dialog" aria-modal="true" aria-label={PILE_LABEL[pile]}>
        <h3>
          {PILE_LABEL[pile]} <span className="muted">· {cards.length} card{cards.length === 1 ? '' : 's'}</span>
        </h3>
        {cards.length === 0 ? (
          <p>No cards in the {PILE_LABEL[pile]}.</p>
        ) : (
          <ul className="pile-list">
            {newestFirst.map((card) =>
              card.kind === 'revealed' || card.kind === 'missing' ? (
                <li key={card.instanceId} className="pile-row">
                  <button className="pile-row-main" onClick={() => onMagnify(card.instanceId)}>
                    <span className="pile-thumb">
                      <VisibleCardView card={card} />
                    </span>
                    <span className="row-text">
                      <span className="row-name">
                        {card.kind === 'revealed' ? displayName(card.def) : 'Missing card'}
                      </span>
                      <span className="row-desc">{card.kind === 'revealed' ? plainText(card.def.description) : ''}</span>
                    </span>
                    {card.kind === 'revealed' && <CostView cost={card.def.cost} className="row-cost-pips" />}
                    {card.kind === 'revealed' &&
                      counterBadges(card.counters).map((b) => <CounterChip key={b.id} badge={b} />)}
                  </button>
                  <button className="btn" onClick={() => setMoving(card.instanceId)}>
                    Move to…
                  </button>
                </li>
              ) : null,
            )}
          </ul>
        )}
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {moving && movingCard && (
        <Modal onClose={() => setMoving(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Move card">
            <h3>
              Move {movingCard.kind === 'revealed' ? displayName(movingCard.def) : 'card'} to…
            </h3>
            <div className="dialog-actions dialog-actions-stack">
              {destinations.map((d) => (
                <button
                  key={d.label}
                  className="btn btn-big"
                  onClick={() => {
                    onMove(moving, d.to);
                    setMoving(null);
                  }}
                >
                  {d.label}
                </button>
              ))}
              <button className="btn btn-big" onClick={() => setMoving(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

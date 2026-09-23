import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { displayName, newCardDefinition, type CardDefinition } from '../../domain/cards/types';
import { useImageUrl } from '../../images/useImageUrl';
import { useLibrary } from '../../state/libraryStore';
import { Toggle } from '../../ui/Toggle';
import { hueFromString } from '../cards/CardView';
import { CostView } from '../cards/CostView';
import { CardEditorDialog } from './CardEditorDialog';
import { ImportCardsButton } from './ImportCards';
import './cardEdit.css';

type Filter = 'all' | 'enabled' | 'disabled';
const ROW_HEIGHT = 92;

export function CardEditScreen({ onBack }: { onBack: () => void }) {
  const cards = useLibrary((s) => s.cards);
  const setEnabled = useLibrary((s) => s.setEnabled);
  const addSampleCards = useLibrary((s) => s.addSampleCards);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ card: CardDefinition; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => {
    const enabled = cards.filter((c) => c.enabled).length;
    return { all: cards.length, enabled, disabled: cards.length - enabled };
  }, [cards]);
  const visible = useMemo(
    () => cards.filter((c) => filter === 'all' || c.enabled === (filter === 'enabled')),
    [cards, filter],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const report = (p: Promise<void>) =>
    p.catch((e: unknown) => setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`));

  return (
    <main className="card-edit">
      <header className="card-edit-bar">
        <button className="btn" onClick={onBack} aria-label="Back to menu">
          ‹ Menu
        </button>
        <h2>Cards</h2>
        <div className="segmented" role="tablist" aria-label="Filter cards">
          {(['all', 'enabled', 'disabled'] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={filter === f ? 'is-active' : ''}
              onClick={() => setFilter(f)}
            >
              {f[0]!.toUpperCase() + f.slice(1)} <span className="seg-count">{counts[f]}</span>
            </button>
          ))}
        </div>
        <ImportCardsButton onDone={setNotice} />
        <button
          className="btn btn-primary"
          onClick={() => setEditing({ card: newCardDefinition(), isNew: true })}
        >
          + New card
        </button>
      </header>
      {notice && (
        <p className="picker-status import-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="picker-problem" role="alert">
          {error}
        </p>
      )}

      {cards.length === 0 ? (
        <div className="empty-state">
          <p>No cards yet.</p>
          <div className="empty-actions">
            <button
              className="btn btn-big btn-primary"
              onClick={() => setEditing({ card: newCardDefinition(), isNew: true })}
            >
              + New card
            </button>
            <button className="btn btn-big" onClick={() => void report(addSampleCards())}>
              Add 12 sample cards
            </button>
          </div>
        </div>
      ) : (
        <div className="card-list" ref={scrollRef}>
          {visible.length === 0 && <p className="muted list-empty">No {filter} cards.</p>}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const card = visible[item.index]!;
              return (
                <CardRow
                  key={card.id}
                  card={card}
                  top={item.start}
                  onOpen={() => setEditing({ card, isNew: false })}
                  onToggle={(on) => void report(setEnabled(card.id, on))}
                />
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <CardEditorDialog
          key={editing.card.id}
          initial={editing.card}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function CardRow({
  card,
  top,
  onOpen,
  onToggle,
}: {
  card: CardDefinition;
  top: number;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const thumb = useImageUrl(card.imageId, 'thumb');
  const hue = hueFromString(card.id);
  return (
    <div
      className={`card-row${card.enabled ? '' : ' is-disabled'}`}
      style={{ transform: `translateY(${top}px)`, height: ROW_HEIGHT }}
    >
      <button className="card-row-main" onClick={onOpen}>
        <span
          className="row-thumb"
          style={thumb ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 40% 55%), hsl(${hue + 40} 35% 30%))` }}
        >
          {thumb && <img src={thumb} alt="" draggable={false} />}
        </span>
        <span className="row-text">
          <span className="row-name">
            {displayName(card)}
            {(card.type || card.subtype) && (
              <span className="row-type"> · {[card.type, card.subtype].filter(Boolean).join(' - ')}</span>
            )}
          </span>
          <span className="row-desc">{card.description || '—'}</span>
        </span>
        <CostView cost={card.cost} className="row-cost-pips" />
        {card.boundPlayer > 0 && <span className="row-tag row-tag-bound">P{card.boundPlayer}</span>}
        {card.shared && <span className="row-tag row-tag-shared">Event {card.eventNumber}</span>}
        {card.isToken && <span className="row-tag row-tag-token">Token</span>}
        {!card.enabled && <span className="row-tag">Disabled</span>}
      </button>
      <Toggle checked={card.enabled} label={`${displayName(card)} enabled`} onChange={onToggle} />
    </div>
  );
}

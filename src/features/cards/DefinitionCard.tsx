import type { CardDefinition } from '../../domain/cards/types';
import { displayName } from '../../domain/cards/types';
import type { ImageVariant } from '../../domain/images/types';
import { useImageUrl } from '../../images/useImageUrl';
import { CardView, hueFromString, type CardContent } from './CardView';

/** A card from the Main Card List, with its image loaded from storage. */
export function DefinitionCard({
  card,
  variant = 'thumb',
  counters,
}: {
  card: CardDefinition;
  variant?: ImageVariant;
  counters?: CardContent['counters'];
}) {
  const imageUrl = useImageUrl(card.imageId, variant);
  return (
    <CardView
      card={{
        name: displayName(card),
        cost: card.cost,
        description: card.description,
        imageUrl,
        artHue: hueFromString(card.id),
        counters,
      }}
    />
  );
}

import type { CardDefinition } from '../domain/cards/types';

type SampleFields = Pick<CardDefinition, 'name' | 'cost' | 'description'>;

/** Starter cards so a playtest can be tried before designing anything. */
export function sampleCards(): SampleFields[] {
  return [
    { name: 'Ember Scout', cost: '1', description: 'When this enters play, look at the top card of your deck.' },
    { name: 'Stone Warden', cost: '3', description: 'Cannot be moved by other cards.' },
    { name: 'Tidecaller', cost: '2', description: 'Draw a card, then put a card from your hand on the bottom of your deck.' },
    { name: 'Gloom Moth', cost: '1', description: 'When this goes to the graveyard, put a red counter on a card.' },
    { name: 'Ironbark Giant', cost: '5', description: 'Enters play tapped.' },
    { name: 'Quick Study', cost: '0', description: 'Draw two cards, then exile this.' },
    { name: 'Lantern Keeper', cost: '2', description: 'Tap: put a blue counter on this card.' },
    { name: 'Ash Storm', cost: 'X', description: 'Put X red counters spread among cards on the table.' },
    { name: 'Wandering Bard', cost: '2', description: 'Untap another card.' },
    { name: 'Vault of Echoes', cost: '4', description: 'Return a card from your graveyard to your hand.' },
    { name: 'Thornback Boar', cost: '3', description: 'Gets a green counter each time you draw.' },
    { name: 'Mirror Sage', cost: '3', description: 'Copy the text of a card on the table until it leaves play.' },
  ];
}

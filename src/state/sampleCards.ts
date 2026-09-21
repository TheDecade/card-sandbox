import type { CardDefinition } from '../domain/cards/types';

type SampleFields = Pick<CardDefinition, 'name' | 'cost' | 'type' | 'description'>;

/** Starter cards so a playtest can be tried before designing anything. */
export function sampleCards(): SampleFields[] {
  return [
    { name: 'Ember Scout', cost: '{R}', type: 'Creature', description: 'When this enters play, look at the top card of your deck.' },
    { name: 'Stone Warden', cost: '{2}{W}', type: 'Creature', description: 'Cannot be moved by other cards.' },
    { name: 'Tidecaller', cost: '{1}{U}', type: 'Creature', description: 'Draw a card, then put a card from your hand on the bottom of your deck.' },
    { name: 'Gloom Moth', cost: '{B}', type: 'Creature', description: 'When this goes to the graveyard, put a red counter on a card.' },
    { name: 'Ironbark Giant', cost: '{3}{G}{G}', type: 'Creature', description: 'Enters play tapped.' },
    { name: 'Quick Study', cost: '{U}', type: 'Spell', description: 'Draw two cards, then exile this.' },
    { name: 'Lantern Keeper', cost: '{1}{Y}', type: 'Creature', description: 'Tap: put a blue counter on this card.' },
    { name: 'Ash Storm', cost: '{X}{R}', type: 'Spell', description: 'Put X red counters spread among cards on the table.' },
    { name: 'Wandering Bard', cost: '{1}{P}', type: 'Creature', description: 'Untap another card.' },
    { name: 'Vault of Echoes', cost: '{4}', type: 'Artifact', description: 'Return a card from your graveyard to your hand.' },
    { name: 'Thornback Boar', cost: '{2}{G}', type: 'Creature', description: 'Gets a green counter each time you draw.' },
    { name: 'Mirror Sage', cost: '{1}{U/P}{U/P}', type: 'Creature', description: 'Copy the text of a card on the table until it leaves play.' },
  ];
}

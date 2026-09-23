import { describe, expect, it } from 'vitest';
import { parseRichText, plainText } from './richText';

const show = (text: string) =>
  parseRichText(text)
    .map((s) => `${s.bold ? 'b' : ''}${s.italic ? 'i' : ''}${s.bold || s.italic ? ':' : ''}${s.text}`)
    .join('|');

describe('card text markup', () => {
  it('reads bold, italic and both', () => {
    expect(show('plain **bold** and *slanted* and ***all***')).toBe(
      'plain |b:bold| and |i:slanted| and |bi:all',
    );
  });

  it('keeps stars that open nothing', () => {
    expect(show('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(show('**unclosed and *this')).toBe('**unclosed and *this');
    expect(show('****')).toBe('****');
  });

  it('nests and keeps line breaks', () => {
    expect(show('**bold with *a slant* inside**')).toBe('b:bold with |bi:a slant|b: inside');
    expect(show('one\n**two**')).toBe('one\n|b:two');
  });

  it('strips the markup for lists', () => {
    expect(plainText('**Flying.** Draw *a* card.')).toBe('Flying. Draw a card.');
    expect(plainText('5 * 5 = 25')).toBe('5 * 5 = 25');
  });
});

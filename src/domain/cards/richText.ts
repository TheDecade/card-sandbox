// Card text markup, written the way chat apps do it: **bold**, *italic*, ***both***.
// Stars that open nothing (or stand next to a space) stay plain text, so "2 * 3" is safe.

export const BOLD = '**';
export const ITALIC = '*';

export interface RichSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** Splits card text into segments to draw. Line breaks are kept inside the segments. */
export function parseRichText(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  parseInto(text, false, false, out);
  return out;
}

/** The same text without its markup, for lists and one-line previews. */
export function plainText(text: string): string {
  return parseRichText(text)
    .map((s) => s.text)
    .join('');
}

function parseInto(text: string, bold: boolean, italic: boolean, out: RichSegment[]): void {
  let buffer = '';
  let i = 0;
  const flush = () => {
    if (buffer) out.push({ text: buffer, bold, italic });
    buffer = '';
  };

  while (i < text.length) {
    if (text[i] !== '*') {
      buffer += text[i];
      i++;
      continue;
    }
    let stars = 1;
    while (text[i + stars] === '*') stars++;
    const marker = '*'.repeat(stars);
    const close = stars > 3 ? -1 : closingMarker(text, i + stars, marker);
    if (close < 0) {
      buffer += marker; // nothing to close it: plain stars
      i += stars;
      continue;
    }
    flush();
    // ** and *** are bold; * and *** are italic.
    parseInto(text.slice(i + stars, close), bold || stars >= 2, italic || stars !== 2, out);
    i = close + stars;
  }
  flush();
}

/** Index of the marker that closes the one just opened at `from`, or -1. */
function closingMarker(text: string, from: number, marker: string): number {
  if (isSpace(text[from])) return -1; // "2 * 3": an opener followed by a space marks nothing
  for (let at = text.indexOf(marker, from); at >= 0; at = text.indexOf(marker, at + 1)) {
    if (at > from && !isSpace(text[at - 1])) return at;
  }
  return -1;
}

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

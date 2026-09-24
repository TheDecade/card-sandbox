// Mana-style costs in Oracle text format: every symbol in its own braces, e.g. "{2}{W}{W/U}".
// Colors follow Magic (W U B R G) plus Y = yellow and P = purple. Note: P is purple here, so
// "{W/P}" is a white/purple hybrid, not Phyrexian mana.

export const MANA_COLORS = {
  W: { name: 'White', hex: '#f5efd6', text: '#3b3526' },
  U: { name: 'Blue', hex: '#3e8fd8', text: '#ffffff' },
  B: { name: 'Black', hex: '#3a3533', text: '#ffffff' },
  R: { name: 'Red', hex: '#e0503a', text: '#ffffff' },
  G: { name: 'Green', hex: '#2f9a5b', text: '#ffffff' },
  Y: { name: 'Yellow', hex: '#f2c230', text: '#3b3526' },
  P: { name: 'Purple', hex: '#8e4ec6', text: '#ffffff' },
} as const;
export type ManaColor = keyof typeof MANA_COLORS;
export const MANA_COLOR_KEYS = Object.keys(MANA_COLORS) as ManaColor[];

export type CostPart = { kind: 'color'; color: ManaColor } | { kind: 'generic'; value: string };

export type CostToken =
  | { kind: 'generic'; value: string } // {3}
  | { kind: 'color'; color: ManaColor } // {W}
  | { kind: 'x' } // {X}
  | { kind: 'hybrid'; parts: CostPart[] } // {W/U}, {2/W}
  | { kind: 'unknown'; text: string } // anything else inside braces
  | { kind: 'plain'; text: string }; // an old-style cost without braces: "3", "2R"

const isColor = (s: string): s is ManaColor => s in MANA_COLORS;
const isNumber = (s: string) => /^\d+$/.test(s);

function part(s: string): CostPart | null {
  if (isColor(s)) return { kind: 'color', color: s };
  if (isNumber(s)) return { kind: 'generic', value: s };
  return null;
}

function symbol(inner: string): CostToken {
  const s = inner.trim().toUpperCase();
  if (isNumber(s)) return { kind: 'generic', value: String(Number(s)) };
  if (isColor(s)) return { kind: 'color', color: s };
  if (s === 'X') return { kind: 'x' };
  if (s.includes('/')) {
    const parts = s.split('/').map(part);
    if (parts.length >= 2 && parts.every((p): p is CostPart => p !== null)) return { kind: 'hybrid', parts };
  }
  return { kind: 'unknown', text: inner.trim() };
}

/** Splits a cost into symbols. Costs without braces are kept as one plain token (shown as before). */
export function parseCost(cost: string): CostToken[] {
  const text = cost.trim();
  if (text === '') return [];
  if (!text.includes('{')) return [{ kind: 'plain', text }];
  const tokens: CostToken[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const between = text.slice(last, m.index).trim();
    if (between) tokens.push({ kind: 'unknown', text: between }); // stray text: show it, don't lose it
    tokens.push(symbol(m[1]!));
    last = m.index! + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) tokens.push({ kind: 'unknown', text: rest });
  return tokens;
}

/**
 * What a cost is worth when sorting: a number counts itself, every other symbol counts 1, and {X}
 * counts nothing. A cost typed without braces adds up its digits and its letters ("2R" = 3).
 */
export function costValue(cost: string): number {
  let total = 0;
  for (const token of parseCost(cost)) {
    switch (token.kind) {
      case 'generic':
        total += Number(token.value) || 0;
        break;
      case 'color':
      case 'hybrid':
      case 'unknown':
        total += 1;
        break;
      case 'plain':
        total += (token.text.match(/\d+/g) ?? []).reduce((sum, n) => sum + Number(n), 0);
        total += (token.text.match(/[A-Za-z]/g) ?? []).length;
        break;
      case 'x':
        break;
    }
  }
  return total;
}

// ---------- editing helpers (used by the symbol buttons in the card editor) ----------

/** Appends a symbol, e.g. "W" → "…{W}", "W/U" → "…{W/U}". */
export const appendSymbol = (cost: string, inner: string) => `${cost.trim()}{${inner}}`;

/** Adds 1 to the generic amount: "{W}" → "{1}{W}", "{2}{W}" → "{3}{W}" (generic comes first). */
export function incrementGeneric(cost: string): string {
  const text = cost.trim();
  const m = /\{(\d+)\}/.exec(text);
  if (m) return text.slice(0, m.index) + `{${Number(m[1]) + 1}}` + text.slice(m.index + m[0].length);
  return `{1}${text}`;
}

/** Removes the last symbol (or the last character of a cost typed without braces). */
export function removeLastSymbol(cost: string): string {
  const text = cost.trimEnd();
  if (text.endsWith('}')) {
    const open = text.lastIndexOf('{');
    if (open >= 0) return text.slice(0, open).trimEnd();
  }
  return text.slice(0, -1);
}

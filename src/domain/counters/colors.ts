import { playerColorHex } from '../players/colors';

export type CounterColorId = string; // id of any counter type: "red", "p2", ...

export interface CounterType {
  id: CounterColorId;
  kind: 'color' | 'player';
  label: string;
  hex: string; // badge background
}

// Adding a color = adding a line. Stored counters reference ids; unknown ids are ignored when drawn.
export const COUNTER_COLORS: readonly CounterType[] = [
  { id: 'red', kind: 'color', label: 'Red', hex: '#e5484d' },
  { id: 'blue', kind: 'color', label: 'Blue', hex: '#3e63dd' },
  { id: 'green', kind: 'color', label: 'Green', hex: '#30a46c' },
  { id: 'yellow', kind: 'color', label: 'Yellow', hex: '#f5d90a' },
  { id: 'purple', kind: 'color', label: 'Purple', hex: '#8e4ec6' },
  { id: 'white', kind: 'color', label: 'White', hex: '#f0f0f0' },
];

const PLAYER_ID = /^p([1-9]\d*)$/;

/** Player counters carry their player's color and label ("p1", "p2", …). */
export const playerCounterId = (playerIndex: number): CounterColorId => `p${playerIndex + 1}`;

export function playerCounterTypes(playerCount: number): CounterType[] {
  return Array.from({ length: playerCount }, (_, i) => counterType(playerCounterId(i))!);
}

export function counterType(id: CounterColorId): CounterType | undefined {
  const color = COUNTER_COLORS.find((c) => c.id === id);
  if (color) return color;
  const m = PLAYER_ID.exec(id);
  if (m) return { id, kind: 'player', label: id, hex: playerColorHex(Number(m[1]) - 1) };
  return undefined;
}

/** Display order: colors in registry order, then player counters by number. */
export function counterSortKey(id: CounterColorId): number {
  const colorIndex = COUNTER_COLORS.findIndex((c) => c.id === id);
  if (colorIndex >= 0) return colorIndex;
  const m = PLAYER_ID.exec(id);
  return m ? 1000 + Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

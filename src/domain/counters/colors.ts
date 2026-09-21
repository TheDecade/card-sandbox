export type CounterColorId = string;

export interface CounterColor {
  id: CounterColorId;
  label: string;
  hex: string;
}

// Adding a color = adding a line. Stored counters reference ids; unknown ids are ignored when drawn.
export const COUNTER_COLORS: readonly CounterColor[] = [
  { id: 'red', label: 'Red', hex: '#e5484d' },
  { id: 'blue', label: 'Blue', hex: '#3e63dd' },
  { id: 'green', label: 'Green', hex: '#30a46c' },
  { id: 'yellow', label: 'Yellow', hex: '#f5d90a' },
  { id: 'purple', label: 'Purple', hex: '#8e4ec6' },
  { id: 'white', label: 'White', hex: '#f0f0f0' },
];

export const counterColor = (id: CounterColorId) => COUNTER_COLORS.find((c) => c.id === id);

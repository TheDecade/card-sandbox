import { describe, expect, it } from 'vitest';
import { appendSymbol, costValue, incrementGeneric, parseCost, removeLastSymbol } from './cost';

describe('costValue', () => {
  it('adds up the symbols of a cost', () => {
    expect(costValue('')).toBe(0);
    expect(costValue('{2}{W}{U}')).toBe(4);
    expect(costValue('{10}')).toBe(10);
    expect(costValue('{X}{W}')).toBe(1); // X counts nothing
    expect(costValue('{W/U}{2/G}')).toBe(2); // a hybrid is one symbol
    expect(costValue('2R')).toBe(3); // written without braces
  });
});

describe('parseCost', () => {
  it('reads Oracle-style symbols', () => {
    expect(parseCost('{2}{W}{U}{X}')).toEqual([
      { kind: 'generic', value: '2' },
      { kind: 'color', color: 'W' },
      { kind: 'color', color: 'U' },
      { kind: 'x' },
    ]);
  });

  it('supports yellow, purple, lowercase and multi-digit generic', () => {
    expect(parseCost('{10}{y}{P}')).toEqual([
      { kind: 'generic', value: '10' },
      { kind: 'color', color: 'Y' },
      { kind: 'color', color: 'P' },
    ]);
  });

  it('reads hybrids, with P meaning purple', () => {
    expect(parseCost('{W/U}{W/P}{2/G}')).toEqual([
      { kind: 'hybrid', parts: [{ kind: 'color', color: 'W' }, { kind: 'color', color: 'U' }] },
      { kind: 'hybrid', parts: [{ kind: 'color', color: 'W' }, { kind: 'color', color: 'P' }] },
      { kind: 'hybrid', parts: [{ kind: 'generic', value: '2' }, { kind: 'color', color: 'G' }] },
    ]);
  });

  it('keeps old costs without braces as plain text', () => {
    expect(parseCost('3')).toEqual([{ kind: 'plain', text: '3' }]);
    expect(parseCost('2R')).toEqual([{ kind: 'plain', text: '2R' }]);
    expect(parseCost('  ')).toEqual([]);
  });

  it('shows unknown symbols and stray text instead of dropping them', () => {
    expect(parseCost('{Q}{W/Z} and {1}')).toEqual([
      { kind: 'unknown', text: 'Q' },
      { kind: 'unknown', text: 'W/Z' },
      { kind: 'unknown', text: 'and' },
      { kind: 'generic', value: '1' },
    ]);
  });
});

describe('cost editing helpers', () => {
  it('appends symbols and hybrids', () => {
    expect(appendSymbol('', 'W')).toBe('{W}');
    expect(appendSymbol('{1}{W}', 'W/U')).toBe('{1}{W}{W/U}');
  });

  it('increments the generic amount, putting it first', () => {
    expect(incrementGeneric('')).toBe('{1}');
    expect(incrementGeneric('{W}{W}')).toBe('{1}{W}{W}');
    expect(incrementGeneric('{9}{R}')).toBe('{10}{R}');
  });

  it('removes the last symbol', () => {
    expect(removeLastSymbol('{2}{W}{W/U}')).toBe('{2}{W}');
    expect(removeLastSymbol('{2}')).toBe('');
    expect(removeLastSymbol('2R')).toBe('2');
    expect(removeLastSymbol('')).toBe('');
  });
});

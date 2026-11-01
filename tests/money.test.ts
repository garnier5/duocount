import { describe, expect, it } from 'vitest';
import { money, parseAmount, splitByShares } from '../src/lib/money';

describe('parseAmount', () => {
  it.each([
    ['64.20', 6420],
    ['64,2', 6420],
    ['54,98', 5498],
    ['1,150.00', 115000],
    ['1.150,50', 115050],
    ['1,150', 115000],
    ['€ 12', 1200],
    ['0.1', 10],
    ['1 234,56', 123456]
  ])('%s → %i cents', (input, cents) => {
    expect(parseAmount(input)).toBe(cents);
  });

  it('returns null for empty input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('money', () => {
  it('formats like the design', () => {
    expect(money(221350)).toBe('€2,213.50');
    expect(money(-6850)).toBe('−€68.50');
    expect(money(8240, { sign: true })).toBe('+€82.40');
    expect(money(115000, { compact: true })).toBe('€1,150');
    expect(money(5498, { compact: true })).toBe('€54.98');
  });
});

describe('splitByShares', () => {
  it('always adds up to the total', () => {
    const parts = splitByShares(271000, [
      { id: 'c', pct: 60 },
      { id: 'j', pct: 40 }
    ]);
    expect(parts).toEqual({ c: 162600, j: 108400 });
    const odd = splitByShares(1001, [
      { id: 'a', pct: 33 },
      { id: 'b', pct: 33 },
      { id: 'c', pct: 34 }
    ]);
    expect(odd.a + odd.b + odd.c).toBe(1001);
  });
});

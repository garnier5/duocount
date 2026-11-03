import { describe, expect, it } from 'vitest';
import { exactPart, money, moneyExact, parseAmount, percent, splitByShares } from '../src/lib/money';

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
    expect(money(115000)).toBe('€1,150.00');
    expect(money(5498)).toBe('€54.98');
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

describe('exact figures', () => {
  it('shows percentages without hiding a difference', () => {
    expect(percent(100, 100)).toBe('100%');
    expect(percent(1043, 1000)).toBe('104.3%');
    expect(percent(9996, 10000)).toBe('99.96%');
    expect(percent(1, 3)).toBe('33.3%');
    expect(percent(5, 0)).toBe('—');
  });

  it('shows the share before cent rounding', () => {
    expect(moneyExact(exactPart(175001, 60))).toBe('€1,050.006');
    expect(moneyExact(exactPart(175000, 60))).toBe('€1,050.00');
  });
});

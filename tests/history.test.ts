import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL, getDb, replaceAll } from '../src/data/store';
import { addExpense, closeMonth, confirmForecast, setForecastLine, setReceived, unconfirmForecast, updateExpense, type ExpenseInput } from '../src/domain/actions';
import { carryCheck, memberBalances } from '../src/domain/calc';
import { confirmations, closings } from '../src/domain/history';
import { createRec } from '../src/domain/records';
import { expenseRec, forecastRec, monthDoc, receivedRec } from '../src/domain/select';
import type { Category, Household, Member, Rec } from '../src/domain/types';

const groceries = (amount: number, month = '2026-10'): ExpenseInput => ({ month, label: 'Market', amount, categoryId: 'groceries', payer: 'joint', advance: false });

beforeEach(async () => {
  const recs: Rec[] = [
    createRec<Household>('household', 'hh', { name: 'Home', currency: 'EUR', startMonth: '2026-09', createdAt: 0 }, 'cam'),
    createRec<Member>('member', 'cam', { name: 'Camille', color: '#B4459A', share: 60, order: 0 }, 'cam'),
    createRec<Member>('member', 'jul', { name: 'Julien', color: '#3E6FD8', share: 40, order: 1 }, 'cam'),
    createRec<Category>('category', 'groceries', { name: 'Groceries', icon: 'cart', color: '#2E9457', order: 0, planned: null, recurringDay: null }, 'cam')
  ];
  await replaceAll(recs, { ...DEFAULT_LOCAL, householdId: 'hh', meId: 'cam' });
});

describe('history', () => {
  it('keeps every earlier version of an expense, and ignores a save that changes nothing', () => {
    setForecastLine('2026-09', 'groceries', 50000);
    confirmForecast('2026-09');
    const id = addExpense(groceries(1200, '2026-09'));
    updateExpense(id, groceries(1400, '2026-09'));
    updateExpense(id, groceries(1400, '2026-09'));
    updateExpense(id, { ...groceries(1400, '2026-09'), label: 'Saturday market' });
    const e = expenseRec(getDb(), id)!.data;
    expect(e.history?.map((h) => [h.amount, h.label])).toEqual([
      [1200, 'Market'],
      [1400, 'Market']
    ]);
  });

  it('keeps the amounts recorded for a transfer, also across "not done yet"', () => {
    setReceived('2026-09', 'jul', 50000);
    setReceived('2026-09', 'jul', 52000);
    setReceived('2026-09', 'jul', null);
    setReceived('2026-09', 'jul', 53000);
    const r = receivedRec(getDb(), '2026-09', 'jul')!.data;
    expect(r.amount).toBe(53000);
    expect(r.history?.map((h) => h.amount)).toEqual([50000, 52000]);
  });

  it('keeps each confirmation, and recalculating uses the balance as it is now', () => {
    setForecastLine('2026-09', 'groceries', 100000);
    confirmForecast('2026-09');
    addExpense(groceries(100000, '2026-09'));
    closeMonth('2026-09');
    setForecastLine('2026-10', 'groceries', 100000);
    confirmForecast('2026-10');
    expect(carryCheck(getDb(), '2026-10').every((c) => c.diff === 0)).toBe(true);

    // September corrected after October was confirmed: €320 more spent.
    addExpense(groceries(32000, '2026-09'));
    const check = carryCheck(getDb(), '2026-10');
    expect(check.map((c) => [c.member.id, c.atConfirm, c.now])).toEqual([
      ['cam', 0, -19200],
      ['jul', 0, -12800]
    ]);

    confirmForecast('2026-10');
    const list = confirmations(forecastRec(getDb(), '2026-10'));
    expect(list.map((c) => [c.shares.cam.transfer, c.shares.jul.transfer])).toEqual([
      [60000, 40000],
      [79200, 52800]
    ]);
    expect(carryCheck(getDb(), '2026-10').every((c) => c.diff === 0)).toBe(true);

    // Reopening keeps the history.
    unconfirmForecast('2026-10');
    expect(confirmations(forecastRec(getDb(), '2026-10'))).toHaveLength(2);
  });

  it('keeps what a month showed when it was closed', () => {
    setForecastLine('2026-09', 'groceries', 100000);
    confirmForecast('2026-09');
    addExpense(groceries(90000, '2026-09'));
    closeMonth('2026-09');
    const [closing] = closings(monthDoc(getDb(), '2026-09'));
    expect(closing.spent).toBe(90000);
    const now = memberBalances(getDb(), '2026-09');
    expect(now.map((b) => closing.balances[b.member.id].balance)).toEqual(now.map((b) => b.balance));
    expect(closing.balances.cam.balance).toBe(6000);
  });
});

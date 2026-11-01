import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildWorkbook } from '../src/export/excel';
import { axisTop, breakdown, chartMonths, monthPoint } from '../src/domain/charts';
import { DEFAULT_LOCAL, type Db } from '../src/data/store';
import { canEnterExpenses, forecastView, startMonthChoices, memberBalances, monthInfo, monthStats } from '../src/domain/calc';
import { createRec } from '../src/domain/records';
import type { Category, Expense, Forecast, Household, Member, MonthDoc, Rec, Received } from '../src/domain/types';

/**
 * Camille 60 %, Julien 40 %. October forecast €1,000 → transfers €600 / €400.
 * Camille transferred €650 (€50 too much), Julien €400.
 * Spent from the joint account: €900. Julien paid €50 of groceries himself (reimbursed by the account).
 * Camille paid €30 for Julien (not reimbursed: Julien owes it to her).
 */
function scenario(extra: (add: <T>(type: Rec['type'], id: string, data: T) => void) => void = () => {}): Db {
  const recs: Rec[] = [];
  const add = <T,>(type: Rec['type'], id: string, data: T) => {
    recs.push(createRec(type, id, data, 'cam'));
  };
  add<Household>('household', 'hh', { name: 'The Duponts', currency: 'EUR', startMonth: '2026-10', createdAt: 0 });
  add<Member>('member', 'cam', { name: 'Camille', color: '#B4459A', share: 60, order: 0 });
  add<Member>('member', 'jul', { name: 'Julien', color: '#3E6FD8', share: 40, order: 1 });
  add<Category>('category', 'groceries', { name: 'Groceries', icon: 'cart', color: '#2E9457', order: 0, planned: null, recurringDay: null });
  add<Category>('category', 'rent', { name: 'Rent', icon: 'home', color: '#5856D6', order: 1, planned: 50000, recurringDay: 5 });
  const e = (id: string, date: string, label: string, amount: number, categoryId: string, payer = 'joint', advance = false) =>
    add<Expense>('expense', id, { month: date.slice(0, 7), label, amount, categoryId, payer, advance, kind: 'single' });
  e('e1', '2026-10-03', 'Supermarket', 40000, 'groceries');
  e('e2', '2026-10-05', 'Rent', 50000, 'rent');
  e('e3', '2026-10-12', 'Market', 5000, 'groceries', 'jul', true);
  e('e4', '2026-10-14', 'Book for Julien', 3000, 'groceries', 'cam', false);
  add<Forecast>('forecast', '2026-10', {
    lines: { groceries: 50000, rent: 50000 },
    extras: [],
    confirmedAt: 1,
    total: 100000,
    shares: {
      cam: { pct: 60, gross: 60000, carry: 0, transfer: 60000 },
      jul: { pct: 40, gross: 40000, carry: 0, transfer: 40000 }
    }
  });
  add<Received>('received', '2026-10:cam', { month: '2026-10', memberId: 'cam', amount: 65000 });
  add<Received>('received', '2026-10:jul', { month: '2026-10', memberId: 'jul', amount: 40000 });
  add<MonthDoc>('month', '2026-10', { closedAt: 2, dismissed: [] });
  add<Forecast>('forecast', '2026-11', { lines: { groceries: 50000, rent: 50000 }, extras: [], confirmedAt: null });
  extra(add);
  return { status: 'ready', records: new Map(recs.map((r) => [r.key, r])), local: { ...DEFAULT_LOCAL, householdId: 'hh', meId: 'cam' } };
}

const byName = <T extends { member: { name: string } }>(list: T[]) => Object.fromEntries(list.map((x) => [x.member.name, x]));

describe('household spending', () => {
  it('counts joint and reimbursed expenses, not what one member owes the other', () => {
    const s = monthStats(scenario(), '2026-10');
    expect(s.total).toBe(95000);
    expect(s.between.map((e) => e.id)).toEqual(['e4']);
  });
});

describe('balances', () => {
  it('compares what each person put in with their share of what was spent', () => {
    const b = byName(memberBalances(scenario(), '2026-10'));
    // Camille: 650 transferred + 30 paid for Julien − 60 % of 950.
    expect(b.Camille.balance).toBe(11000);
    // Julien: 400 transferred + 50 reimbursable − 30 owed to Camille − 40 % of 950.
    expect(b.Julien.balance).toBe(4000);
  });
});

describe('forecast', () => {
  it('carries the previous balance into the next transfers', () => {
    const f = forecastView(scenario(), '2026-11');
    const s = byName(f.shares);
    expect(s.Camille.transfer).toBe(60000 - 11000);
    expect(s.Julien.transfer).toBe(40000 - 4000);
  });

  it('brings the joint account back to where it started', () => {
    const db = scenario();
    const start = 50000;
    // October: transfers in, joint-account spending out (the reimbursable €50 was paid by Julien, not the account).
    const octIn = 65000 + 40000;
    const octOut = 40000 + 50000;
    const novTransfers = forecastView(db, '2026-11').shares.reduce((a, s) => a + s.transfer, 0);
    // November goes exactly as planned.
    const novOut = 100000;
    expect(start + octIn - octOut + novTransfers - novOut).toBe(start);
  });

  it('keeps balances running over several months', () => {
    // November transfers made as planned, but €100 more spent than forecast.
    const db = scenario((add) => {
      add<Forecast>('forecast', '2026-11', {
        lines: { groceries: 50000, rent: 50000 },
        extras: [],
        confirmedAt: 3,
        total: 100000,
        shares: {
          cam: { pct: 60, gross: 60000, carry: 11000, transfer: 49000 },
          jul: { pct: 40, gross: 40000, carry: 4000, transfer: 36000 }
        }
      });
      add<Expense>('expense', 'n1', { month: '2026-11', label: 'Groceries', amount: 60000, categoryId: 'groceries', payer: 'joint', advance: false, kind: 'single' });
      add<Expense>('expense', 'n2', { month: '2026-11', label: 'Rent', amount: 50000, categoryId: 'rent', payer: 'joint', advance: false, kind: 'single' });
    });
    const b = byName(memberBalances(db, '2026-11'));
    // The €100 overspend is shared 60/40 and will be added to December.
    expect(b.Camille.balance).toBe(-6000);
    expect(b.Julien.balance).toBe(-4000);
  });
});

describe('forecast lines', () => {
  it('pre-fills fixed amounts and flags changes', () => {
    const f = forecastView(scenario(), '2026-11');
    expect(f.lines.find((l) => l.cat.id === 'rent')!.caption).toBe('Recurring · on the 5th');
    expect(f.lines.find((l) => l.cat.id === 'groceries')!.caption).toBe('Same as October');
  });
});

describe('shares', () => {
  const was6040 = {
    cam: { pct: 60, gross: 60000, carry: 0, transfer: 60000 },
    jul: { pct: 40, gross: 40000, carry: 0, transfer: 40000 }
  };
  // October (with expenses) and December (none yet) were confirmed at 60/40, then reopened; shares are now 70/30.
  const reopenedAt7030 = () =>
    scenario((add) => {
      add<Forecast>('forecast', '2026-10', { lines: { groceries: 50000, rent: 50000 }, extras: [], confirmedAt: null, shares: was6040 });
      add<Forecast>('forecast', '2026-12', { lines: { groceries: 50000, rent: 50000 }, extras: [], confirmedAt: null, shares: was6040 });
      add<Member>('member', 'cam', { name: 'Camille', color: '#B4459A', share: 70, order: 0 });
      add<Member>('member', 'jul', { name: 'Julien', color: '#3E6FD8', share: 30, order: 1 });
    });

  it('keeps the percentages of a reopened plan that already has expenses', () => {
    const db = reopenedAt7030();
    expect(byName(memberBalances(db, '2026-10')).Camille.pct).toBe(60);
    expect(byName(forecastView(db, '2026-10').shares).Camille.pct).toBe(60);
  });

  it('applies the new percentages to a plan without expenses', () => {
    const db = reopenedAt7030();
    expect(byName(forecastView(db, '2026-11').shares).Camille.pct).toBe(70);
    expect(byName(forecastView(db, '2026-12').shares).Camille.pct).toBe(70);
  });
});

describe('expense entry', () => {
  it('waits for the month plan to be confirmed', () => {
    const db = scenario();
    expect(canEnterExpenses(db, '2026-10')).toBe(true);
    expect(canEnterExpenses(db, '2026-11')).toBe(false);
    expect(monthInfo(db, '2026-11', '2026-11-05').stat).toBe('Plan to confirm first');
  });
});

describe('month status', () => {
  it('labels closed months', () => {
    expect(monthInfo(scenario(), '2026-10', '2026-11-05').stat).toBe('Closed · 4 expenses');
  });
});

describe('excel export', () => {
  it('lists the plan of each category and one-off expense', () => {
    const db = scenario((add) =>
      add<Forecast>('forecast', '2026-11', { lines: { groceries: 45000, rent: 50000 }, extras: [{ id: 'x1', label: 'Holidays', amount: 20000 }], confirmedAt: null })
    );
    const files = unzipSync(buildWorkbook(db, ['2026-10', '2026-11'], ['plan']));
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    const cells = [...sheet.matchAll(/<t[^>]*>([^<]*)<\/t>|<v>([^<]*)<\/v>/g)].map((x) => x[1] ?? x[2]);
    expect(cells).toEqual([
      'Month', 'Status', 'Line', 'Type', 'Planned',
      'October 2026', 'Confirmed', 'Groceries', 'Category', '500',
      'October 2026', 'Confirmed', 'Rent', 'Category', '500',
      'October 2026 total', '1000',
      'November 2026', 'Draft', 'Groceries', 'Category', '450',
      'November 2026', 'Draft', 'Rent', 'Category', '500',
      'November 2026', 'Draft', 'Holidays', 'One-off', '200',
      'November 2026 total', '1150'
    ]);
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Plan by category"');
  });
});

describe('charts', () => {
  it('gives planned and paid per month, and nothing paid before expenses are entered', () => {
    const db = scenario();
    expect(monthPoint(db, '2026-10')).toEqual({ month: '2026-10', planned: 100000, paid: 95000 });
    expect(monthPoint(db, '2026-11')).toEqual({ month: '2026-11', planned: 100000, paid: null });
    expect(chartMonths(db, 'six')[0]).toBe('2026-10');
  });

  it('splits the month by category, between-member expenses left out', () => {
    const b = breakdown(scenario(), '2026-10');
    expect(b.map((s) => [s.id, s.planned, s.paid])).toEqual([
      ['rent', 50000, 50000],
      ['groceries', 50000, 45000]
    ]);
  });

  it('groups the smallest categories into one slice', () => {
    const db = scenario((add) => {
      ['a', 'b', 'c', 'd', 'e'].forEach((id, i) => {
        add<Category>('category', id, { name: id.toUpperCase(), icon: 'cart', color: '#000', order: 2 + i, planned: null, recurringDay: null });
        add<Expense>('expense', 'x' + id, { month: '2026-10', label: id, amount: 1000 * (i + 1), categoryId: id, payer: 'joint', advance: false, kind: 'single' });
      });
    });
    const b = breakdown(db, '2026-10');
    expect(b).toHaveLength(6);
    expect(b[5]).toMatchObject({ id: 'other', name: 'B, A', paid: 3000 });
  });

  it('picks a round top for the axis', () => {
    expect(axisTop(275000)).toEqual({ top: 300000, step: 100000 });
    expect(axisTop(95000)).toEqual({ top: 150000, step: 50000 });
  });
});

describe('first month', () => {
  it('can go up to a year back, never after a month that has data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 1));
    try {
      const choices = startMonthChoices(scenario());
      expect(choices[0]).toBe('2026-10');
      expect(choices[choices.length - 1]).toBe('2025-11');
      expect(choices).toHaveLength(12);
    } finally {
      vi.useRealTimers();
    }
  });
});

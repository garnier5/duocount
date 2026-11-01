import type { Db } from '../data/store';
import { addMonths, monthName, type MonthKey } from '../lib/dates';
import { slug } from '../lib/share';
import { budgetOf, forecastView, isBetweenMembers, monthStats, plannedFor } from '../domain/calc';
import { allCategories, allMembers, expenses, forecastRec, forecasts, household, received } from '../domain/select';
import { buildXlsx, type Cell, type Sheet } from './xlsx';

export type SheetId = 'exp' | 'cat' | 'plan' | 'fc' | 'adv';

export const SHEETS: { id: SheetId; name: string; title: string; caption: string }[] = [
  { id: 'exp', name: 'Expenses', title: 'Expenses', caption: 'One row each: month, label, category, paid by, advance, amount' },
  { id: 'cat', name: 'By category', title: 'Totals by category', caption: 'Spent, planned and % for each month' },
  { id: 'plan', name: 'Plan by category', title: 'Plan by category', caption: 'Planned amount for each category and one-off expense' },
  { id: 'fc', name: 'Forecast', title: 'Forecast and shares', caption: 'Planned total, % and transfer per member' },
  { id: 'adv', name: 'Advances', title: 'Advances', caption: 'Who paid what, and when it was repaid' }
];

const eur = (cents: number): Cell => ({ v: cents / 100, s: 'money' });
const H = (s: string): Cell => ({ v: s, s: 'header' });

export function exportFileName(db: Db, months: MonthKey[], everything: boolean): string {
  const base = 'duocount-' + slug(household(db)?.name ?? 'household');
  if (everything) return base + '-all-data.xlsx';
  if (!months.length) return base + '.xlsx';
  if (months.length === 1) return base + '-' + months[0] + '.xlsx';
  return base + '-' + months[0] + '_to_' + months[months.length - 1] + '.xlsx';
}

export function buildWorkbook(db: Db, months: MonthKey[], sheets: SheetId[]): Uint8Array {
  const set = new Set(months);
  const cats = allCategories(db);
  const ms = allMembers(db);
  const payerName = (p: string) => (p === 'joint' ? 'Joint account' : ms.get(p)?.name ?? 'Former member');
  const catName = (id: string) => cats.get(id)?.name ?? 'Deleted category';
  const list = expenses(db)
    .filter((e) => set.has(e.month))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.at - b.at));
  const out: Sheet[] = [];

  if (sheets.includes('exp')) {
    const rows: Cell[][] = [[H('Month'), H('Label'), H('Category'), H('Paid by'), H('Reimbursed'), H('Entered as'), H('Amount')]];
    for (const e of list) {
      rows.push([
        monthName(e.month),
        e.label,
        catName(e.categoryId),
        payerName(e.payer),
        e.payer === 'joint' ? '' : e.advance ? 'By the joint account' : 'By the other member',
        e.kind === 'total' ? 'Category total' : 'One expense',
        eur(e.amount)
      ]);
    }
    rows.push([{ v: 'Household total', s: 'bold' }, null, null, null, null, null, { v: list.filter((e) => !isBetweenMembers(e)).reduce((a, e) => a + e.amount, 0) / 100, s: 'moneyBold' }]);
    out.push({ name: 'Expenses', columns: [{ width: 16 }, { width: 30 }, { width: 18 }, { width: 16 }, { width: 20 }, { width: 16 }, { width: 12 }], rows });
  }

  if (sheets.includes('cat')) {
    const rows: Cell[][] = [[H('Month'), H('Category'), H('Expenses'), H('Spent'), H('Planned'), H('% of plan')]];
    for (const m of months) {
      const stats = monthStats(db, m);
      const ids = new Set<string>([...stats.byCat.keys()]);
      const f = forecastView(db, m);
      if (f.confirmedAt) f.lines.forEach((l) => l.amount && ids.add(l.cat.id));
      const sorted = [...ids].sort((a, b) => (cats.get(a)?.order ?? 99) - (cats.get(b)?.order ?? 99));
      for (const id of sorted) {
        const spent = stats.byCat.get(id)?.spent ?? 0;
        const planned = plannedFor(db, m, id);
        rows.push([monthName(m), catName(id), stats.byCat.get(id)?.count ?? 0, eur(spent), planned ? eur(planned) : null, planned ? { v: spent / planned, s: 'percent' } : null]);
      }
      const budget = budgetOf(db, m);
      rows.push([
        { v: monthName(m) + ' total', s: 'bold' },
        null,
        stats.count,
        { v: stats.total / 100, s: 'moneyBold' },
        budget ? { v: budget / 100, s: 'moneyBold' } : null,
        budget ? { v: stats.total / budget, s: 'percent' } : null
      ]);
    }
    out.push({ name: 'By category', columns: [{ width: 18 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }], rows });
  }

  if (sheets.includes('plan')) {
    const rows: Cell[][] = [[H('Month'), H('Status'), H('Line'), H('Type'), H('Planned')]];
    for (const m of months) {
      const rec = forecastRec(db, m);
      if (!rec) continue;
      const f = forecastView(db, m);
      const status = f.confirmedAt ? 'Confirmed' : 'Draft';
      // A confirmed plan is read as saved (categories deleted since then included); a draft as shown on screen.
      const lines: [string, number][] = f.confirmedAt ? Object.entries(rec.data.lines) : f.lines.map((l) => [l.cat.id, l.amount]);
      lines
        .filter(([, amount]) => amount > 0)
        .sort(([a], [b]) => (cats.get(a)?.order ?? 99) - (cats.get(b)?.order ?? 99))
        .forEach(([id, amount]) => rows.push([monthName(m), status, catName(id), 'Category', eur(amount)]));
      for (const x of f.extras) rows.push([monthName(m), status, x.label || 'One-off expense', 'One-off', eur(x.amount)]);
      rows.push([{ v: monthName(m) + ' total', s: 'bold' }, null, null, null, { v: f.total / 100, s: 'moneyBold' }]);
    }
    out.push({ name: 'Plan by category', columns: [{ width: 18 }, { width: 11 }, { width: 26 }, { width: 10 }, { width: 12 }], rows });
  }

  if (sheets.includes('fc')) {
    const rows: Cell[][] = [[H('Month'), H('Status'), H('Planned total'), H('Member'), H('Share'), H('Share of total'), H('Balance carried in'), H('To transfer'), H('Received')]];
    for (const m of months) {
      if (!forecasts(db).some((f) => f.id === m)) continue;
      const f = forecastView(db, m);
      for (const s of f.shares) {
        const got = received(db, m, s.member.id);
        rows.push([
          monthName(m),
          f.confirmedAt ? 'Confirmed' : 'Draft',
          eur(f.total),
          s.member.name,
          { v: s.pct / 100, s: 'percent' },
          eur(s.gross),
          eur(-s.carry),
          eur(s.transfer),
          got == null ? null : eur(got)
        ]);
      }
    }
    out.push({ name: 'Forecast', columns: [{ width: 18 }, { width: 11 }, { width: 14 }, { width: 16 }, { width: 8 }, { width: 14 }, { width: 18 }, { width: 13 }, { width: 12 }], rows });
  }

  if (sheets.includes('adv')) {
    const rows: Cell[][] = [[H('Month'), H('Label'), H('Category'), H('Paid by'), H('Amount'), H('Settled')]];
    for (const e of list.filter((x) => x.payer !== 'joint')) {
      const other = [...ms.values()].find((x) => !x.deleted && x.id !== e.payer);
      const how = e.advance ? 'Reimbursed by the joint account' : 'Owed by ' + (other?.name ?? 'the other member');
      rows.push([monthName(e.month), e.label, catName(e.categoryId), payerName(e.payer), eur(e.amount), how + ' · ' + monthName(addMonths(e.month, 1)) + ' forecast']);
    }
    out.push({ name: 'Advances', columns: [{ width: 16 }, { width: 28 }, { width: 18 }, { width: 16 }, { width: 12 }, { width: 22 }], rows });
  }

  return buildXlsx(out);
}

/** Expenses count for a set of months (shown before exporting). */
export function countExpenses(db: Db, months: MonthKey[]): number {
  const set = new Set(months);
  return expenses(db).filter((e) => set.has(e.month)).length;
}


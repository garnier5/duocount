import type { Db } from '../data/store';
import { addMonths, type MonthKey } from '../lib/dates';
import { currentMonth, forecastView, monthInfo, monthStats, startMonth } from './calc';
import { allCategories, expenses, forecastRec, forecasts } from './select';
import type { Cents } from '../lib/money';

export type ChartRange = 'six' | 'year';

/** Planned and paid totals of a month. `null` when there is no plan yet, or nothing entered yet. */
export interface MonthPoint {
  month: MonthKey;
  planned: Cents | null;
  paid: Cents | null;
}

/** Last month worth showing: the latest plan, expense or the current month. */
export function lastChartMonth(db: Db): MonthKey {
  let last = currentMonth();
  for (const f of forecasts(db)) if (f.id > last) last = f.id;
  for (const e of expenses(db)) if (e.month > last) last = e.month;
  return last;
}

/** Months of the chart, oldest first: the last six, or January to the last one. Never before the household started. */
export function chartMonths(db: Db, range: ChartRange): MonthKey[] {
  const last = lastChartMonth(db);
  const first = range === 'six' ? addMonths(last, -5) : last.slice(0, 4) + '-01';
  const start = startMonth(db);
  const out: MonthKey[] = [];
  for (let m = first < start ? start : first; m <= last; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function monthPoint(db: Db, m: MonthKey): MonthPoint {
  const planned = forecastRec(db, m) ? forecastView(db, m).total : null;
  const stats = monthStats(db, m);
  const paid = stats.count > 0 || monthInfo(db, m).phase === 'closed' ? stats.total : null;
  return { month: m, planned, paid };
}

/** One slice of the breakdown: a category, the plan's one-off expenses, or everything else grouped. */
export interface Slice {
  id: string;
  name: string;
  color: string;
  planned: Cents;
  paid: Cents;
}

export const OTHER_COLOR = '#8E8E93';
const ONE_OFF_COLOR = '#A2845E';

/** Planned and paid amounts per category. The five biggest stay apart, the rest is grouped into one slice. */
export function breakdown(db: Db, m: MonthKey, keep = 5): Slice[] {
  const cats = allCategories(db);
  const rows = new Map<string, Slice>();
  const row = (id: string): Slice => {
    let r = rows.get(id);
    if (!r) {
      const c = cats.get(id);
      r = { id, name: c?.name ?? 'Deleted category', color: c?.color ?? OTHER_COLOR, planned: 0, paid: 0 };
      rows.set(id, r);
    }
    return r;
  };
  const rec = forecastRec(db, m);
  if (rec) {
    const view = forecastView(db, m);
    // A confirmed plan is read as saved; a draft as shown on its screen.
    const lines: [string, Cents][] = view.confirmedAt ? Object.entries(rec.data.lines) : view.lines.map((l) => [l.cat.id, l.amount]);
    for (const [id, amount] of lines) if (amount > 0) row(id).planned += amount;
    const extras = view.extras.filter((x) => x.amount > 0);
    if (extras.length) {
      rows.set('oneoff', {
        id: 'oneoff',
        name: extras.length === 1 && extras[0].label ? extras[0].label : 'One-off expenses',
        color: ONE_OFF_COLOR,
        planned: extras.reduce((a, x) => a + x.amount, 0),
        paid: 0
      });
    }
  }
  for (const [id, s] of monthStats(db, m).byCat) row(id).paid += s.spent;
  const sorted = [...rows.values()].filter((r) => r.planned > 0 || r.paid > 0).sort((a, b) => b.planned + b.paid - (a.planned + a.paid));
  if (sorted.length <= keep + 1) return sorted;
  const rest = sorted.slice(keep);
  return [
    ...sorted.slice(0, keep),
    {
      id: 'other',
      name: rest.map((r) => r.name).join(', '),
      color: OTHER_COLOR,
      planned: rest.reduce((a, r) => a + r.planned, 0),
      paid: rest.reduce((a, r) => a + r.paid, 0)
    }
  ];
}

/** A round top for the y axis, split into three steps: 2,000 → 3,000 with steps of 1,000. */
export function axisTop(max: Cents): { top: Cents; step: Cents } {
  if (max <= 0) return { top: 300000, step: 100000 };
  const raw = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw) ?? 10 * pow;
  return { top: step * 3, step };
}

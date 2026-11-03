import { sameData } from './records';
import type { Expense, ExpenseVersion, Forecast, MonthClosing, MonthDoc, PlanConfirmation, Rec, Received, ReceivedVersion } from './types';

/** Entries kept per record: plenty for a household, and a sync file stays small. */
export const HISTORY_MAX = 50;

export function pushHistory<T>(list: T[] | undefined, entry: T): T[] {
  return [...(list ?? []), entry].slice(-HISTORY_MAX);
}

/** The current version of an expense, as an entry for its history. */
export function expenseVersion(rec: Rec<Expense>): ExpenseVersion {
  const e = rec.data;
  return { at: rec.at, by: rec.by, month: e.month, label: e.label, amount: e.amount, categoryId: e.categoryId, payer: e.payer, advance: e.advance };
}

export function receivedVersion(rec: Rec<Received>): ReceivedVersion {
  return { at: rec.at, by: rec.by, amount: rec.data.amount };
}

/**
 * Every confirmation of a plan, oldest first. Plans confirmed before the history was kept
 * have only their current snapshot.
 */
export function confirmations(rec: Rec<Forecast> | undefined): PlanConfirmation[] {
  const f = rec?.data;
  if (!f) return [];
  if (f.history?.length) return f.history;
  if (f.confirmedAt && f.shares) return [{ at: f.confirmedAt, by: rec.by, total: f.total ?? 0, lines: f.lines, extras: f.extras, shares: f.shares }];
  return [];
}

/** The plan with its current confirmation written into the history (for plans confirmed before it existed). */
export function withConfirmations(rec: Rec<Forecast> | undefined, f: Forecast): Forecast {
  const list = confirmations(rec);
  return list.length ? { ...f, history: list } : f;
}

export function closings(doc: MonthDoc | undefined): MonthClosing[] {
  return doc?.history ?? [];
}

function union<T extends { at: number }>(a: T[] = [], b: T[] = []): T[] {
  const out: T[] = [];
  for (const x of [...a, ...b]) if (!out.some((y) => sameData(x, y))) out.push(x);
  return out.sort((x, y) => x.at - y.at).slice(-HISTORY_MAX);
}

/** Same values apart from the history (a version only the history differs from adds nothing to review). */
export function sameButHistory(a: unknown, b: unknown): boolean {
  const strip = (x: unknown) => {
    if (!x || typeof x !== 'object') return x;
    const { history: _h, ...rest } = x as { history?: unknown };
    return rest;
  };
  return sameData(strip(a), strip(b));
}

const fieldsOf = ({ at: _at, by: _by, ...rest }: { at: number; by: string }) => rest;

/**
 * Data to keep when a conflict is resolved in favour of `chosen`: the histories of both
 * phones, plus the version that was not picked, so nothing either phone showed is lost.
 */
export function mergeHistories(chosen: Rec, other: Rec): unknown {
  if (other.deleted || chosen.deleted) return chosen.data;
  switch (chosen.type) {
    case 'expense': {
      const c = chosen as Rec<Expense>;
      const o = other as Rec<Expense>;
      const v = expenseVersion(o);
      const extra = sameData(fieldsOf(v), fieldsOf(expenseVersion(c))) ? [] : [v];
      return { ...c.data, history: union(c.data.history, [...(o.data.history ?? []), ...extra]) };
    }
    case 'received': {
      const c = chosen as Rec<Received>;
      const o = other as Rec<Received>;
      const extra = o.data.amount === c.data.amount ? [] : [receivedVersion(o)];
      return { ...c.data, history: union(c.data.history, [...(o.data.history ?? []), ...extra]) };
    }
    case 'forecast': {
      const c = chosen as Rec<Forecast>;
      const o = other as Rec<Forecast>;
      const h = union(confirmations(c), confirmations(o));
      return h.length ? { ...c.data, history: h } : c.data;
    }
    case 'month': {
      const c = chosen as Rec<MonthDoc>;
      const o = other as Rec<MonthDoc>;
      const h = union(c.data.history, o.data.history);
      return h.length ? { ...c.data, history: h } : c.data;
    }
    default:
      return chosen.data;
  }
}

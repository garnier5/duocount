import type { Db } from '../data/store';
import type { Category, Expense, Forecast, Household, Member, MonthDoc, Rec, Received } from './types';
import type { MonthKey } from '../lib/dates';
import type { Cents } from '../lib/money';

export type WithId<T> = T & { id: string };
export type MemberView = WithId<Member> & { deleted: boolean };
export type CategoryView = WithId<Category> & { deleted: boolean };
export type ExpenseView = WithId<Expense> & { at: number; by: string };

// Derived lists are cached per records map (a new map is created on every write).
const cache = new WeakMap<object, Map<string, unknown>>();

function memo<T>(db: Db, key: string, fn: () => T): T {
  let m = cache.get(db.records);
  if (!m) {
    m = new Map();
    cache.set(db.records, m);
  }
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

function ofType<T>(db: Db, type: Rec['type']): Rec<T>[] {
  return memo(db, 'type:' + type, () => {
    const out: Rec<T>[] = [];
    for (const r of db.records.values()) if (r.type === type) out.push(r as Rec<T>);
    return out;
  });
}

export function householdRec(db: Db): Rec<Household> | undefined {
  const id = db.local.householdId;
  return id ? (db.records.get('household:' + id) as Rec<Household> | undefined) : undefined;
}

export function household(db: Db): Household | null {
  return householdRec(db)?.data ?? null;
}

export function allMembers(db: Db): Map<string, MemberView> {
  return memo(db, 'allMembers', () => {
    const m = new Map<string, MemberView>();
    for (const r of ofType<Member>(db, 'member')) m.set(r.id, { ...r.data, id: r.id, deleted: !!r.deleted });
    return m;
  });
}

export function members(db: Db): MemberView[] {
  return memo(db, 'members', () =>
    [...allMembers(db).values()].filter((m) => !m.deleted).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  );
}

export function member(db: Db, id: string | null | undefined): MemberView | undefined {
  return id ? allMembers(db).get(id) : undefined;
}

export function me(db: Db): MemberView | undefined {
  return member(db, db.local.meId);
}

export function others(db: Db): MemberView[] {
  return members(db).filter((m) => m.id !== db.local.meId);
}

export function allCategories(db: Db): Map<string, CategoryView> {
  return memo(db, 'allCategories', () => {
    const m = new Map<string, CategoryView>();
    for (const r of ofType<Category>(db, 'category')) m.set(r.id, { ...r.data, id: r.id, deleted: !!r.deleted });
    return m;
  });
}

export function categories(db: Db): CategoryView[] {
  return memo(db, 'categories', () =>
    [...allCategories(db).values()].filter((c) => !c.deleted).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  );
}

export function category(db: Db, id: string): CategoryView | undefined {
  return allCategories(db).get(id);
}

/** All live expenses: latest month first, then the latest added or changed first. */
export function expenses(db: Db): ExpenseView[] {
  return memo(db, 'expenses', () =>
    ofType<Expense>(db, 'expense')
      .filter((r) => !r.deleted)
      .map((r) => ({ ...r.data, id: r.id, at: r.at, by: r.by }))
      .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : b.at - a.at))
  );
}

export function expensesOf(db: Db, month: MonthKey): ExpenseView[] {
  return memo(db, 'expensesOf:' + month, () => expenses(db).filter((e) => e.month === month));
}

export function expenseRec(db: Db, id: string): Rec<Expense> | undefined {
  return db.records.get('expense:' + id) as Rec<Expense> | undefined;
}

export const EMPTY_MONTH: MonthDoc = { closedAt: null, dismissed: [] };

export function monthRec(db: Db, month: MonthKey): Rec<MonthDoc> | undefined {
  return db.records.get('month:' + month) as Rec<MonthDoc> | undefined;
}

export function monthDoc(db: Db, month: MonthKey): MonthDoc {
  const r = monthRec(db, month);
  return r && !r.deleted ? { ...EMPTY_MONTH, ...r.data } : EMPTY_MONTH;
}

export function closedMonths(db: Db): MonthKey[] {
  return memo(db, 'closedMonths', () =>
    ofType<MonthDoc>(db, 'month')
      .filter((r) => !r.deleted && r.data.closedAt)
      .map((r) => r.id)
      .sort()
  );
}

export function forecastRec(db: Db, month: MonthKey): Rec<Forecast> | undefined {
  const r = db.records.get('forecast:' + month) as Rec<Forecast> | undefined;
  return r && !r.deleted ? r : undefined;
}

export function forecasts(db: Db): Rec<Forecast>[] {
  return memo(db, 'forecasts', () => ofType<Forecast>(db, 'forecast').filter((r) => !r.deleted));
}

export function receivedRec(db: Db, month: MonthKey, memberId: string): Rec<Received> | undefined {
  const r = db.records.get('received:' + month + ':' + memberId) as Rec<Received> | undefined;
  return r && !r.deleted ? r : undefined;
}

export function received(db: Db, month: MonthKey, memberId: string): Cents | null {
  return receivedRec(db, month, memberId)?.data.amount ?? null;
}

/** Months that have any data, oldest first. */
export function monthsWithData(db: Db): MonthKey[] {
  return memo(db, 'monthsWithData', () => {
    const s = new Set<MonthKey>();
    for (const e of expenses(db)) s.add(e.month);
    for (const f of forecasts(db)) s.add(f.id);
    return [...s].sort();
  });
}

export function liveRecordCount(db: Db, type: Rec['type']): number {
  return ofType(db, type).filter((r) => !r.deleted).length;
}

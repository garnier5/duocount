import type { Db } from '../data/store';
import { NEUTRAL } from '../domain/defaults';
import { allCategories, allMembers } from '../domain/select';
import type { Category, Expense, Forecast, Household, Member, MonthDoc, Rec, Received } from '../domain/types';
import { dateKey, monthName, monthShort, shortDay } from '../lib/dates';
import { money, type Cents } from '../lib/money';
import type { IconName } from '../ui/icons';

export interface Described {
  title: string;
  sub: string;
  amount?: Cents;
  icon: IconName;
  color: string;
  isExpense: boolean;
}

/** A snapshot combining this phone's data with the incoming file, to resolve names. */
export function overlay(db: Db, incoming: Rec[]): Db {
  const records = new Map(db.records);
  for (const r of incoming) if (!records.has(r.key) || !r.deleted) records.set(r.key, r);
  return { ...db, records };
}

function payerName(view: Db, p: string): string {
  return p === 'joint' ? 'Joint account' : allMembers(view).get(p)?.name ?? 'Former member';
}

export function personName(view: Db, id: string, meId: string | null): string {
  if (id === meId) return 'you';
  return allMembers(view).get(id)?.name ?? 'someone';
}

function expenseSub(view: Db, e: Expense): string {
  const cat = allCategories(view).get(e.categoryId)?.name ?? 'Deleted category';
  return cat + ' · ' + monthShort(e.month) + ' · ' + payerName(view, e.payer);
}

/** What changed between two versions of an expense: "Amount: €7.40 → €8.40". */
export function expenseDiff(view: Db, a: Expense, b: Expense): string {
  const parts: string[] = [];
  if (a.amount !== b.amount) parts.push('Amount: ' + money(a.amount) + ' → ' + money(b.amount));
  if (a.month !== b.month) parts.push('Month: ' + monthShort(a.month) + ' → ' + monthShort(b.month));
  if (a.label !== b.label) parts.push('Label: “' + a.label + '” → “' + b.label + '”');
  if (a.categoryId !== b.categoryId) {
    const cats = allCategories(view);
    parts.push('Category: ' + (cats.get(a.categoryId)?.name ?? '?') + ' → ' + (cats.get(b.categoryId)?.name ?? '?'));
  }
  if (a.payer !== b.payer || a.advance !== b.advance) {
    const who = (e: Expense) => payerName(view, e.payer) + (e.advance ? ' (advance)' : '');
    parts.push('Paid by: ' + who(a) + ' → ' + who(b));
  }
  return parts.join(' · ') || 'Details updated';
}

export function describe(view: Db, kind: 'added' | 'changed' | 'deleted', after: Rec, before?: Rec): Described {
  const meId = view.local.meId;
  switch (after.type) {
    case 'expense': {
      const e = after.data as Expense;
      const cat = allCategories(view).get(e.categoryId) as Category | undefined;
      const base = { title: e.label || cat?.name || 'Expense', amount: e.amount, icon: cat?.icon ?? ('receipt' as IconName), color: cat?.color ?? NEUTRAL, isExpense: true };
      if (kind === 'deleted') return { ...base, sub: 'Deleted by ' + personName(view, after.by, meId) + ' · ' + shortDay(dateKey(new Date(after.at))) };
      if (kind === 'changed' && before) return { ...base, sub: expenseDiff(view, before.data as Expense, e) };
      return { ...base, sub: expenseSub(view, e) };
    }
    case 'category': {
      const c = after.data as Category;
      const sub = kind === 'added' ? 'New category' : kind === 'deleted' ? 'Category deleted' : 'Category updated';
      return { title: c.name, sub, icon: c.icon, color: c.color, isExpense: false };
    }
    case 'member': {
      const m = after.data as Member;
      const sub = kind === 'added' ? 'New member · ' + m.share + '%' : kind === 'deleted' ? 'Removed from the household' : 'Now ' + m.share + '% · name or color may have changed';
      return { title: m.name, sub, icon: 'people', color: m.color, isExpense: false };
    }
    case 'forecast': {
      const f = after.data as Forecast;
      const was = before?.data as Forecast | undefined;
      let sub = f.confirmedAt ? 'Confirmed' : 'Draft updated';
      if (was?.confirmedAt && !f.confirmedAt) sub = 'Reopened';
      if (kind === 'deleted') sub = 'Deleted';
      return { title: 'Forecast for ' + monthName(after.id), sub, icon: 'calendar', color: '#0B7A75', isExpense: false };
    }
    case 'month': {
      const m = after.data as MonthDoc;
      const was = before?.data as MonthDoc | undefined;
      let sub = m.closedAt ? 'Month closed' : 'Month-end checks answered';
      if (was?.closedAt && !m.closedAt) sub = 'Month reopened';
      return { title: monthName(after.id), sub, icon: 'checklist', color: '#D9622B', isExpense: false };
    }
    case 'received': {
      const r = after.data as Received;
      return {
        title: 'Transfer from ' + (allMembers(view).get(r.memberId)?.name ?? 'a member'),
        sub: monthShort(r.month) + ' · ' + (kind === 'deleted' ? 'cleared' : 'recorded'),
        amount: kind === 'deleted' ? undefined : r.amount,
        icon: 'card',
        color: '#2F7FD0',
        isExpense: false
      };
    }
    case 'household': {
      const h = after.data as Household;
      return { title: h.name, sub: 'Household name or currency updated', icon: 'house', color: '#0B7A75', isExpense: false };
    }
  }
}

/** One line for a conflict option: "Edited by Julien, Oct 12". */
export function versionLine(view: Db, r: Rec): string {
  const who = personName(view, r.by, view.local.meId);
  const when = shortDay(dateKey(new Date(r.at)));
  return (r.deleted ? 'Deleted by ' : 'Edited by ') + who + ', ' + when;
}

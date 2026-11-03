import { getDb, setLocal, write } from '../data/store';
import { addMonths, monthKey, monthShort, type MonthKey } from '../lib/dates';
import type { Cents } from '../lib/money';
import { makeCheck } from '../sync/crypto';
import { computeShares, forecastView, memberBalances, monthStats } from './calc';
import { expenseVersion, pushHistory, receivedVersion, withConfirmations } from './history';
import { createRec, editRec, randomId, recKey, sameData, uuid } from './records';
import { categories, expenseRec, expensesOf, forecastRec, householdRec, members, monthRec, receivedRec } from './select';
import type { BalanceSnapshot, Category, Expense, Forecast, Household, Member, MonthDoc, Rec, RecType, Received } from './types';

function by(): string {
  return getDb().local.meId ?? 'unknown';
}

function get<T>(type: RecType, id: string): Rec<T> | undefined {
  return getDb().records.get(recKey(type, id)) as Rec<T> | undefined;
}

/** Creates the record, or a new version of it (also revives a deleted one). */
function upsert<T>(type: RecType, id: string, data: T): Rec<T> {
  const cur = get<T>(type, id);
  return cur ? editRec(cur, data, by()) : createRec(type, id, data, by());
}

// ---------- Expenses ----------

export interface ExpenseInput {
  month: MonthKey;
  label: string;
  amount: Cents;
  categoryId: string;
  payer: string;
  advance: boolean;
  kind?: Expense['kind'];
  recurring?: boolean;
}

function toExpense(input: ExpenseInput): Expense {
  return {
    month: input.month,
    label: input.label.trim(),
    amount: input.amount,
    categoryId: input.categoryId,
    payer: input.payer,
    advance: input.payer !== 'joint' && input.advance,
    kind: input.kind ?? 'single',
    ...(input.recurring ? { recurring: true } : {})
  };
}

export function addExpense(input: ExpenseInput): string {
  const db = getDb();
  const id = uuid();
  const firstEver = ![...db.records.values()].some((r) => r.type === 'expense');
  write([createRec<Expense>('expense', id, toExpense(input), by())]);
  if (firstEver) setLocal({ firstExpenseBanner: true });
  return id;
}

export function updateExpense(id: string, input: ExpenseInput) {
  const cur = expenseRec(getDb(), id);
  if (!cur) return;
  const next: Expense = { ...toExpense(input), kind: input.kind ?? cur.data.kind };
  const { history, ...was } = cur.data;
  if (sameData(next, was)) return;
  write([editRec(cur, { ...next, history: pushHistory(history, expenseVersion(cur)) }, by())]);
}

/** Deletes an expense and returns a function that brings it back. */
export function deleteExpense(id: string): () => void {
  const cur = expenseRec(getDb(), id);
  if (!cur) return () => {};
  const deleted = editRec(cur, cur.data, by(), true);
  write([deleted]);
  return () => {
    const now = expenseRec(getDb(), id);
    if (now) write([editRec(now, cur.data, by())]);
  };
}

/** Sets the "category total" typed at month end (empty clears it). */
export function setCategoryTotal(month: MonthKey, cat: { id: string; name: string; recurringDay: number | null }, amount: Cents | null) {
  const db = getDb();
  const existing = expensesOf(db, month).find((e) => e.kind === 'total' && e.categoryId === cat.id);
  if (amount == null || amount <= 0) {
    if (existing) deleteExpense(existing.id);
    return;
  }
  const input: ExpenseInput = {
    month,
    label: cat.name + ', total for ' + monthShort(month),
    amount,
    categoryId: cat.id,
    payer: 'joint',
    advance: false,
    kind: 'total',
    recurring: !!cat.recurringDay
  };
  if (existing) {
    if (existing.amount !== amount) updateExpense(existing.id, input);
  } else addExpense(input);
}

// ---------- Months ----------

function saveMonth(month: MonthKey, patch: (base: MonthDoc) => Partial<MonthDoc>) {
  const cur = monthRec(getDb(), month);
  const base: MonthDoc = cur && !cur.deleted ? cur.data : { closedAt: null, dismissed: [] };
  write([upsert<MonthDoc>('month', month, { ...base, ...patch(base) })]);
}

/** Closes the month and keeps what it showed at that moment, to compare with later corrections. */
export function closeMonth(month: MonthKey) {
  const db = getDb();
  const at = Date.now();
  const balances: Record<string, BalanceSnapshot> = {};
  for (const b of memberBalances(db, month)) {
    const { member, advanceCount: _count, ...snap } = b;
    balances[member.id] = snap;
  }
  saveMonth(month, (base) => ({ closedAt: at, history: pushHistory(base.history, { at, by: by(), spent: monthStats(db, month).total, balances }) }));
}

export function reopenMonth(month: MonthKey) {
  saveMonth(month, () => ({ closedAt: null }));
}

// ---------- Forecast ----------

function currentForecast(month: MonthKey): Forecast {
  const db = getDb();
  const rec = forecastRec(db, month);
  if (rec) return rec.data;
  // First edit of a draft: freeze the pre-filled amounts.
  const view = forecastView(db, month);
  const lines: Record<string, Cents> = {};
  view.lines.forEach((l) => (lines[l.cat.id] = l.amount));
  return { lines, extras: [], confirmedAt: null };
}

function saveForecast(month: MonthKey, data: Forecast) {
  write([upsert<Forecast>('forecast', month, data)]);
}

export function setForecastLine(month: MonthKey, catId: string, amount: Cents) {
  const f = currentForecast(month);
  saveForecast(month, { ...f, lines: { ...f.lines, [catId]: Math.max(0, amount) } });
}

export function addForecastExtra(month: MonthKey, label: string, amount: Cents) {
  const f = currentForecast(month);
  saveForecast(month, { ...f, extras: [...f.extras, { id: randomId(8), label, amount }] });
}

export function updateForecastExtra(month: MonthKey, id: string, patch: { label?: string; amount?: Cents }) {
  const f = currentForecast(month);
  saveForecast(month, { ...f, extras: f.extras.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
}

export function removeForecastExtra(month: MonthKey, id: string) {
  const f = currentForecast(month);
  saveForecast(month, { ...f, extras: f.extras.filter((x) => x.id !== id) });
}

/** Confirms the plan, or works out the transfers again from the current balances (each time is kept). */
export function confirmForecast(month: MonthKey) {
  const db = getDb();
  const f = withConfirmations(forecastRec(db, month), currentForecast(month));
  const view = forecastView(db, month);
  const lines: Record<string, Cents> = {};
  view.lines.forEach((l) => (lines[l.cat.id] = l.amount));
  const at = Date.now();
  const shares = computeShares(db, view.total, month);
  saveForecast(month, {
    lines,
    extras: f.extras,
    confirmedAt: at,
    total: view.total,
    shares,
    history: pushHistory(f.history, { at, by: by(), total: view.total, lines, extras: f.extras, shares })
  });
}

export function unconfirmForecast(month: MonthKey) {
  const f = withConfirmations(forecastRec(getDb(), month), currentForecast(month));
  // Keep the confirmed shares: their percentages still apply if the month has expenses.
  saveForecast(month, { lines: f.lines, extras: f.extras, confirmedAt: null, shares: f.shares, ...(f.history ? { history: f.history } : {}) });
}

export function setReceived(month: MonthKey, memberId: string, amount: Cents | null) {
  const id = month + ':' + memberId;
  const cur = receivedRec(getDb(), month, memberId);
  if (amount == null) {
    if (cur) write([editRec(cur, cur.data, by(), true)]);
    return;
  }
  if (cur && cur.data.amount === amount) return;
  // Also after "Not done yet": the amount recorded then stays in the history.
  const was = cur ?? get<Received>('received', id);
  const history = was ? pushHistory(was.data.history, receivedVersion(was)) : undefined;
  write([upsert<Received>('received', id, { month, memberId, amount, ...(history ? { history } : {}) })]);
}

// ---------- Categories ----------

export interface CategoryInput {
  name: string;
  icon: Category['icon'];
  color: string;
  planned: Cents | null;
  recurringDay: number | null;
}

export function saveCategory(id: string | null, input: CategoryInput): string {
  const db = getDb();
  if (id) {
    const cur = get<Category>('category', id);
    if (cur) write([editRec(cur, { ...cur.data, ...input, name: input.name.trim() }, by())]);
    return id;
  }
  const order = categories(db).reduce((m, c) => Math.max(m, c.order), -1) + 1;
  const newId = uuid();
  write([createRec<Category>('category', newId, { ...input, name: input.name.trim(), order, custom: true }, by())]);
  return newId;
}

export function reorderCategories(ids: string[]) {
  const recs: Rec[] = [];
  ids.forEach((id, i) => {
    const cur = get<Category>('category', id);
    if (cur && cur.data.order !== i) recs.push(editRec(cur, { ...cur.data, order: i }, by()));
  });
  write(recs);
}

/** Deletes a category, moving its expenses (and planned amounts) to another one, or deleting them too. */
export function deleteCategory(id: string, moveTo: string | null) {
  const db = getDb();
  const cur = get<Category>('category', id);
  if (!cur) return;
  const recs: Rec[] = [];
  for (const r of db.records.values()) {
    if (r.type === 'expense' && !r.deleted && (r.data as Expense).categoryId === id) {
      const e = r as Rec<Expense>;
      recs.push(moveTo ? editRec(e, { ...e.data, categoryId: moveTo }, by()) : editRec(e, e.data, by(), true));
    }
    if (moveTo && r.type === 'forecast' && !r.deleted) {
      const f = r as Rec<Forecast>;
      if (!f.data.confirmedAt && f.data.lines[id] != null) {
        const lines = { ...f.data.lines, [moveTo]: (f.data.lines[moveTo] ?? 0) + f.data.lines[id] };
        delete lines[id];
        recs.push(editRec(f, { ...f.data, lines }, by()));
      }
    }
  }
  recs.push(editRec(cur, cur.data, by(), true));
  write(recs);
}

// ---------- Members and household ----------

export interface MemberDraft {
  id: string;
  name: string;
  color: string;
  share: number;
  removed?: boolean;
}

export function saveMembers(drafts: MemberDraft[]) {
  const recs: Rec[] = [];
  drafts.forEach((d, i) => {
    const cur = get<Member>('member', d.id);
    const data: Member = { name: d.name.trim(), color: d.color, share: d.share, order: i };
    if (d.removed) {
      if (cur && !cur.deleted) recs.push(editRec(cur, cur.data, by(), true));
      return;
    }
    if (!cur) recs.push(createRec<Member>('member', d.id, data, by()));
    else if (cur.deleted || JSON.stringify(cur.data) !== JSON.stringify(data)) recs.push(editRec(cur, data, by()));
  });
  write(recs);
}

export function saveHousehold(patch: Partial<Household>) {
  const cur = householdRec(getDb());
  if (cur) write([editRec(cur, { ...cur.data, ...patch }, by())]);
}

export interface SetupInput {
  householdName: string;
  members: { name: string; color: string; share: number }[];
  categories: { name: string; icon: Category['icon']; color: string; custom?: boolean }[];
  passphrase: string;
}

/** Creates the household on this phone at the end of onboarding. */
export async function createHousehold(input: SetupInput) {
  const passphraseCheck = await makeCheck(input.passphrase);
  const householdId = uuid();
  const memberIds = input.members.map(() => uuid());
  const meId = memberIds[0];
  const recs: Rec[] = [];
  recs.push(
    createRec<Household>(
      'household',
      householdId,
      { name: input.householdName.trim() || 'Our household', currency: 'EUR', startMonth: monthKey(), createdAt: Date.now() },
      meId
    )
  );
  input.members.forEach((m, i) => recs.push(createRec<Member>('member', memberIds[i], { name: m.name.trim(), color: m.color, share: m.share, order: i }, meId)));
  input.categories.forEach((c, i) =>
    recs.push(createRec<Category>('category', uuid(), { name: c.name, icon: c.icon, color: c.color, order: i, planned: null, recurringDay: null, custom: c.custom }, meId))
  );
  write(recs);
  setLocal({ householdId, meId, passphraseCheck, passphraseSetAt: Date.now(), selectedMonth: monthKey() });
}

export function nextMonthOf(month: MonthKey): MonthKey {
  return addMonths(month, 1);
}

export function memberIdsWithShares() {
  return members(getDb()).map((m) => ({ id: m.id, pct: m.share }));
}

import type { Db } from '../data/store';
import { addMonths, dateKey, lastDayOf, monthKey, monthShort, ordinal, plural, shortDay, type DateKey, type MonthKey } from '../lib/dates';
import { money, percent, splitByShares, type Cents } from '../lib/money';
import {
  categories,
  closedMonths,
  expenses,
  expensesOf,
  forecastRec,
  household,
  members,
  monthDoc,
  monthsWithData,
  received,
  type CategoryView,
  type ExpenseView,
  type MemberView
} from './select';
import type { ForecastExtra, ForecastShare } from './types';

// ---------- Month navigation and status ----------

export function today(): DateKey {
  return dateKey();
}

export function currentMonth(): MonthKey {
  return monthKey();
}

export function isClosed(db: Db, m: MonthKey): boolean {
  return !!monthDoc(db, m).closedAt;
}

export function startMonth(db: Db): MonthKey {
  const hh = household(db);
  const first = expenses(db).reduce<MonthKey | null>((min, e) => (!min || e.month < min ? e.month : min), null);
  const s = hh?.startMonth ?? currentMonth();
  return first && first < s ? first : s;
}

/**
 * Months the household can start from, latest first: up to a year back, and never after
 * the current month or a month that already has a plan, expenses or a close.
 */
export function startMonthChoices(db: Db): MonthKey[] {
  const used = [...monthsWithData(db), ...closedMonths(db)].sort()[0];
  const cur = currentMonth();
  const latest = used && used < cur ? used : cur;
  const out: MonthKey[] = [];
  for (let m = latest; m >= addMonths(cur, -12); m = addMonths(m, -1)) out.push(m);
  const own = household(db)?.startMonth;
  if (own && !out.includes(own)) out.push(own);
  return out.sort().reverse();
}

/** Latest month the household can look at: this month, or the one after the last closed month. */
export function maxMonth(db: Db): MonthKey {
  const closed = closedMonths(db);
  const afterClosed = closed.length ? addMonths(closed[closed.length - 1], 1) : null;
  const cur = currentMonth();
  return afterClosed && afterClosed > cur ? afterClosed : cur;
}

export function clampMonth(db: Db, m: MonthKey | null | undefined): MonthKey {
  const min = startMonth(db);
  const max = maxMonth(db);
  if (!m) return defaultMonth(db);
  if (m < min) return min;
  if (m > max) return max;
  return m;
}

/** The month people most likely want to see: the oldest month still to close, else the current one. */
export function defaultMonth(db: Db): MonthKey {
  const cur = currentMonth();
  const prev = addMonths(cur, -1);
  if (prev >= startMonth(db) && !isClosed(db, prev) && expensesOf(db, prev).length > 0) return prev;
  return cur;
}

export type Tone = 'good' | 'warn' | 'sec' | 'bad';
export type Phase = 'closed' | 'open' | 'toEnter' | 'toClose' | 'future';

export interface MonthInfo {
  phase: Phase;
  stat: string;
  tone: Tone;
  count: number;
}

export function monthInfo(db: Db, m: MonthKey, now: DateKey = today()): MonthInfo {
  const count = expensesOf(db, m).length;
  const n = plural(count, 'expense');
  const cur = now.slice(0, 7);
  if (isClosed(db, m)) return { phase: 'closed', stat: 'Closed · ' + n, tone: 'good', count };
  if (m > cur) return { phase: 'future', stat: 'Starts on ' + shortDay(m + '-01'), tone: 'sec', count };
  if (!canEnterExpenses(db, m)) {
    const phase: Phase = m < cur ? 'toClose' : now === lastDayOf(m) ? 'toEnter' : 'open';
    return { phase, stat: 'Plan to confirm first', tone: 'warn', count };
  }
  if (m < cur) return { phase: 'toClose', stat: count ? 'To close · ' + n : 'To enter · nothing entered', tone: 'warn', count };
  if (now === lastDayOf(m)) return { phase: 'toEnter', stat: 'To enter · last day of the month', tone: 'warn', count };
  return { phase: 'open', stat: count ? 'In progress · ' + n : 'In progress · nothing entered', tone: 'warn', count };
}

export const toneColor = (t: Tone) => (t === 'sec' ? 'var(--sec)' : 'var(--' + t + ')');

/** True when the month-end routine should be suggested for this month. */
export function isMonthEnd(db: Db, m: MonthKey, now: DateKey = today()): boolean {
  const p = monthInfo(db, m, now).phase;
  return p === 'toEnter' || p === 'toClose';
}

/// ---------- Spending ----------

/** Paid by a member and not reimbursed by the joint account: the other member owes it all. */
export function isBetweenMembers(e: { payer: string; advance: boolean }): boolean {
  return e.payer !== 'joint' && !e.advance;
}

/**
 * Household spending of a month or a category, split by how it was entered:
 * one total per category (from the joint account statement), or one by one
 * (from the joint account, or paid by a member and reimbursed).
 */
export interface SpendSplit {
  /** "Totals by category": typed at month end, always from the joint account. */
  totals: Cents;
  /** One by one, paid from the joint account. */
  singlesJoint: Cents;
  /** One by one, paid by a member and reimbursed by the joint account. */
  singlesAdvance: Cents;
}

export interface CatStat extends SpendSplit {
  spent: Cents;
  count: number;
  last: string;
}

export interface MonthStats extends SpendSplit {
  /** Household spending: joint account + expenses the account reimburses. */
  total: Cents;
  count: number;
  byCat: Map<string, CatStat>;
  /** Paid with a member's own money, reimbursed by the joint account. */
  advances: ExpenseView[];
  advanceTotal: Cents;
  /** Paid by one member for the other, outside the household budget. */
  between: ExpenseView[];
}

/** Where an expense counts in the split. Category totals are always from the joint account. */
function splitPart(e: { kind: string; payer: string }): keyof SpendSplit {
  if (e.kind === 'total') return 'totals';
  return e.payer === 'joint' ? 'singlesJoint' : 'singlesAdvance';
}

export function monthStats(db: Db, m: MonthKey): MonthStats {
  const list = expensesOf(db, m);
  const byCat = new Map<string, CatStat>();
  let total = 0;
  let count = 0;
  const advances: ExpenseView[] = [];
  const between: ExpenseView[] = [];
  const split: SpendSplit = { totals: 0, singlesJoint: 0, singlesAdvance: 0 };
  for (const e of list) {
    if (isBetweenMembers(e)) {
      between.push(e);
      continue;
    }
    total += e.amount;
    count += 1;
    const s = byCat.get(e.categoryId) ?? { spent: 0, count: 0, last: e.label, totals: 0, singlesJoint: 0, singlesAdvance: 0 };
    s.spent += e.amount;
    s.count += 1;
    const part: keyof SpendSplit = splitPart(e);
    s[part] += e.amount;
    split[part] += e.amount;
    byCat.set(e.categoryId, s);
    if (e.advance && e.payer !== 'joint') advances.push(e);
  }
  return { total, count, byCat, advances, advanceTotal: advances.reduce((a, e) => a + e.amount, 0), between, ...split };
}

// ---------- Forecast ----------

/** A forecast can be prepared for the first month, or once the previous month is closed. */
export function canPlan(db: Db, m: MonthKey): boolean {
  if (forecastRec(db, m)) return true;
  const start = startMonth(db);
  if (m === start) return true;
  return m > start && isClosed(db, addMonths(m, -1));
}

/** A month's expenses can be entered once its plan is confirmed (closed months stay correctable). */
export function canEnterExpenses(db: Db, m: MonthKey): boolean {
  return isClosed(db, m) || budgetOf(db, m) != null;
}

export function budgetOf(db: Db, m: MonthKey): Cents | null {
  const f = forecastRec(db, m);
  return f && f.data.confirmedAt ? forecastTotal(f.data.lines, f.data.extras) : null;
}

export function plannedFor(db: Db, m: MonthKey, catId: string): Cents | null {
  const f = forecastRec(db, m);
  if (!f || !f.data.confirmedAt) return null;
  return f.data.lines[catId] ?? 0;
}

export function forecastTotal(lines: Record<string, Cents>, extras: ForecastExtra[] = []): Cents {
  return Object.values(lines).reduce((a, v) => a + v, 0) + extras.reduce((a, x) => a + x.amount, 0);
}

interface Prefill {
  amount: Cents;
  caption: string;
}

export function prefillLine(db: Db, m: MonthKey, cat: CategoryView): Prefill {
  const prevM = addMonths(m, -1);
  const prev = forecastRec(db, prevM);
  if (cat.recurringDay && cat.planned != null) return { amount: cat.planned, caption: 'Recurring · on the ' + ordinal(cat.recurringDay) };
  if (prev && prev.data.lines[cat.id] != null) {
    const amount = prev.data.lines[cat.id];
    return { amount, caption: amount ? 'Same as ' + monthShort(prevM) : 'Nothing planned' };
  }
  if (cat.planned != null) return { amount: cat.planned, caption: cat.planned ? 'Planned every month' : 'Nothing planned' };
  const spent = monthStats(db, prevM).byCat.get(cat.id)?.spent ?? 0;
  if (spent > 0) return { amount: spent, caption: 'From ' + monthShort(prevM) + ' spending' };
  return { amount: 0, caption: 'Nothing planned' };
}

export interface ForecastLine {
  cat: CategoryView;
  amount: Cents;
  caption: string;
  tone: Tone;
}

export interface ShareView extends ForecastShare {
  member: MemberView;
}

export interface ForecastView {
  month: MonthKey;
  exists: boolean;
  confirmedAt: number | null;
  lines: ForecastLine[];
  extras: ForecastExtra[];
  total: Cents;
  prevTotal: Cents | null;
  /** Balances at the end of the previous month, carried into this forecast. */
  carry: MemberBalance[];
  shares: ShareView[];
}

/** Percentages used for a month: those confirmed with its forecast, else the current ones. */
/**
 * Percentages that apply to a month: those of its confirmed plan, also kept when the plan is reopened
 * once the month has expenses. Otherwise (draft, next plan) the current members' shares.
 */
export function sharesFor(db: Db, m: MonthKey): { id: string; pct: number }[] {
  const f = forecastRec(db, m)?.data;
  const keep = !!f?.shares && (!!f.confirmedAt || expensesOf(db, m).length > 0);
  return members(db).map((x) => ({ id: x.id, pct: (keep ? f?.shares?.[x.id]?.pct : undefined) ?? x.share }));
}

/** True when a reopened plan keeps percentages that differ from the current shares. */
export function keepsOldShares(db: Db, m: MonthKey): boolean {
  const f = forecastRec(db, m)?.data;
  if (!f || f.confirmedAt) return false;
  const pcts = sharesFor(db, m);
  return members(db).some((x) => pcts.find((p) => p.id === x.id)?.pct !== x.share);
}

/** Transfer a member was asked to make for a month (from its confirmed forecast). */
export function expectedTransfer(db: Db, m: MonthKey, memberId: string): Cents {
  const f = forecastRec(db, m);
  return f && f.data.confirmedAt ? f.data.shares?.[memberId]?.transfer ?? 0 : 0;
}

/** What a member transferred: what was recorded, otherwise what was asked. */
export function transferred(db: Db, m: MonthKey, memberId: string): Cents {
  return received(db, m, memberId) ?? expectedTransfer(db, m, memberId);
}

export function computeShares(db: Db, total: Cents, m: MonthKey): Record<string, ForecastShare> {
  const ms = members(db);
  const pcts = sharesFor(db, m);
  const gross = splitByShares(total, pcts);
  const carry = new Map(memberBalances(db, addMonths(m, -1)).map((b) => [b.member.id, b.balance]));
  const out: Record<string, ForecastShare> = {};
  for (const x of ms) {
    const c = carry.get(x.id) ?? 0;
    const pct = pcts.find((p) => p.id === x.id)?.pct ?? x.share;
    out[x.id] = { pct, gross: gross[x.id] ?? 0, carry: c, transfer: (gross[x.id] ?? 0) - c };
  }
  return out;
}

export function forecastView(db: Db, m: MonthKey): ForecastView {
  const rec = forecastRec(db, m);
  const data = rec?.data;
  const lines: ForecastLine[] = categories(db).map((cat) => {
    const pre = prefillLine(db, m, cat);
    const amount = data?.lines[cat.id] ?? pre.amount;
    if (amount === pre.amount) return { cat, amount, caption: amount ? pre.caption : 'Nothing planned', tone: 'sec' as Tone };
    // Nothing to compare with (first month, new category): it's simply planned.
    if (pre.amount === 0) return { cat, amount, caption: 'Planned this month', tone: 'sec' as Tone };
    const diff = amount - pre.amount;
    return { cat, amount, caption: 'Adjusted · ' + money(diff, { sign: true }), tone: (diff > 0 ? 'warn' : 'good') as Tone };
  });
  const extras = data?.extras ?? [];
  const total = lines.reduce((a, l) => a + l.amount, 0) + extras.reduce((a, x) => a + x.amount, 0);
  const prev = forecastRec(db, addMonths(m, -1));
  const prevTotal = prev ? forecastTotal(prev.data.lines, prev.data.extras) : null;
  const confirmed = !!data?.confirmedAt;
  const sharesData = confirmed && data?.shares ? data.shares : computeShares(db, total, m);
  const memberMap = new Map(members(db).map((x) => [x.id, x]));
  const shares: ShareView[] = Object.entries(sharesData)
    .map(([id, s]) => ({ ...s, carry: s.carry ?? 0, member: memberMap.get(id) as MemberView }))
    .filter((s) => !!s.member)
    .sort((a, b) => a.member.order - b.member.order);
  return {
    month: m,
    exists: !!rec,
    confirmedAt: data?.confirmedAt ?? null,
    lines,
    extras,
    total: confirmed && data?.total != null ? data.total : total,
    prevTotal,
    carry: m > startMonth(db) ? memberBalances(db, addMonths(m, -1)) : [],
    shares
  };
}

// ---------- Balances ----------

export interface MemberBalance {
  member: MemberView;
  pct: number;
  /** Balance carried in from the months before. */
  carryIn: Cents;
  /** Transfer to the joint account (recorded, otherwise the expected one). */
  transferred: Cents;
  transferRecorded: boolean;
  expected: Cents;
  /** Household expenses they paid with their own money, reimbursed by the account. */
  advances: Cents;
  advanceCount: number;
  /** Paid for the other member (+), or paid for them by the other member (−). */
  between: Cents;
  /** Their share of the household spending. */
  due: Cents;
  /** Positive: the household owes them (lower next transfer). Negative: they owe. */
  balance: Cents;
}

/**
 * Running balance of each member up to the end of month m.
 * Every month: balance += transfer + reimbursable expenses they paid + what they paid
 * for the other − their % of the household spending. The next forecast subtracts it,
 * so the joint account comes back to the same amount at the start of every month.
 */
export function memberBalances(db: Db, m: MonthKey): MemberBalance[] {
  const ms = members(db);
  const start = startMonth(db);
  const run = new Map<string, Cents>(ms.map((x) => [x.id, 0]));
  let last: MemberBalance[] = ms.map((x) => ({
    member: x,
    pct: x.share,
    carryIn: 0,
    transferred: 0,
    transferRecorded: false,
    expected: 0,
    advances: 0,
    advanceCount: 0,
    between: 0,
    due: 0,
    balance: 0
  }));
  for (let cur = start; cur <= m; cur = addMonths(cur, 1)) {
    const stats = monthStats(db, cur);
    const pcts = sharesFor(db, cur);
    const due = splitByShares(stats.total, pcts);
    last = ms.map((x) => {
      const mine = stats.advances.filter((a) => a.payer === x.id);
      const adv = mine.reduce((a, e) => a + e.amount, 0);
      let between = 0;
      for (const e of stats.between) {
        if (e.payer === x.id) between += e.amount;
        else if (ms.length === 2) between -= e.amount;
      }
      const rec = received(db, cur, x.id);
      const expected = expectedTransfer(db, cur, x.id);
      const t = rec ?? expected;
      const carryIn = run.get(x.id) ?? 0;
      const balance = carryIn + t + adv + between - (due[x.id] ?? 0);
      run.set(x.id, balance);
      return {
        member: x,
        pct: pcts.find((p) => p.id === x.id)?.pct ?? x.share,
        carryIn,
        transferred: t,
        transferRecorded: rec != null,
        expected,
        advances: adv,
        advanceCount: mine.length,
        between,
        due: due[x.id] ?? 0,
        balance
      };
    });
  }
  return last;
}

export interface CarryCheck {
  member: MemberView;
  /** Balance from the month before used when the plan was (last) confirmed. */
  atConfirm: Cents;
  /** The same balance worked out now, after any later correction. */
  now: Cents;
  diff: Cents;
}

/**
 * For a confirmed plan: each member's balance from the month before, as used for the transfers
 * and as it is now. A difference isn't lost: it is carried into the following month.
 */
export function carryCheck(db: Db, m: MonthKey): CarryCheck[] {
  const f = forecastRec(db, m)?.data;
  if (!f?.confirmedAt || !f.shares) return [];
  return memberBalances(db, addMonths(m, -1)).map((b) => {
    const atConfirm = f.shares?.[b.member.id]?.carry ?? 0;
    return { member: b.member, atConfirm, now: b.balance, diff: b.balance - atConfirm };
  });
}

// ---------- Month-end review ----------

export interface AlsoChecked {
  text: string;
  value: string;
  tone: 'good' | 'warn' | 'bad';
  valueIsCaption?: boolean;
}

export function alsoChecked(db: Db, m: MonthKey): AlsoChecked[] {
  const stats = monthStats(db, m);
  const out: AlsoChecked[] = [];
  if (stats.advances.length) {
    out.push({ text: plural(stats.advances.length, 'expense') + ' to reimburse from the account', value: money(stats.advanceTotal), tone: 'good' });
  }
  const ms = members(db);
  for (const e of stats.between) {
    const payer = ms.find((x) => x.id === e.payer);
    const other = ms.find((x) => x.id !== e.payer);
    if (payer && other) out.push({ text: other.name + ' owes ' + payer.name + ' · ' + e.label, value: money(e.amount), tone: 'good' });
  }
  const recurring = categories(db).filter((c) => c.recurringDay && stats.byCat.has(c.id));
  if (recurring.length) {
    const names = recurring.map((c) => c.name);
    const text = names.length <= 2 ? names.join(' and ') + ' entered' : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' entered';
    out.push({ text, value: 'recurring', tone: 'good', valueIsCaption: true });
  }
  for (const cat of categories(db)) {
    const planned = plannedFor(db, m, cat.id);
    const spent = stats.byCat.get(cat.id)?.spent ?? 0;
    if (!planned || cat.recurringDay) continue;
    if (spent > planned) out.push({ text: cat.name + ' over budget (' + percent(spent, planned) + ', ' + money(spent - planned, { sign: true }) + ')', value: money(spent), tone: 'bad' });
  }
  return out;
}

// ---------- Sync ----------

/** Expenses this member added or changed on this phone since they last shared. */
export function unsharedCount(db: Db): number {
  const since = db.local.lastShareAt ?? 0;
  return expenses(db).filter((e) => e.by === db.local.meId && e.at > since).length;
}

export function lastSyncAt(db: Db): number | null {
  let t = db.local.lastShareAt ?? 0;
  for (const p of Object.values(db.local.peers)) if (p.importedAt && p.importedAt > t) t = p.importedAt;
  return t || null;
}

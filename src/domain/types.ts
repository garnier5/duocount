import type { Cents } from '../lib/money';
import type { MonthKey } from '../lib/dates';
import type { IconName } from '../ui/icons';

/**
 * Every piece of household data is a record that can be synced between phones.
 * `rev` changes on each edit; `revs` keeps the recent history so two phones can
 * tell whether one version descends from the other or whether both were edited.
 */
export interface Rec<T = unknown> {
  key: string;
  type: RecType;
  id: string;
  rev: string;
  revs: string[];
  /** Last edit time (ms). Informative only: merging relies on revs, not clocks. */
  at: number;
  /** Member id of whoever made the last edit. */
  by: string;
  deleted?: boolean;
  data: T;
}

export type RecType = 'household' | 'member' | 'category' | 'expense' | 'month' | 'forecast' | 'received';

export interface Household {
  name: string;
  currency: string;
  startMonth: MonthKey;
  createdAt: number;
}

export interface Member {
  name: string;
  color: string;
  /** Percentage of the household budget this member pays (0–100). */
  share: number;
  order: number;
}

export interface Category {
  name: string;
  icon: IconName;
  color: string;
  order: number;
  /** Default planned amount per month, used to pre-fill forecasts. */
  planned: Cents | null;
  /** Day of the month a fixed expense is paid (rent, insurance…). Null if not recurring. */
  recurringDay: number | null;
  custom?: boolean;
}

/** Who paid: the joint account, or a member id. */
export type Payer = 'joint' | string;

export interface Expense {
  month: MonthKey;
  label: string;
  amount: Cents;
  categoryId: string;
  payer: Payer;
  /**
   * For a member's payment: true = reimbursed by the joint account (household expense),
   * false = the other member owes them the full amount.
   */
  advance: boolean;
  /** 'total' = one amount for a whole category, typed at month end. */
  kind: 'single' | 'total';
  recurring?: boolean;
  /** Earlier versions, oldest first, so a change never hides what was entered before. */
  history?: ExpenseVersion[];
}

/** An expense as it was before a change: when that version was made, by whom, and its values. */
export interface ExpenseVersion {
  at: number;
  by: string;
  month: MonthKey;
  label: string;
  amount: Cents;
  categoryId: string;
  payer: Payer;
  advance: boolean;
}

export interface MonthDoc {
  closedAt: number | null;
  /** Month-end checks the household answered ("None this month", "Keep both"). */
  dismissed: string[];
  /** What the month showed each time it was closed, oldest first. */
  history?: MonthClosing[];
}

/** A member's balance as worked out at a given moment (see memberBalances). */
export interface BalanceSnapshot {
  pct: number;
  carryIn: Cents;
  transferred: Cents;
  transferRecorded: boolean;
  expected: Cents;
  advances: Cents;
  between: Cents;
  due: Cents;
  balance: Cents;
}

export interface MonthClosing {
  at: number;
  by: string;
  /** Household spending when the month was closed. */
  spent: Cents;
  balances: Record<string, BalanceSnapshot>;
}

export interface ForecastShare {
  pct: number;
  gross: Cents;
  /** Balance carried from the previous month: + the household owes them, − they owe. */
  carry: Cents;
  transfer: Cents;
}

export interface ForecastExtra {
  id: string;
  label: string;
  amount: Cents;
}

export interface Forecast {
  /** Planned amount per category id. */
  lines: Record<string, Cents>;
  extras: ForecastExtra[];
  confirmedAt: number | null;
  /**
   * Snapshot taken when confirmed: what everyone has to transfer. Kept when the plan is reopened,
   * so a month that already has expenses keeps its percentages.
   */
  total?: Cents;
  shares?: Record<string, ForecastShare>;
  /** Every confirmation, oldest first: what was asked from each member each time. */
  history?: PlanConfirmation[];
}

export interface PlanConfirmation {
  at: number;
  by: string;
  total: Cents;
  lines: Record<string, Cents>;
  extras: ForecastExtra[];
  shares: Record<string, ForecastShare>;
}

/** Amount a member actually transferred to the joint account for a month. */
export interface Received {
  month: MonthKey;
  memberId: string;
  amount: Cents;
  /** Amounts recorded before, oldest first. */
  history?: ReceivedVersion[];
}

export interface ReceivedVersion {
  at: number;
  by: string;
  amount: Cents;
}

export type Theme = 'system' | 'light' | 'dark';

export interface PeerSync {
  importedAt?: number;
  /** When the imported file was created on their phone. */
  theirSentAt?: number;
}

/** Settings that stay on this phone and are never shared. */
export interface LocalState {
  meId: string | null;
  householdId: string | null;
  /** Lets the phone tell whether a typed passphrase is right. The passphrase itself is never stored. */
  passphraseCheck: string | null;
  passphraseSetAt: number | null;
  theme: Theme;
  reminder: boolean;
  selectedMonth: MonthKey | null;
  lastShareAt: number | null;
  lastBackupAt: number | null;
  peers: Record<string, PeerSync>;
  firstExpenseBanner: boolean;
  installDismissed: boolean;
}

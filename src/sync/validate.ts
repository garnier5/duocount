import { CURRENCIES } from '../domain/defaults';
import { editRec } from '../domain/records';
import type { LocalState, PeerSync, Rec, RecType } from '../domain/types';
import { isIconName } from '../ui/icons';
import type { BackupPayload, SyncPayload } from './files';

/**
 * Checks what comes out of a decrypted file before anything is saved.
 * Only someone with the passphrase can make a file, but a buggy or hostile one must not
 * be able to break this phone (an unknown currency crashes every screen) or slip in odd values.
 */

export class InvalidData extends Error {
  constructor(what: string) {
    super("This file contains data DuoCount can't use (" + what + ').');
  }
}

const MAX_RECORDS = 100_000;
const REC_TYPES: readonly string[] = ['household', 'member', 'category', 'expense', 'month', 'forecast', 'received'] satisfies RecType[];
const ID = /^[A-Za-z0-9:_-]{1,100}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Ten billion in any currency, in cents. */
const MAX_CENTS = 1e12;
/** Latest date a JS Date can hold. */
const MAX_TIME = 8.64e15;

type Obj = Record<string, unknown>;

function fail(what: string): never {
  throw new InvalidData(what);
}

function obj(v: unknown, what: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(what);
  return v as Obj;
}

function list(v: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail(what);
  return v;
}

function str(v: unknown, what: string, max = 1000): string {
  if (typeof v !== 'string' || v.length > max) fail(what);
  return v;
}

function match(v: unknown, re: RegExp, what: string): string {
  if (typeof v !== 'string' || !re.test(v)) fail(what);
  return v;
}

function id(v: unknown, what: string): string {
  return match(v, ID, what);
}

function num(v: unknown, what: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(what);
  return v;
}

function cents(v: unknown, what: string): number {
  if (!Number.isSafeInteger(v) || Math.abs(v as number) > MAX_CENTS) fail(what);
  return v as number;
}

function time(v: unknown, what: string): number {
  return num(v, what, 0, MAX_TIME);
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') fail(what);
  return v;
}

function optional<T>(v: unknown, check: (v: unknown) => T): T | undefined {
  return v === undefined ? undefined : check(v);
}

function nullable<T>(v: unknown, check: (v: unknown) => T): T | null {
  return v === null ? null : check(v);
}

/** Grey, for a member or category whose color can't be used. */
const FALLBACK_COLOR = '#8E8E93';

/**
 * Checks a record's data. Purely cosmetic values that can't be used (currency, colors, icons)
 * are put in `fix` with a safe default instead of refusing the whole file.
 */
const DATA: Record<RecType, (d: Obj, fix: Obj) => void> = {
  household(d, fix) {
    str(d.name, 'household name', 1000);
    if (!CURRENCIES.some((c) => c.code === d.currency)) fix.currency = 'EUR';
    match(d.startMonth, MONTH, 'first month');
    time(d.createdAt, 'creation date');
  },
  member(d, fix) {
    str(d.name, 'member name', 1000);
    if (typeof d.color !== 'string' || !COLOR.test(d.color)) fix.color = FALLBACK_COLOR;
    num(d.share, 'member share', 0, 100);
    num(d.order, 'member order');
  },
  category(d, fix) {
    str(d.name, 'category name', 1000);
    if (typeof d.icon !== 'string' || !isIconName(d.icon)) fix.icon = 'receipt';
    if (typeof d.color !== 'string' || !COLOR.test(d.color)) fix.color = FALLBACK_COLOR;
    num(d.order, 'category order');
    nullable(d.planned, (v) => cents(v, 'planned amount'));
    nullable(d.recurringDay, (v) => num(v, 'payment day', 1, 31));
    optional(d.custom, (v) => bool(v, 'category'));
  },
  expense(d) {
    match(d.month, MONTH, 'expense month');
    // Files from earlier versions also carry a day: still accepted, never used.
    optional(d.date, (v) => match(v, DATE, 'expense date'));
    str(d.label, 'expense label', 2000);
    cents(d.amount, 'expense amount');
    id(d.categoryId, 'expense category');
    id(d.payer, 'payer');
    bool(d.advance, 'advance');
    if (d.kind !== 'single' && d.kind !== 'total') fail('expense kind');
    optional(d.recurring, (v) => bool(v, 'recurring expense'));
  },
  month(d) {
    nullable(d.closedAt, (v) => time(v, 'closing date'));
    list(d.dismissed, 'month-end checks', 1000).forEach((v) => str(v, 'month-end check'));
  },
  forecast(d) {
    for (const [k, v] of Object.entries(obj(d.lines, 'forecast'))) {
      id(k, 'forecast category');
      cents(v, 'planned amount');
    }
    list(d.extras, 'forecast extras', 1000).forEach((v) => {
      const x = obj(v, 'forecast extra');
      id(x.id, 'forecast extra');
      str(x.label, 'forecast extra', 2000);
      cents(x.amount, 'forecast extra');
    });
    nullable(d.confirmedAt, (v) => time(v, 'confirmation date'));
    optional(d.total, (v) => cents(v, 'forecast total'));
    optional(d.shares, (v) => {
      for (const [k, s] of Object.entries(obj(v, 'shares'))) {
        id(k, 'shares');
        const x = obj(s, 'shares');
        num(x.pct, 'share', 0, 100);
        cents(x.gross, 'shares');
        cents(x.carry, 'shares');
        cents(x.transfer, 'shares');
      }
    });
  },
  received(d) {
    match(d.month, MONTH, 'transfer month');
    id(d.memberId, 'transfer member');
    cents(d.amount, 'transfer amount');
  }
};

/** A record, or a repaired version of it that descends from it, so other phones pick up the fix too. */
function record(v: unknown): { rec: Rec; repaired: boolean } {
  const r = obj(v, 'record');
  if (typeof r.type !== 'string' || !REC_TYPES.includes(r.type)) fail('record type');
  const type = r.type as RecType;
  id(r.id, 'record id');
  if (r.key !== type + ':' + r.id) fail('record key');
  id(r.rev, 'record version');
  list(r.revs, 'record history', 200).forEach((x) => id(x, 'record history'));
  time(r.at, 'edit date');
  id(r.by, 'record author');
  optional(r.deleted, (x) => bool(x, 'deleted record'));
  const data = obj(r.data, type + ' data');
  const fix: Obj = {};
  DATA[type](data, fix);
  const rec = r as unknown as Rec;
  if (!Object.keys(fix).length) return { rec, repaired: false };
  return { rec: editRec(rec, { ...data, ...fix }, rec.by, !!rec.deleted), repaired: true };
}

export interface Checked {
  /** Records whose currency, color or icon couldn't be used and was replaced. */
  repaired: number;
}

/** All the records of a file, for the household named in its (authenticated) header. */
function records(v: unknown, householdId: string): { records: Rec[]; repaired: number } {
  const checked = list(v, 'records', MAX_RECORDS).map(record);
  const out = checked.map((c) => c.rec);
  const keys = new Set<string>();
  for (const r of out) {
    if (keys.has(r.key)) fail('the same record twice');
    keys.add(r.key);
    if (r.type === 'household' && r.id !== householdId) fail('another household');
  }
  return { records: out, repaired: checked.filter((c) => c.repaired).length };
}

export function readSyncPayload(v: unknown, householdId: string): SyncPayload & Checked {
  return records(obj(v, 'file').records, householdId);
}

/** Only the settings a backup is meant to carry are kept, whatever else the file holds. */
export function readBackupPayload(v: unknown, householdId: string): BackupPayload & Checked {
  const p = obj(v, 'file');
  const { records: recs, repaired } = records(p.records, householdId);
  const l = obj(p.local ?? {}, 'settings');
  const memberIds = new Set(recs.filter((r) => r.type === 'member').map((r) => r.id));
  const meId = nullable(l.meId ?? null, (x) => id(x, 'your member'));
  if (meId && !memberIds.has(meId)) fail('your member');
  const peers: Record<string, PeerSync> = {};
  for (const [k, x] of Object.entries(obj(l.peers ?? {}, 'sync history'))) {
    const s = obj(x, 'sync history');
    peers[id(k, 'sync history')] = {
      importedAt: optional(s.importedAt, (t) => time(t, 'sync history')),
      theirSentAt: optional(s.theirSentAt, (t) => time(t, 'sync history'))
    };
  }
  const local: Partial<LocalState> = {
    theme: l.theme === 'light' || l.theme === 'dark' ? l.theme : 'system',
    reminder: l.reminder !== false,
    meId,
    householdId,
    lastShareAt: nullable(l.lastShareAt ?? null, (t) => time(t, 'last share')),
    passphraseSetAt: nullable(l.passphraseSetAt ?? null, (t) => time(t, 'passphrase date')),
    peers
  };
  return { records: recs, local, repaired };
}

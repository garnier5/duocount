import { useSyncExternalStore } from 'react';
import type { LocalState, Rec } from '../domain/types';
import { setCurrency } from '../lib/money';
import { makeCheck } from '../sync/crypto';
import * as idb from './db';

export const DEFAULT_LOCAL: LocalState = {
  meId: null,
  householdId: null,
  passphraseCheck: null,
  passphraseSetAt: null,
  theme: 'system',
  reminder: true,
  selectedMonth: null,
  lastShareAt: null,
  lastBackupAt: null,
  peers: {},
  firstExpenseBanner: false,
  installDismissed: false
};

/** Immutable snapshot: a write produces a new object, so it can be used as a memo key. */
export interface Db {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  records: ReadonlyMap<string, Rec>;
  local: LocalState;
}

let state: Db = { status: 'loading', records: new Map(), local: DEFAULT_LOCAL };
const listeners = new Set<() => void>();

function emit(next: Db) {
  state = next;
  syncCurrency();
  listeners.forEach((l) => l());
}

function syncCurrency() {
  const hh = state.local.householdId ? state.records.get('household:' + state.local.householdId) : undefined;
  const cur = (hh?.data as { currency?: string } | undefined)?.currency;
  setCurrency(cur || 'EUR');
}

export function getDb(): Db {
  return state;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDb(): Db {
  return useSyncExternalStore(subscribe, getDb, getDb);
}

export async function init() {
  try {
    const { records, local } = await idb.loadAll();
    const map = new Map<string, Rec>();
    for (const r of records) map.set(r.key, r);
    // Earlier versions kept the passphrase itself: swap it for a check and drop it from disk.
    const { passphrase: legacy, ...saved } = (local || {}) as Partial<LocalState> & { passphrase?: string | null };
    const merged: LocalState = { ...DEFAULT_LOCAL, ...saved };
    if (legacy) merged.passphraseCheck = await makeCheck(legacy);
    if (legacy !== undefined) await idb.putLocal(merged);
    emit({ status: 'ready', records: map, local: merged });
    idb.requestPersistence();
  } catch (e) {
    emit({ ...state, status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Saves records (new versions, tombstones…) in memory and on disk. */
export function write(recs: Rec[]) {
  if (!recs.length) return;
  const map = new Map(state.records);
  for (const r of recs) map.set(r.key, r);
  emit({ ...state, records: map });
  idb.putRecords(recs).catch(reportWriteError);
}

export function setLocal(patch: Partial<LocalState>) {
  const local = { ...state.local, ...patch };
  emit({ ...state, local });
  idb.putLocal(local).catch(reportWriteError);
}

export async function replaceAll(recs: Rec[], local: LocalState) {
  await idb.replaceAll(recs, local);
  const map = new Map<string, Rec>();
  for (const r of recs) map.set(r.key, r);
  emit({ status: 'ready', records: map, local });
}

export async function eraseAll() {
  await idb.replaceAll([], null);
  emit({ status: 'ready', records: new Map(), local: { ...DEFAULT_LOCAL, theme: state.local.theme } });
}

function reportWriteError(e: unknown) {
  console.error('DuoCount: could not save to IndexedDB', e);
  window.dispatchEvent(new CustomEvent('duocount:write-error'));
}

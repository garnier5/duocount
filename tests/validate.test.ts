import { describe, expect, it } from 'vitest';
import { createRec, editRec } from '../src/domain/records';
import type { Category, Expense, Forecast, Household, Member, MonthDoc, Rec, Received } from '../src/domain/types';
import { InvalidData, readBackupPayload, readSyncPayload } from '../src/sync/validate';

function household(): Rec[] {
  const recs: Rec[] = [];
  const add = <T,>(type: Rec['type'], id: string, data: T) => {
    recs.push(createRec(type, id, data, 'cam'));
  };
  add<Household>('household', 'hh', { name: 'The Duponts', currency: 'EUR', startMonth: '2026-10', createdAt: 1 });
  add<Member>('member', 'cam', { name: 'Camille', color: '#B4459A', share: 60, order: 0 });
  add<Member>('member', 'jul', { name: 'Julien', color: '#3E6FD8', share: 40, order: 1 });
  add<Category>('category', 'groceries', { name: 'Groceries', icon: 'cart', color: '#2E9457', order: 0, planned: 50000, recurringDay: 5, custom: true });
  add<Expense>('expense', 'e1', { month: '2026-10', label: 'Supermarket', amount: 4000, categoryId: 'groceries', payer: 'jul', advance: true, kind: 'single' });
  add<Forecast>('forecast', '2026-10', {
    lines: { groceries: 50000 },
    extras: [{ id: 'x1', label: 'Gift', amount: 2000 }],
    confirmedAt: 1,
    total: 52000,
    shares: { cam: { pct: 60, gross: 31200, carry: -500, transfer: 30700 } }
  });
  add<Received>('received', '2026-10:cam', { month: '2026-10', memberId: 'cam', amount: 30700 });
  add<MonthDoc>('month', '2026-10', { closedAt: null, dismissed: ['dup:e1'] });
  recs.push(editRec(recs[4], recs[4].data, 'cam', true));
  recs.splice(4, 1);
  return recs;
}

const withData = (recs: Rec[], key: string, patch: object) => recs.map((r) => (r.key === key ? { ...r, data: { ...(r.data as object), ...patch } } : r));

describe('decrypted content', () => {
  it('accepts what the app itself writes, tombstones included', () => {
    const recs = household();
    expect(readSyncPayload({ records: recs }, 'hh').records).toHaveLength(recs.length);
  });

  it('checks the histories like the rest of the data', () => {
    const v = { at: 1, by: 'cam', month: '2026-10', label: 'Supermarket', amount: 3500, categoryId: 'groceries', payer: 'jul', advance: true };
    const ok = withData(household(), 'expense:e1', { history: [v] });
    expect(readSyncPayload({ records: ok }, 'hh').records).toHaveLength(ok.length);
    expect(() => readSyncPayload({ records: withData(household(), 'expense:e1', { history: [{ ...v, amount: 0.5 }] }) }, 'hh')).toThrow(InvalidData);
    expect(() => readSyncPayload({ records: withData(household(), 'received:2026-10:cam', { history: [{ at: 1, by: 'cam', amount: 'lots' }] }) }, 'hh')).toThrow(InvalidData);
    expect(() => readSyncPayload({ records: withData(household(), 'forecast:2026-10', { history: [{ at: 1, by: 'cam', total: 1, lines: {}, extras: [], shares: { cam: { pct: 300 } } }] }) }, 'hh')).toThrow(InvalidData);
  });

  it('still accepts expenses from earlier versions, which had a day', () => {
    const recs = withData(household(), 'expense:e1', { date: '2026-10-03' });
    expect(readSyncPayload({ records: recs }, 'hh').records).toHaveLength(recs.length);
    expect(() => readSyncPayload({ records: withData(household(), 'expense:e1', { date: 'soon' }) }, 'hh')).toThrow(InvalidData);
  });

  it('repairs a currency, color or icon that would break the phone or reach the network', () => {
    let recs = household();
    recs = withData(recs, 'household:hh', { currency: '€' });
    recs = withData(recs, 'member:cam', { color: 'url(https://example.com/x)' });
    recs = withData(recs, 'category:groceries', { icon: 'nope', color: 42 });
    const before = new Map(recs.map((r) => [r.key, r]));
    const out = readSyncPayload({ records: recs }, 'hh');
    expect(out.repaired).toBe(3);
    const get = (key: string) => out.records.find((r) => r.key === key)!;
    expect((get('household:hh').data as Household).currency).toBe('EUR');
    expect((get('member:cam').data as Member).color).toBe('#8E8E93');
    expect(get('category:groceries').data).toMatchObject({ icon: 'receipt', color: '#8E8E93', name: 'Groceries' });
    // A new version that descends from the broken one, so the other phone takes the fix.
    const fixed = get('member:cam');
    expect(fixed.rev).not.toBe(before.get('member:cam')!.rev);
    expect(fixed.revs).toContain(before.get('member:cam')!.rev);
    expect(get('member:jul')).toBe(before.get('member:jul'));
  });

  it('keeps a repaired tombstone deleted', () => {
    const recs = household().map((r) => (r.key === 'member:jul' ? { ...r, deleted: true, data: { ...(r.data as object), color: 'red' } } : r));
    const jul = readSyncPayload({ records: recs }, 'hh').records.find((r) => r.key === 'member:jul')!;
    expect(jul.deleted).toBe(true);
  });

  it('rejects values that change the money', () => {
    const recs = household();
    expect(() => readSyncPayload({ records: withData(recs, 'received:2026-10:cam', { amount: 1.5 }) }, 'hh')).toThrow(InvalidData);
    expect(() => readSyncPayload({ records: withData(recs, 'member:jul', { share: 140 }) }, 'hh')).toThrow(InvalidData);
    expect(() => readSyncPayload({ records: withData(recs, 'expense:e1', { amount: '40' }) }, 'hh')).toThrow(InvalidData);
  });

  it('rejects records that lie about what they are', () => {
    const recs = household();
    expect(() => readSyncPayload({ records: [{ ...recs[1], key: 'household:hh' }] }, 'hh')).toThrow(InvalidData);
    expect(() => readSyncPayload({ records: [...recs, recs[1]] }, 'hh')).toThrow(InvalidData);
    expect(() => readSyncPayload({ records: recs }, 'another')).toThrow(InvalidData);
    expect(() => readSyncPayload({ records: 'nope' }, 'hh')).toThrow(InvalidData);
    expect(() => readSyncPayload(null, 'hh')).toThrow(InvalidData);
  });

  it('keeps only the settings a backup is meant to carry', () => {
    const local = { theme: 'dark', reminder: false, meId: 'cam', householdId: 'other', peers: { jul: { importedAt: 5 } }, passphrase: 'leaked', passphraseCheck: 'x' };
    const b = readBackupPayload({ records: household(), local }, 'hh');
    expect(b.repaired).toBe(0);
    expect(b.local).toEqual({ theme: 'dark', reminder: false, meId: 'cam', householdId: 'hh', lastShareAt: null, passphraseSetAt: null, peers: { jul: { importedAt: 5, theirSentAt: undefined } } });
    expect(() => readBackupPayload({ records: household(), local: { meId: 'stranger' } }, 'hh')).toThrow(InvalidData);
  });
});

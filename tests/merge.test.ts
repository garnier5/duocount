import { describe, expect, it } from 'vitest';
import { diffRecords, resolve } from '../src/domain/merge';
import { createRec, editRec } from '../src/domain/records';
import type { Expense, Rec } from '../src/domain/types';

const exp = (amount: number, label = 'Bakery'): Expense => ({
  month: '2026-10',
  label,
  amount,
  categoryId: 'groceries',
  payer: 'joint',
  advance: false,
  kind: 'single'
});

const map = (...recs: Rec[]) => new Map(recs.map((r) => [r.key, r as Rec]));

describe('diffRecords', () => {
  it('sees new records as added', () => {
    const theirs = createRec('expense', 'e1', exp(840), 'julien');
    const d = diffRecords(map(), [theirs]);
    expect(d.changes.map((c) => c.kind)).toEqual(['added']);
  });

  it('fast-forwards when only the other phone edited', () => {
    const base = createRec('expense', 'e1', exp(740), 'camille');
    const theirs = editRec(base, exp(840), 'julien');
    const d = diffRecords(map(base), [theirs]);
    expect(d.changes).toHaveLength(1);
    expect(d.changes[0].kind).toBe('changed');
    expect(d.conflicts).toHaveLength(0);
  });

  it('ignores older versions and reports what they lack', () => {
    const base = createRec('expense', 'e1', exp(740), 'camille');
    const mine = editRec(base, exp(840), 'camille');
    const extra = createRec('expense', 'e2', exp(100), 'camille');
    const d = diffRecords(map(mine, extra), [base]);
    expect(d.changes).toHaveLength(0);
    expect(d.theyLack.map((r) => r.id).sort()).toEqual(['e1', 'e2']);
  });

  it('detects a conflict when both phones edited', () => {
    const base = createRec('expense', 'e1', exp(6000, 'Electricity'), 'camille');
    const mine = editRec(base, exp(6240, 'Electricity'), 'camille');
    const theirs = editRec(base, exp(6600, 'Electricity'), 'julien');
    const d = diffRecords(map(mine), [theirs]);
    expect(d.conflicts).toHaveLength(1);
  });

  it('treats identical edits on both phones as agreed', () => {
    const base = createRec('expense', 'e1', exp(6000), 'camille');
    const mine = editRec(base, exp(6600), 'camille');
    const theirs = editRec(base, exp(6600), 'julien');
    const d = diffRecords(map(mine), [theirs]);
    expect(d.conflicts).toHaveLength(0);
    expect(d.silent).toHaveLength(1);
  });

  it('reports deletions', () => {
    const base = createRec('expense', 'e1', exp(1349, 'Streaming'), 'camille');
    const theirs = editRec(base, base.data, 'julien', true);
    const d = diffRecords(map(base), [theirs]);
    expect(d.changes[0].kind).toBe('deleted');
  });
});

describe('resolve', () => {
  it('keeping mine produces a version the other phone fast-forwards to', () => {
    const base = createRec('expense', 'e1', exp(6000), 'camille');
    const mine = editRec(base, exp(6240), 'camille');
    const theirs = editRec(base, exp(6600), 'julien');
    const d = diffRecords(map(mine), [theirs]);
    const [merged] = resolve(d, { [mine.key]: 'mine' }, 'camille');
    expect(merged.data).toEqual(exp(6240));
    // On Julien's phone, our merged version now descends from his.
    const back = diffRecords(map(theirs), [merged]);
    expect(back.conflicts).toHaveLength(0);
    expect(back.changes[0].kind).toBe('changed');
  });

  it("keeping theirs converges both phones on their version", () => {
    const base = createRec('expense', 'e1', exp(6000), 'camille');
    const mine = editRec(base, exp(6240), 'camille');
    const theirs = editRec(base, exp(6600), 'julien');
    const d = diffRecords(map(mine), [theirs]);
    const [merged] = resolve(d, { [mine.key]: 'theirs' }, 'camille');
    expect(merged.data).toEqual(exp(6600));
    const back = diffRecords(map(theirs), [merged]);
    expect(back.conflicts).toHaveLength(0);
    expect(back.changes).toHaveLength(0);
  });
});

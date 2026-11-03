import type { Db } from '../data/store';
import type { MonthStats, SpendSplit } from '../domain/calc';
import { category } from '../domain/select';
import { money } from '../lib/money';
import { Icon } from '../ui/icons';

/** "Totals by category €1,300.00 · One by one €82.40", leaving out what's empty. */
export function splitSummary(s: SpendSplit): string {
  const one = s.singlesJoint + s.singlesAdvance;
  const parts: string[] = [];
  if (s.totals) parts.push('Totals by category ' + money(s.totals));
  if (one) parts.push('One by one ' + money(one));
  return parts.join(' · ') || 'Nothing entered yet';
}

/** Household spending, line by line: category totals, then what was entered one by one, by who paid. */
export function SplitLines({ s, total, small }: { s: SpendSplit; total: number; small?: boolean }) {
  const cls = small ? 'ln' : 'cl';
  const rows: [string, number][] = [
    ['Totals by category (joint account)', s.totals],
    ['One by one, from the joint account', s.singlesJoint],
    ['One by one, paid by a member (reimbursed)', s.singlesAdvance]
  ];
  return (
    <>
      {rows.map(([label, v]) => (
        <span key={label} className={cls} style={{ marginTop: small ? 3 : undefined }}>
          <span className="l">{label}</span>
          <span className="num">{money(v)}</span>
        </span>
      ))}
      <span className={cls} style={{ borderTop: '0.5px solid var(--sep)', marginTop: small ? 6 : 4, paddingTop: small ? 5 : 7, fontWeight: 600, color: 'var(--label)' }}>
        <span>= Household spending</span>
        <span className="num">{money(total)}</span>
      </span>
    </>
  );
}

/**
 * Categories with both a total and expenses entered one by one from the joint account.
 * If those expenses are on the bank statement, they are already in the total and count twice.
 */
export function doubleCounted(db: Db, stats: MonthStats) {
  return [...stats.byCat.entries()]
    .filter(([, c]) => c.totals > 0 && c.singlesJoint > 0)
    .map(([id, c]) => ({ id, name: category(db, id)?.name ?? 'Deleted category', totals: c.totals, singles: c.singlesJoint }));
}

export function DoubleCountNote({ db, stats }: { db: Db; stats: MonthStats }) {
  const list = doubleCounted(db, stats);
  if (!list.length) return null;
  return (
    <div className="note warn" role="note">
      <Icon name="warning" size={20} />
      <span>
        {list.map((c) => (
          <span key={c.id} style={{ display: 'block' }}>
            {c.name}: {money(c.singles)} entered one by one from the joint account is added to the {money(c.totals)} total.
          </span>
        ))}
        If those expenses are on the bank statement, they are already in the total and count twice: remove them, or lower the total.
      </span>
    </div>
  );
}

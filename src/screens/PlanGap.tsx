import type { Db } from '../data/store';
import { budgetOf, memberBalances, monthStats } from '../domain/calc';
import { allCategories, categories, forecastRec } from '../domain/select';
import { addMonths, monthShort, type MonthKey } from '../lib/dates';
import { money, percent, type Cents } from '../lib/money';
import { splitSummary } from './SplitLines';

function Row({ label, v, strong, sign = true, cap }: { label: string; v: Cents; strong?: boolean; sign?: boolean; cap?: string }) {
  return (
    <>
      <span className="cl" style={strong ? { fontWeight: 600, borderTop: '0.5px solid var(--sep)', marginTop: 4, paddingTop: 7 } : undefined}>
        <span className="l" style={strong ? { color: 'var(--label)' } : undefined}>
          {label}
        </span>
        <span className="num">{money(v, { sign })}</span>
      </span>
      {cap && (
        <span className="cap" style={{ display: 'block', marginTop: -3, marginBottom: 2 }}>
          {cap}
        </span>
      )}
    </>
  );
}

const gapText = (gap: Cents) => (gap > 0 ? 'Spent more than planned' : gap < 0 ? 'Spent less than planned' : 'Spent exactly as planned');

/**
 * The month for the whole household: what the plan covered (the transfers were worked out from it),
 * what was transferred, what was really spent, and which categories make the difference.
 */
export function MonthGap({ db, month }: { db: Db; month: MonthKey }) {
  const planned = budgetOf(db, month);
  const f = forecastRec(db, month)?.data;
  if (planned == null || !f?.shares) return null;
  const name = monthShort(month);
  const stats = monthStats(db, month);
  const bal = memberBalances(db, month);
  const asked = Object.values(f.shares).reduce((a, s) => a + s.transfer, 0);
  const sent = bal.reduce((a, b) => a + b.transferred, 0);
  const gap = stats.total - planned;
  const all = allCategories(db);
  const ids = new Set([...categories(db).map((c) => c.id), ...Object.keys(f.lines), ...stats.byCat.keys()]);
  const rows = [...ids]
    .map((id) => {
      const p = f.lines[id] ?? 0;
      const s = stats.byCat.get(id)?.spent ?? 0;
      return { id, name: all.get(id)?.name ?? 'Deleted category', planned: p, spent: s, diff: s - p };
    })
    .filter((r) => r.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const extras = f.extras.filter((x) => x.amount);
  return (
    <>
      <span className="t" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
        {name} for the household
      </span>
      <Row label={'Planned for ' + name} v={planned} sign={false} cap="The transfers were worked out from this amount." />
      {asked !== planned && <Row label="Transfers asked" v={asked} sign={false} cap={'The plan, with the balances from ' + monthShort(addMonths(month, -1)) + ' added or taken off.'} />}
      {sent !== asked && <Row label="Transfers counted (recorded, or as asked if not ticked)" v={sent} sign={false} />}
      <Row label="Really spent by the household" v={stats.total} sign={false} cap={splitSummary(stats)} />
      <Row label={'= ' + gapText(gap)} v={gap} strong />
      {(rows.length > 0 || extras.length > 0) && (
        <>
          <span className="cap" style={{ display: 'block', marginTop: 10, marginBottom: 2 }}>
            Where the difference comes from:
          </span>
          {rows.map((r) => (
            <span key={r.id} className="cl" style={{ fontSize: 13, padding: '3px 0' }}>
              <span className="l">
                {r.name}: planned {money(r.planned)}, spent {money(r.spent)}
                {r.planned ? ' (' + percent(r.spent, r.planned) + ')' : ''}
              </span>
              <span className="num" style={{ fontWeight: 600, color: r.diff > 0 ? 'var(--overInk)' : 'var(--underInk)' }}>
                {money(r.diff, { sign: true })}
              </span>
            </span>
          ))}
          {extras.map((x) => (
            <span key={x.id} className="cl" style={{ fontSize: 13, padding: '3px 0' }}>
              <span className="l">{x.label || 'One-off'}: one-off line of the plan (its spending is in the categories)</span>
              <span className="num" style={{ fontWeight: 600, color: 'var(--underInk)' }}>
                {money(-x.amount, { sign: true })}
              </span>
            </span>
          ))}
          <span className="cap" style={{ display: 'block', marginTop: 4 }}>
            These add up to {money(gap, { sign: true })}.
          </span>
        </>
      )}
    </>
  );
}

/** Planned and spent for the household, for a one-line summary. Null without a confirmed plan. */
export function monthGap(db: Db, month: MonthKey): { planned: Cents; spent: Cents; gap: Cents } | null {
  const planned = budgetOf(db, month);
  if (planned == null || !forecastRec(db, month)?.data.shares) return null;
  const spent = monthStats(db, month).total;
  return { planned, spent, gap: spent - planned };
}

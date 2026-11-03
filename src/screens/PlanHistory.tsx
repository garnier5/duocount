import type { Db } from '../data/store';
import { confirmations } from '../domain/history';
import { forecastRec, member } from '../domain/select';
import { addMonths, dateTime, monthShort, type MonthKey } from '../lib/dates';
import { money } from '../lib/money';

/** Every time the month's plan was confirmed, newest first, with what it asked from each person. */
export function PlanHistory({ db, month }: { db: Db; month: MonthKey }) {
  const rec = forecastRec(db, month);
  const list = confirmations(rec);
  if (!list.length) return null;
  const prev = monthShort(addMonths(month, -1));
  const current = rec?.data.confirmedAt ? list[list.length - 1] : undefined;
  const name = (id: string) => member(db, id)?.name ?? 'Former member';
  return (
    <section aria-labelledby={'ph-' + month}>
      <h2 className="sh lg" id={'ph-' + month} style={{ paddingBottom: 8 }}>
        Plan history
      </h2>
      <p className="cap" style={{ margin: '0 4px 10px', fontSize: 15, lineHeight: 1.4 }}>
        Each confirmation is kept, with what it asked from each person. {list.length === 1 ? 'Confirmed once so far.' : 'Confirmed ' + list.length + ' times.'}
      </p>
      <div className="card lst in16">
        {list
          .map((c, i) => ({ c, before: list[i - 1] }))
          .reverse()
          .map(({ c, before }) => (
            <div key={c.at} style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600 }}>
                  {dateTime(c.at)}
                  {c === current && <span className="pill" style={{ marginLeft: 8, height: 22, background: 'var(--goodSoft)', color: 'var(--good)' }}>Current</span>}
                </span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {money(c.total)}
                </span>
              </div>
              <div className="cap">Confirmed by {member(db, c.by)?.name ?? 'someone'}</div>
              {Object.entries(c.shares).map(([id, s]) => {
                const was = before?.shares[id]?.transfer;
                return (
                  <div key={id} className="cl" style={{ fontSize: 13, padding: '3px 0' }}>
                    <span className="l">
                      {name(id)}: {s.pct}% = {money(s.gross)}
                      {s.carry < 0 ? ' + ' + money(-s.carry) + ' owed from ' + prev : s.carry > 0 ? ' − ' + money(s.carry) + ' credit from ' + prev : ''}
                    </span>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {money(s.transfer)}
                      {was != null && was !== s.transfer && (
                        <span style={{ display: 'block', fontWeight: 400, color: 'var(--sec)', textAlign: 'right' }}>{money(s.transfer - was, { sign: true })} vs before</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </section>
  );
}

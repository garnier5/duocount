import type { ReactNode } from 'react';
import type { Db } from '../data/store';
import { monthStats } from '../domain/calc';
import { allCategories, forecastRec, member, receivedRec } from '../domain/select';
import type { BalanceSnapshot } from '../domain/types';
import { addMonths, dateTime, monthShort, type MonthKey } from '../lib/dates';
import { exactPart, money, moneyExact, type Cents } from '../lib/money';
import { InfoPopover } from '../ui/kit';
import { SplitLines } from './SplitLines';

/**
 * Every step from the balance carried in to the balance carried out, each one signed,
 * so the lines add up on screen to the result. With `db` (and a member), the transfer
 * and the share of spending get an (i) with how they were worked out.
 */
export function BalanceLines({
  b,
  month,
  spent,
  sumPct,
  small,
  count,
  db,
  memberId
}: {
  b: BalanceSnapshot;
  month: MonthKey;
  spent: Cents;
  sumPct: number;
  small?: boolean;
  count?: number;
  db?: Db;
  memberId?: string;
}) {
  const name = monthShort(month);
  const cls = small ? 'ln' : 'cl';
  const exact = exactPart(spent, b.pct, sumPct);
  const who = memberId && db ? member(db, memberId)?.name ?? '' : '';
  const withInfo = !!db && !!memberId;
  const rows: { label: string; v: Cents; warn?: boolean; info?: ReactNode }[] = [];
  if (b.carryIn !== 0) rows.push({ label: 'Balance from ' + monthShort(addMonths(month, -1)), v: b.carryIn });
  const transferInfo = withInfo ? <TransferDetail db={db!} month={month} memberId={memberId!} b={b} /> : undefined;
  rows.push(
    b.transferRecorded
      ? { label: 'Transferred for ' + name, v: b.transferred, info: transferInfo }
      : { label: 'Transfer for ' + name + ', assumed: not ticked', v: b.transferred, warn: true, info: transferInfo }
  );
  if (b.advances > 0) rows.push({ label: 'Paid for the household' + (count ? ' (' + count + ')' : ''), v: b.advances });
  if (b.between !== 0) rows.push({ label: b.between > 0 ? 'Paid for the other member' : 'Paid for them by the other member', v: b.between });
  rows.push({
    label: b.pct + '% of ' + name + ' spending (' + money(spent) + ')',
    v: -b.due,
    info: withInfo ? <SpendingDetail db={db!} month={month} pct={b.pct} due={b.due} sumPct={sumPct} /> : undefined
  });
  return (
    <>
      {rows.map((r) => (
        <span key={r.label} className={cls + (r.info ? ' has-pop' : '')} style={{ marginTop: small ? 3 : undefined }}>
          <span className="l" style={r.warn ? { color: 'var(--warn)' } : undefined}>
            {r.label}
            {r.info && (
              <>
                {' '}
                <InfoPopover label={'How ' + (who ? who + "'s " : '') + r.label.toLowerCase() + ' was worked out'}>{r.info}</InfoPopover>
              </>
            )}
          </span>
          <span className="num">{money(r.v, { sign: true })}</span>
        </span>
      ))}
      <span className={cls} style={{ borderTop: '0.5px solid var(--sep)', marginTop: small ? 6 : 4, paddingTop: small ? 5 : 7, fontWeight: 600, color: 'var(--label)' }}>
        <span>= Balance at the end of {name}</span>
        <span className="num">{money(b.balance, { sign: true })}</span>
      </span>
      {exact !== b.due && (
        <span className="cap" style={{ display: 'block', marginTop: 6 }}>
          {b.pct}% of {money(spent)} is exactly {moneyExact(exact)}: shares are rounded to the cent so they add up to {money(spent)}.
        </span>
      )}
    </>
  );
}

function Line({ label, v, strong, sign }: { label: string; v: Cents; strong?: boolean; sign?: boolean }) {
  return (
    <span className="cl" style={strong ? { fontWeight: 600, borderTop: '0.5px solid var(--sep)', marginTop: 4, paddingTop: 7 } : undefined}>
      <span className="l" style={strong ? { color: 'var(--label)' } : undefined}>
        {label}
      </span>
      <span className="num">{money(v, { sign })}</span>
    </span>
  );
}

/** What the plan asked from a member for the month, and what was recorded. */
function TransferDetail({ db, month, memberId, b }: { db: Db; month: MonthKey; memberId: string; b: BalanceSnapshot }) {
  const name = monthShort(month);
  const f = forecastRec(db, month)?.data;
  const sh = f?.confirmedAt ? f.shares?.[memberId] : undefined;
  const rec = receivedRec(db, month, memberId);
  if (!sh || !f) {
    return (
      <>
        <span className="t">Transfer for {name}</span>
        <span className="cap">{name} has no confirmed plan, so no transfer was asked.</span>
        {rec && <Line label={'Recorded on ' + dateTime(rec.at)} v={rec.data.amount} />}
      </>
    );
  }
  const prev = monthShort(addMonths(month, -1));
  return (
    <>
      <span className="t">Transfer for {name}</span>
      <span className="cap" style={{ marginBottom: 6 }}>
        Asked by the plan confirmed on {dateTime(f.confirmedAt!)}:
      </span>
      <Line label={'Plan total ' + money(f.total ?? 0) + ' × ' + sh.pct + '%'} v={sh.gross} />
      {sh.carry !== 0 && <Line label={(sh.carry < 0 ? '+ Still owed from ' : '− Credit from ') + prev} v={-sh.carry} sign />}
      <Line label="= Asked" v={sh.transfer} strong />
      {rec ? (
        <Line label={'Recorded on ' + dateTime(rec.at)} v={rec.data.amount} />
      ) : (
        <span className="cap" style={{ marginTop: 6 }}>
          Not ticked yet: counted as asked.
        </span>
      )}
      {rec && rec.data.amount !== sh.transfer && <Line label={rec.data.amount > sh.transfer ? 'Sent more than asked' : 'Sent less than asked'} v={rec.data.amount - sh.transfer} sign />}
      {(rec?.data.history ?? []).map((h) => (
        <span key={h.at} className="cap">
          Recorded before: {money(h.amount)} · {dateTime(h.at)}, {member(db, h.by)?.name ?? 'someone'}
        </span>
      ))}
      <span className="cap" style={{ marginTop: 6 }}>
        Counted in the balance: {money(b.transferred)}.
      </span>
    </>
  );
}

/** How the month's household spending is made up, and this member's share of it. */
function SpendingDetail({ db, month, pct, due, sumPct }: { db: Db; month: MonthKey; pct: number; due: Cents; sumPct: number }) {
  const name = monthShort(month);
  const stats = monthStats(db, month);
  const f = forecastRec(db, month)?.data;
  const plan = f?.confirmedAt ? f.lines : undefined;
  const cats = allCategories(db);
  const exact = exactPart(stats.total, pct, sumPct);
  const rows = [...stats.byCat.entries()].sort((a, b) => b[1].spent - a[1].spent);
  return (
    <>
      <span className="t">{name} spending</span>
      <SplitLines s={stats} total={stats.total} />
      <Line label={'× ' + pct + '%'} v={due} strong />
      {exact !== due && <span className="cap">Exactly {moneyExact(exact)}, rounded to the cent.</span>}
      {rows.length > 0 && (
        <>
          <span className="cap" style={{ marginTop: 8 }}>
            By category{plan ? ' (planned in brackets)' : ''}:
          </span>
          {rows.map(([id, c]) => (
            <span key={id} className="cl" style={{ fontSize: 13 }}>
              <span className="l">
                {cats.get(id)?.name ?? 'Deleted category'}
                {plan ? ' (' + money(plan[id] ?? 0) + ')' : ''}
              </span>
              <span className="num">{money(c.spent)}</span>
            </span>
          ))}
        </>
      )}
    </>
  );
}

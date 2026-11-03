import { setLocal, useDb, type Db } from '../../data/store';
import { closeMonth, setReceived } from '../../domain/actions';
import { alsoChecked, budgetOf, expectedTransfer, isClosed, memberBalances, monthStats } from '../../domain/calc';
import { members, received } from '../../domain/select';
import { addMonths, monthShort, plural } from '../../lib/dates';
import { money, percent } from '../../lib/money';
import { navigate } from '../../lib/router';
import { Icon } from '../../ui/icons';
import { InfoPopover, NavBar } from '../../ui/kit';
import { BalanceRecap } from '../Forecast';
import { toast } from '../../ui/overlays';
import { useMonth } from '../../ui/useMonth';
import { DoubleCountNote, SplitLines } from '../SplitLines';

export function MonthReview() {
  const db = useDb();
  const { month } = useMonth(db);
  const stats = monthStats(db, month);
  const budget = budgetOf(db, month);
  const also = alsoChecked(db, month);
  const closed = isClosed(db, month);
  const pct = budget ? (stats.total / budget) * 100 : null;
  const name = monthShort(month);
  const next = addMonths(month, 1);

  const close = () => {
    // Transfers nobody corrected are taken as made exactly as planned.
    for (const m of members(db)) if (received(db, month, m.id) == null) setReceived(month, m.id, expectedTransfer(db, month, m.id));
    closeMonth(month);
    setLocal({ selectedMonth: next });
    toast(name + ' closed', undefined, { low: true });
    navigate('/forecast');
  };

  return (
    <div className="sub">
      <NavBar
        left={
          <a className="navbtn" href="#/overview">
            <Icon name="back" size={22} stroke={2.4} />
            Back
          </a>
        }
        title={'Review ' + name}
      />
      <div className="sub-body" style={{ paddingTop: 12 }}>
        <section className="card" style={{ padding: '16px 18px' }} aria-live="polite">
          <div className="cap" style={{ fontSize: 15 }}>
            {name} total
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span className="num" style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em' }}>
              {money(stats.total)}
            </span>
            {pct != null && (
              <span className="num" style={{ fontSize: 15, fontWeight: 600, color: pct > 100 ? 'var(--bad)' : 'var(--tintText)' }}>
                {percent(stats.total, budget!)}
              </span>
            )}
          </div>
          {pct != null && (
            <div className="meter s8" style={{ margin: '10px 0 8px' }}>
              <div style={{ background: pct > 100 ? 'var(--bad)' : 'var(--tint)', width: Math.min(100, pct) + '%' }} />
            </div>
          )}
          <div className="cap" style={{ fontSize: 15 }}>
            {plural(stats.count, 'expense')}
            {budget != null ? ' · budget ' + money(budget) : ' · no budget confirmed'}
          </div>
          <div style={{ borderTop: '0.5px solid var(--sep)', margin: '10px 0 4px' }} />
          <SplitLines s={stats} total={stats.total} small />
        </section>
        <DoubleCountNote db={db} stats={stats} />

        {members(db).length === 2 && <Transfers db={db} month={month} />}

        {also.length > 0 && (
          <section>
            <h2 className="sh">
              <span>Also checked</span>
            </h2>
            <div className="card lst in16">
              {also.map((a, i) => (
                <div key={i} className="lrow">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon name={a.tone === 'good' ? 'check' : 'warningSmall'} size={18} style={{ color: 'var(--' + a.tone + ')' }} />
                    {a.text}
                  </span>
                  <span className={a.valueIsCaption ? 'cap' : 'num'} style={a.valueIsCaption ? undefined : { fontWeight: 600 }}>
                    {a.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="spacer" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {closed ? (
            <div className="note good">
              <Icon name="checkCircle" size={20} />
              <span>{name} is closed. Corrections still go to the household at the next sync.</span>
            </div>
          ) : (
            <button className="btn pri" type="button" onClick={close} disabled={stats.count === 0}>
              Close {name} and prepare {monthShort(next)}
            </button>
          )}
          <a className="btn ghost" href="#/statement">
            See every figure of {name}
          </a>
          <a className="btn ghost" href="#/export">
            <Icon name="excel" size={20} />
            Export {name} to Excel
          </a>
        </div>
      </div>
    </div>
  );
}

/** Balance each person carries into next month, from the transfers recorded at the start of this one. */
function Transfers({ db, month }: { db: Db; month: string }) {
  const name = monthShort(month);
  const next = monthShort(addMonths(month, 1));
  const bal = memberBalances(db, month);
  const spent = monthStats(db, month).total;
  const sumPct = bal.reduce((a, b) => a + b.pct, 0);
  return (
    <section>
      <h2 className="sh">
        <span>Carried into {next}</span>
      </h2>
      <div className="card lst in16" style={{ overflow: 'visible' }}>
        {bal.map((b) => (
          <div key={b.member.id} className="lrow has-pop">
            <span>
              {b.member.name}: {b.balance > 0 ? 'credit' : b.balance < 0 ? 'owes' : 'settled'}
              <span className="cap" style={{ display: 'block' }}>
                {b.transferRecorded ? 'Transferred for ' + name + ' ' + money(b.transferred) : 'Transfer not ticked: counted as ' + money(b.expected)}
                {b.balance > 0 ? ' · lowers the ' + next + ' transfer' : b.balance < 0 ? ' · added to the ' + next + ' transfer' : ''}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 'none' }}>
              <span className="num" style={{ fontWeight: 600, color: b.balance > 0 ? 'var(--good)' : b.balance < 0 ? 'var(--warn)' : undefined }}>
                {money(Math.abs(b.balance))}
              </span>
              <InfoPopover label={'How ' + b.member.name + "'s balance at the end of " + name + ' was calculated'}>
                <BalanceRecap b={b} month={month} spent={spent} sumPct={sumPct} />
              </InfoPopover>
            </span>
          </div>
        ))}
      </div>
      <p className="cap foot">
        Transfers are ticked at the start of the month, on the month page.{' '}
        <a className="textbtn" href="#/overview" style={{ fontSize: 13 }} onClick={() => setLocal({ selectedMonth: month })}>
          Correct {name}'s transfers
        </a>
      </p>
    </section>
  );
}


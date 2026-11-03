import { useState } from 'react';
import { setLocal, useDb, type Db } from '../data/store';
import { addForecastExtra, confirmForecast, removeForecastExtra, setForecastLine, unconfirmForecast, updateForecastExtra } from '../domain/actions';
import { canPlan, carryCheck, forecastView, isClosed, keepsOldShares, memberBalances, monthStats, type CarryCheck, type ForecastView, type MemberBalance, type ShareView } from '../domain/calc';
import { NEUTRAL } from '../domain/defaults';
import { members, received } from '../domain/select';
import { addMonths, dateKey, lastDayOf, monthShort, plural, shortDay, type MonthKey } from '../lib/dates';
import { exactPart, money, moneyExact, percent } from '../lib/money';
import { navigate } from '../lib/router';
import { Icon } from '../ui/icons';
import { Alert, AmountInput, Avatar, BackLink, InfoPopover, Note, Tile } from '../ui/kit';
import { toast } from '../ui/overlays';
import { useMonth } from '../ui/useMonth';
import { BalanceLines } from './BalanceLines';
import { PlanHistory } from './PlanHistory';
import { MonthGap, monthGap } from './PlanGap';
import { TransfersCard } from './Transfers';

export function Forecast() {
  const db = useDb();
  const mb = useMonth(db, { allowNextUnopened: true });
  const { month } = mb;
  const view = forecastView(db, month);
  const plannable = canPlan(db, month);
  const confirmed = !!view.confirmedAt;
  const readOnly = confirmed && isClosed(db, month);
  const stat = !plannable ? 'Not open yet' : readOnly ? 'Confirmed · read-only' : confirmed ? 'Confirmed' : 'Draft · to confirm';
  const statColor = !plannable ? 'var(--sec)' : confirmed ? 'var(--good)' : 'var(--warn)';

  return (
    <>
      <main className="page nofab">
        <header className="phead">
          <div className="phead-row" style={{ marginLeft: -8 }}>
            <BackLink to="/overview" label={monthShort(month)} />
          </div>
          <div style={{ padding: '0 4px' }}>
            <h1 className="ptitle" style={{ margin: 0 }}>
              {monthShort(month)} plan
            </h1>
            <div className="cap" style={{ fontSize: 15, marginTop: 2 }}>
              Status: <span style={{ color: statColor, fontWeight: 600 }}>{stat}</span>
            </div>
          </div>
        </header>
        {!plannable ? <NotOpen month={month} /> : readOnly ? <ReadOnly db={db} view={view} /> : <Plan db={db} view={view} />}
      </main>
    </>
  );
}

function NotOpen({ month }: { month: MonthKey }) {
  const prev = addMonths(month, -1);
  return (
    <section className="card r16 empty">
      <div className="empty-ico" style={{ background: 'var(--fill)', color: 'var(--sec)' }} aria-hidden="true">
        <Icon name="calendar" size={30} />
      </div>
      <h2>{monthShort(month)} isn't open yet</h2>
      <p>It opens once {monthShort(prev)}'s expenses are entered and closed, pre-filled from {monthShort(prev)} and your recurring expenses.</p>
      <button className="btn sec" type="button" style={{ marginTop: 6 }} onClick={() => {
          setLocal({ selectedMonth: prev });
          navigate('/month/review');
        }}>
        {'Review and close ' + monthShort(prev)}
      </button>
      <p className="cap" style={{ margin: 0 }}>
        Usually on {shortDay(lastDayOf(prev))}.
      </p>
    </section>
  );
}

function ReadOnly({ db, view }: { db: Db; view: ForecastView }) {
  const [reopen, setReopen] = useState(false);
  const stats = monthStats(db, view.month);
  return (
    <>
      <section className="card r16" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--good)', fontSize: 15, fontWeight: 600 }}>
          <Icon name="checkCircle" size={18} />
          Confirmed on {shortDay(dateKey(new Date(view.confirmedAt!)))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
          <span className="cap" style={{ fontSize: 15 }}>
            Planned
          </span>
          <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>
            {money(view.total)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
          <span className="cap" style={{ fontSize: 15 }}>
            Actually spent
          </span>
          <span className="num" style={{ fontSize: 17, fontWeight: 600 }}>
            {money(stats.total)} · {percent(stats.total, view.total)}
          </span>
        </div>
      </section>
      <TransfersCard db={db} month={view.month} />
      <PlanHistory db={db} month={view.month} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="cap" style={{ margin: '0 4px', textAlign: 'center' }}>
          A confirmed forecast is read-only.{' '}
          <button className="textbtn" type="button" style={{ fontSize: 13 }} onClick={() => setReopen(true)}>
            Reopen it
          </button>{' '}
          only to correct a mistake.
        </p>
      </div>
      {reopen && (
        <Alert
          title={'Reopen the ' + monthShort(view.month) + ' forecast?'}
          message="Transfers will be recalculated when you confirm it again. Tell your household if the amounts change."
          buttons={[
            { label: 'Cancel', style: 'cancel', onClick: () => setReopen(false) },
            {
              label: 'Reopen',
              onClick: () => {
                unconfirmForecast(view.month);
                setReopen(false);
              }
            }
          ]}
        />
      )}
    </>
  );
}

function Plan({ db, view }: { db: Db; view: ForecastView }) {
  const month = view.month;
  const confirmed = !!view.confirmedAt;
  const prev = addMonths(month, -1);
  const shareTotal = members(db).reduce((a, m) => a + m.share, 0);
  const diff = view.prevTotal != null ? view.total - view.prevTotal : null;
  const transfers = view.shares.reduce((a, s) => a + s.transfer, 0);
  const carryTotal = view.shares.reduce((a, s) => a + s.carry, 0);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!confirmed && (
          <Note tone="tint" icon="refresh">
            {view.exists
              ? 'Tap an amount to adjust it. Nothing is final until you confirm.'
              : view.total > 0
                ? 'Pre-filled from ' + monthShort(prev) + ' and your recurring expenses. Tap an amount to adjust it.'
                : 'Type what you plan to spend in each category this month. The total becomes the budget and sets everyone’s transfer.'}
          </Note>
        )}
        <section className="card r16" style={{ padding: '16px 18px' }} aria-label="Forecast total">
          <div className="cap" style={{ fontSize: 15 }}>
            Forecast total
          </div>
          <div className="num" style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.025em' }}>
            {money(view.total)}
          </div>
          {diff != null && view.prevTotal != null && (
            <div className="cap" style={{ fontSize: 15 }}>
              {diff === 0 ? (
                'Same as ' + monthShort(prev)
              ) : (
                <>
                  <span style={{ color: diff < 0 ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>{money(diff, { sign: true })}</span> compared with {monthShort(prev)} ({money(view.prevTotal)})
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="planned">
        <h2 className="sh lg" id="planned" style={{ paddingBottom: 8 }}>
          Planned expenses <span className="shc">{plural(view.lines.length, 'category', 'categories')}</span>
        </h2>
        <div className="card r16 lst">
          {view.lines.map((l) => (
            <div key={l.cat.id} className="prow">
              <Tile icon={l.cat.icon} color={l.cat.color} iconSize={19} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{l.cat.name}</div>
                <div className="cap" style={{ color: l.tone === 'sec' ? undefined : 'var(--' + l.tone + ')' }}>
                  {l.caption}
                </div>
              </div>
              <AmountInput
                className={'amt' + (l.amount ? '' : ' dim')}
                label={'Planned amount for ' + l.cat.name}
                value={l.amount}
                disabled={confirmed}
                format={(c) => money(c)}
                onCommit={(v) => setForecastLine(month, l.cat.id, v ?? 0)}
              />
            </div>
          ))}
          {view.extras.map((x) => (
            <div key={x.id} className="prow">
              <Tile icon="receipt" color={NEUTRAL} iconSize={19} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  className="plainin"
                  style={{ fontWeight: 500 }}
                  type="text"
                  aria-label="Planned expense label"
                  placeholder="What is it?"
                  disabled={confirmed}
                  defaultValue={x.label}
                  onBlur={(e) => e.target.value !== x.label && updateForecastExtra(month, x.id, { label: e.target.value })}
                />
                <div className="cap">One-off</div>
              </div>
              <AmountInput
                className="amt"
                label={'Planned amount for ' + (x.label || 'one-off expense')}
                value={x.amount}
                disabled={confirmed}
                format={(c) => money(c)}
                onCommit={(v) => updateForecastExtra(month, x.id, { amount: v ?? 0 })}
              />
              {!confirmed && (
                <button className="x" type="button" aria-label={'Remove ' + (x.label || 'one-off expense')} onClick={() => removeForecastExtra(month, x.id)}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          ))}
          {!confirmed && (
            <div className="prow">
              <button type="button" className="row link" style={{ padding: 0, minHeight: 44 }} onClick={() => addForecastExtra(month, '', 0)}>
                <span className="addico">
                  <Icon name="plus" size={19} />
                </span>
                Add a planned expense
              </button>
            </div>
          )}
        </div>
      </section>

      {view.carry.length > 0 && <CarrySection db={db} view={view} prev={prev} />}
      {confirmed && <CarryChanged db={db} month={month} checks={carryCheck(db, month)} />}

      {keepsOldShares(db, month) && (
        <Note tone="tint" icon="info">
          {monthShort(month)} already has expenses, so this plan keeps its percentages ({view.shares.map((s) => s.member.name + ' ' + s.pct + '%').join(' · ')}). The new shares
          apply from the next plan.
        </Note>
      )}

      {view.shares.length > 0 && (
        <section aria-labelledby="shares">
          <h2 className="sh lg" id="shares" style={{ paddingBottom: 8 }}>
            Each person's share
          </h2>
          <p className="cap" style={{ margin: '0 4px 10px', fontSize: 15, lineHeight: 1.4 }}>
            Share = forecast total × percentage − balance from {monthShort(prev)}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {view.shares.map((s) => (
              <ShareCard key={s.member.id} s={s} total={view.total} prev={prev} sumPct={view.shares.reduce((a, x) => a + x.pct, 0)} confirmedAt={view.confirmedAt} />
            ))}
            <div className="note">
              <Icon name="checkCircle" size={20} style={{ color: 'var(--good)' }} />
              <span className="num">
                {carryTotal === 0 ? (
                  <>
                    Transfers {money(transfers)} = <strong>{money(view.total)}</strong>, the planned total.
                  </>
                ) : (
                  <>
                    Transfers {money(transfers)} = planned {money(view.total)} {carryTotal > 0 ? '− credit ' + money(carryTotal) : '+ catch-up ' + money(-carryTotal)} from {monthShort(prev)}. The joint
                    account ends the month where it started.
                  </>
                )}
              </span>
            </div>
          </div>
        </section>
      )}

      {shareTotal !== 100 && (
        <Note tone="bad" icon="warning">
          The members' shares add up to {shareTotal}%.{' '}
          <a className="textbtn" href="#/settings/members">
            Fix them
          </a>{' '}
          before confirming.
        </Note>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {confirmed ? (
          <>
            <button className="btn goodsoft" type="button" onClick={() => unconfirmForecast(month)}>
              <Icon name="check" size={20} />
              Confirmed · Edit
            </button>
            <p className="cap" style={{ margin: '0 4px 6px', textAlign: 'center' }}>
              {monthShort(month)} budget saved. Remember to{' '}
              <a className="textbtn" href="#/sync" style={{ fontSize: 13 }}>
                share your data
              </a>{' '}
              with the household.
            </p>
            <TransfersCard db={db} month={month} title="Transfers to make" />
            <PlanHistory db={db} month={month} />
          </>
        ) : (
          <>
            <button
              className="btn pri"
              type="button"
              disabled={shareTotal !== 100 || view.total <= 0}
              onClick={() => {
                confirmForecast(month);
                setLocal({ selectedMonth: month });
                toast(monthShort(month) + ' forecast confirmed', undefined, { low: true });
              }}
            >
              Confirm forecast
            </button>
            <p className="cap" style={{ margin: '0 4px', textAlign: 'center' }}>
              These amounts become {monthShort(month)}'s budget. You can still change them.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function balanceLabel(b: number): { text: string; color: string } {
  if (b > 0) return { text: 'Credit ' + money(b), color: 'var(--good)' };
  if (b < 0) return { text: 'Owes ' + money(-b), color: 'var(--warn)' };
  return { text: 'Settled', color: 'var(--sec)' };
}

/** How each member's balance at the end of the previous month was reached. */
function CarrySection({ db, view, prev }: { db: Db; view: ForecastView; prev: MonthKey }) {
  const name = monthShort(prev);
  // How each balance carried into the previous month was reached, one month further back.
  const before = memberBalances(db, addMonths(prev, -1));
  const spent = monthStats(db, prev).total;
  const sumPct = view.carry.reduce((a, x) => a + x.pct, 0);
  const gap = monthGap(db, prev);
  return (
    <section aria-labelledby="carry">
      <h2 className="sh lg" id="carry" style={{ paddingBottom: 8 }}>
        Balance from {name}
      </h2>
      <p className="cap" style={{ margin: '0 4px 10px', fontSize: 15, lineHeight: 1.4 }}>
        What each person put in during {name} compared with their share of what was really spent. It is added to or taken from this month's transfer.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {gap && (
          <div className="card r16 cl has-pop" style={{ padding: '12px 18px', overflow: 'visible' }}>
            <span className="l">
              {name}: planned {money(gap.planned)}, spent {money(gap.spent)}{' '}
              <InfoPopover label={'Where the ' + name + ' difference comes from'}>
                <MonthGap db={db} month={prev} />
              </InfoPopover>
            </span>
            <span className="num" style={{ fontWeight: 600, color: gap.gap > 0 ? 'var(--overInk)' : gap.gap < 0 ? 'var(--underInk)' : undefined }}>
              {money(gap.gap, { sign: true })}
            </span>
          </div>
        )}
        {view.carry.map((b) => {
          const res = balanceLabel(b.balance);
          return (
            <article key={b.member.id} className="card r16" style={{ padding: '14px 18px', overflow: 'visible' }} aria-label={b.member.name + "'s balance from " + name}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Avatar name={b.member.name} color={b.member.color} size={30} />
                <span style={{ flex: 1, fontWeight: 600 }}>{b.member.name}</span>
                <span className="num" style={{ fontWeight: 700, color: res.color }}>
                  {res.text}
                </span>
              </div>
              {b.carryIn !== 0 && (
                <div className="cl has-pop" style={{ paddingTop: 0 }}>
                  <span className="l">
                    How the balance before {name} was reached{' '}
                    <InfoPopover label={'How the balance before ' + name + ' was calculated'}>
                      <BalanceRecap b={before.find((x) => x.member.id === b.member.id)} month={addMonths(prev, -1)} spent={monthStats(db, addMonths(prev, -1)).total} sumPct={sumPct} />
                    </InfoPopover>
                  </span>
                </div>
              )}
              <BalanceLines b={b} month={prev} spent={spent} sumPct={sumPct} count={b.advanceCount} db={db} memberId={b.member.id} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** The calculation behind a balance carried into the next month, shown in the info bubble. */
export function BalanceRecap({ b, month, spent, sumPct }: { b: MemberBalance | undefined; month: MonthKey; spent: number; sumPct: number }) {
  const name = monthShort(month);
  if (!b) return null;
  return (
    <>
      <span className="t">
        {b.member.name}'s balance at the end of {name}
      </span>
      <span className="cap" style={{ marginBottom: 8 }}>
        Worked out when {name} ended, then carried into the next month:
      </span>
      <BalanceLines b={b} month={month} spent={spent} sumPct={sumPct} count={b.advanceCount} />
      <span className="cap" style={{ marginTop: 8 }}>
        Each month starts from the balance the month before ended with. Every figure of {name} is in its statement, from the {name} page.
      </span>
    </>
  );
}

function ShareCard({ s, total, prev, sumPct, confirmedAt }: { s: ShareView; total: number; prev: MonthKey; sumPct: number; confirmedAt: number | null }) {
  const exact = exactPart(total, s.pct, sumPct);
  const asOf = confirmedAt ? ' (as on ' + shortDay(dateKey(new Date(confirmedAt))) + ')' : '';
  return (
    <article className="card r16" style={{ padding: '16px 18px' }} aria-label={s.member.name + "'s share"}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Avatar name={s.member.name} color={s.member.color} size={34} />
        <span style={{ flex: 1, fontSize: 19, fontWeight: 600 }}>{s.member.name}</span>
        <span className="pill">{s.pct}%</span>
      </div>
      <div className="cl">
        <span className="l">Forecast total</span>
        <span className="num">{money(total)}</span>
      </div>
      <div className="cl">
        <span className="l">× {s.pct}%</span>
        <span className="num">{money(s.gross)}</span>
      </div>
      {exact !== s.gross && (
        <div className="cap" style={{ marginTop: -2 }}>
          Exactly {moneyExact(exact)}, rounded to the cent so the shares add up to {money(total)}.
        </div>
      )}
      {s.carry !== 0 && (
        <div className="cl">
          <span className="l">{(s.carry > 0 ? '− Credit from ' : '+ Still owed from ') + monthShort(prev) + asOf}</span>
          <span className="num" style={{ color: s.carry > 0 ? 'var(--good)' : 'var(--warn)' }}>
            {money(-s.carry, { sign: true })}
          </span>
        </div>
      )}
      <div style={{ borderTop: '0.5px solid var(--sep)', margin: '8px 0 10px' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="cap" style={{ fontSize: 15 }}>
            {s.transfer >= 0 ? 'To transfer to the joint account' : 'The joint account owes'}
          </div>
          <div className="num" style={{ fontSize: 30, fontWeight: 700, color: 'var(--tintText)', letterSpacing: '-0.02em' }}>
            {money(Math.abs(s.transfer))}
          </div>
        </div>
      </div>
    </article>
  );
}

/** A confirmed plan whose balances from the month before have changed since: what was used, what it is now. */
function CarryChanged({ db, month, checks }: { db: Db; month: MonthKey; checks: CarryCheck[] }) {
  const [ask, setAsk] = useState(false);
  if (!checks.some((c) => c.diff !== 0)) return null;
  const prev = monthShort(addMonths(month, -1));
  const next = monthShort(addMonths(month, 1));
  const ticked = checks.some((c) => received(db, month, c.member.id) != null);
  return (
    <section className="note tint" style={{ flexDirection: 'column', gap: 8 }} aria-label={prev + ' changed after this plan was confirmed'}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Icon name="refresh" size={20} style={{ color: 'var(--tintText)', flex: 'none', marginTop: 1 }} />
        <span>
          {prev} changed after this plan was confirmed. The transfers below use the balances as they were then. As is, the difference is carried into {next}.
        </span>
      </div>
      {checks.map((c) => (
        <div key={c.member.id} className="cl" style={{ fontSize: 13, padding: 0 }}>
          <span className="l">
            {c.member.name}: used {money(c.atConfirm, { sign: true })} · now {money(c.now, { sign: true })}
          </span>
          <span className="num" style={{ fontWeight: 600 }}>
            {money(c.diff, { sign: true })}
          </span>
        </div>
      ))}
      <button className="btn sec" type="button" style={{ minHeight: 44 }} onClick={() => setAsk(true)}>
        Recalculate the transfers now
      </button>
      {ask && (
        <Alert
          title="Recalculate the transfers?"
          message={
            'The ' + monthShort(month) + ' transfers will use the balances from ' + prev + ' as they are now. The amounts asked until now stay in the plan history.' +
            (ticked ? ' Transfers already ticked stay as recorded: any difference is carried into ' + next + '.' : '')
          }
          buttons={[
            { label: 'Cancel', style: 'cancel', onClick: () => setAsk(false) },
            {
              label: 'Recalculate',
              onClick: () => {
                confirmForecast(month);
                setAsk(false);
                toast(monthShort(month) + ' transfers recalculated', undefined, { low: true });
              }
            }
          ]}
        />
      )}
    </section>
  );
}

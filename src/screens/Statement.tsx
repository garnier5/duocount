import type { ReactNode } from 'react';
import { useDb, type Db } from '../data/store';
import { budgetOf, carryCheck, expectedTransfer, forecastView, memberBalances, monthStats } from '../domain/calc';
import { closings } from '../domain/history';
import { allCategories, categories, forecastRec, member, members, monthDoc, receivedRec } from '../domain/select';
import { addMonths, dateTime, monthName, monthShort, plural, type MonthKey } from '../lib/dates';
import { exactPart, money, moneyExact, percent, type Cents } from '../lib/money';
import { Avatar, BackLink } from '../ui/kit';
import { useMonth } from '../ui/useMonth';
import { BalanceLines } from './BalanceLines';
import { PlanHistory } from './PlanHistory';
import { MonthGap } from './PlanGap';
import { DoubleCountNote, SplitLines } from './SplitLines';

/** Every figure of one month in one place, each with how it was worked out. */
export function Statement() {
  const db = useDb();
  const { month } = useMonth(db);
  const name = monthShort(month);
  const stats = monthStats(db, month);
  const budget = budgetOf(db, month);
  const doc = monthDoc(db, month);
  const f = forecastRec(db, month)?.data;
  const status = doc.closedAt
    ? 'Closed on ' + dateTime(doc.closedAt)
    : f?.confirmedAt
      ? 'Plan confirmed on ' + dateTime(f.confirmedAt) + ' · not closed yet'
      : 'Plan not confirmed yet';

  return (
    <main className="page nofab">
      <header className="phead">
        <div className="phead-row" style={{ marginLeft: -8 }}>
          <BackLink to="/overview" label={name} />
        </div>
        <div style={{ padding: '0 4px' }}>
          <h1 className="ptitle" style={{ margin: 0 }}>
            {name} statement
          </h1>
          <div className="cap" style={{ fontSize: 15, marginTop: 2 }}>
            {monthName(month)} · {status}
          </div>
        </div>
      </header>

      <section className="card r16" style={{ padding: '14px 18px' }} aria-label="Summary">
        <Line label="Planned (confirmed plan)" value={budget == null ? 'Not confirmed' : money(budget)} />
        <Line label={'Spent by the household (' + plural(stats.count, 'expense') + ')'} value={money(stats.total)} />
        {budget != null && (
          <Line
            label={stats.total > budget ? 'Over plan' : stats.total < budget ? 'Under plan' : 'Exactly on plan'}
            value={money(stats.total - budget, { sign: true }) + ' · ' + percent(stats.total, budget)}
            strong
          />
        )}
        <a className="lnk" href="#/expenses">
          See the {plural(stats.count, 'expense')}
        </a>
      </section>

      <Section title="How it was entered" caption="Category totals come from the joint account statement. Expenses entered one by one are added to them.">
        <div className="card r16" style={{ padding: '10px 18px' }}>
          <SplitLines s={stats} total={stats.total} />
        </div>
        <div style={{ marginTop: 12 }}>
          <DoubleCountNote db={db} stats={stats} />
        </div>
      </Section>

      {budget != null && (
        <article className="card r16" style={{ padding: '14px 18px' }} aria-label={name + ': plan against spending'}>
          <MonthGap db={db} month={month} />
        </article>
      )}
      <ByCategory db={db} month={month} />
      <WhoPaid db={db} month={month} />
      <Transfers db={db} month={month} />
      <Balances db={db} month={month} />
      <PlanHistory db={db} month={month} />
      <Closings db={db} month={month} />
    </main>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="cl" style={strong ? { fontWeight: 600 } : undefined}>
      <span className="l" style={strong ? { color: 'var(--label)' } : undefined}>
        {label}
      </span>
      <span className="num" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="sh lg" style={{ paddingBottom: caption ? 4 : 10 }}>
        {title}
      </h2>
      {caption && (
        <p className="cap" style={{ margin: '0 4px 10px', fontSize: 15, lineHeight: 1.4 }}>
          {caption}
        </p>
      )}
      {children}
    </section>
  );
}

function ByCategory({ db, month }: { db: Db; month: MonthKey }) {
  const stats = monthStats(db, month);
  const f = forecastRec(db, month)?.data;
  const plan = f?.confirmedAt ? f : undefined;
  const all = allCategories(db);
  const ids = [...categories(db).map((c) => c.id), ...[...stats.byCat.keys()].filter((id) => !categories(db).some((c) => c.id === id))];
  const rows = ids
    .map((id) => ({ id, name: all.get(id)?.name ?? 'Deleted category', planned: plan?.lines[id] ?? 0, spent: stats.byCat.get(id)?.spent ?? 0, count: stats.byCat.get(id)?.count ?? 0, st: stats.byCat.get(id) }))
    .filter((r) => r.planned || r.spent);
  const extras = plan?.extras.filter((x) => x.amount) ?? [];
  if (!rows.length && !extras.length) return null;
  return (
    <Section title="Plan and spending by category" caption={plan ? 'Planned in the confirmed plan, against what was entered.' : 'No confirmed plan: only what was entered.'}>
      <div className="card lst in16">
        {rows.map((r) => (
          <div key={r.id} style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {money(r.spent)}
              </span>
            </div>
            <div className="ln">
              <span>
                {plural(r.count, 'expense')}
                {plan ? ' · planned ' + money(r.planned) : ''}
              </span>
              {plan && <span className="num">{r.planned ? money(r.spent - r.planned, { sign: true }) + ' · ' + percent(r.spent, r.planned) : 'not planned'}</span>}
            </div>
            {r.st && (
              <div className="ln num">
                <span>
                  {[
                    r.st.totals ? 'total ' + money(r.st.totals) : '',
                    r.st.singlesJoint ? 'one by one, joint account ' + money(r.st.singlesJoint) : '',
                    r.st.singlesAdvance ? 'one by one, paid by members ' + money(r.st.singlesAdvance) : ''
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                </span>
              </div>
            )}
          </div>
        ))}
        {extras.map((x) => (
          <div key={x.id} style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 500 }}>{x.label || 'One-off'}</span>
              <span className="num cap">planned {money(x.amount)}</span>
            </div>
            <div className="ln">
              <span>One-off line of the plan: spending goes in a category</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WhoPaid({ db, month }: { db: Db; month: MonthKey }) {
  const stats = monthStats(db, month);
  const ms = members(db);
  return (
    <Section title="Who paid" caption="Household spending is what the joint account paid, plus what members paid for the household (reimbursed through the transfers).">
      <div className="card r16" style={{ padding: '10px 18px' }}>
        <Line label="Paid from the joint account: totals by category" value={money(stats.totals)} />
        <Line label="Paid from the joint account: one by one" value={money(stats.singlesJoint)} />
        {ms.map((m) => {
          const mine = stats.advances.filter((e) => e.payer === m.id);
          if (!mine.length) return null;
          return <Line key={m.id} label={'Paid by ' + m.name + ' for the household (' + mine.length + ')'} value={money(mine.reduce((a, e) => a + e.amount, 0), { sign: true })} />;
        })}
        <Line label="= Household spending" value={money(stats.total)} strong />
        {stats.between.map((e) => (
          <Line key={e.id} label={(member(db, e.payer)?.name ?? 'Former member') + ' paid for the other: ' + e.label + ' (not household spending)'} value={money(e.amount)} />
        ))}
      </div>
    </Section>
  );
}

function Transfers({ db, month }: { db: Db; month: MonthKey }) {
  const f = forecastRec(db, month)?.data;
  if (!f?.confirmedAt || !f.shares) return null;
  const view = forecastView(db, month);
  const prev = monthShort(addMonths(month, -1));
  const total = view.total;
  const sumPct = Object.values(f.shares).reduce((a, s) => a + s.pct, 0);
  return (
    <Section title="Transfers to the joint account" caption={'Asked by the plan confirmed on ' + dateTime(f.confirmedAt) + ', and what was recorded.'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {view.shares.map((s) => {
          const rec = receivedRec(db, month, s.member.id);
          const asked = expectedTransfer(db, month, s.member.id);
          const exact = exactPart(total, s.pct, sumPct);
          return (
            <article key={s.member.id} className="card r16" style={{ padding: '12px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <Avatar name={s.member.name} color={s.member.color} size={30} />
                <span style={{ fontWeight: 600 }}>{s.member.name}</span>
              </div>
              <Line label="Plan total" value={money(total)} />
              <Line label={'× ' + s.pct + '%'} value={money(s.gross)} />
              {exact !== s.gross && <div className="cap">Exactly {moneyExact(exact)}, rounded to the cent so the shares add up to {money(total)}.</div>}
              {s.carry !== 0 && <Line label={(s.carry < 0 ? '+ Still owed from ' : '− Credit from ') + prev} value={money(-s.carry, { sign: true })} />}
              <Line label="= Asked" value={money(asked)} strong />
              {rec ? (
                <Line label={'Recorded on ' + dateTime(rec.at)} value={money(rec.data.amount)} tone={rec.data.amount === asked ? undefined : 'var(--warn)'} />
              ) : (
                <Line label="Not ticked: counted as asked" value={money(asked)} tone="var(--warn)" />
              )}
              {rec && rec.data.amount !== asked && <Line label="Difference, carried into the balance" value={money(rec.data.amount - asked, { sign: true })} />}
              {(rec?.data.history ?? []).map((h) => (
                <div key={h.at} className="cap">
                  Recorded before: {money(h.amount)} · {dateTime(h.at)}, {member(db, h.by)?.name ?? 'someone'}
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </Section>
  );
}

function Balances({ db, month }: { db: Db; month: MonthKey }) {
  const list = memberBalances(db, month);
  if (list.length < 2) return null;
  const spent = monthStats(db, month).total;
  const sumPct = list.reduce((a, b) => a + b.pct, 0);
  const next = addMonths(month, 1);
  const closing = closings(monthDoc(db, month)).at(-1);
  const used = new Map(carryCheck(db, next).map((c) => [c.member.id, c.atConfirm]));
  const nextConfirmed = !!forecastRec(db, next)?.data.confirmedAt;
  return (
    <Section title="Balances" caption={'What each person put in, against their share of the spending. The result is carried into the ' + monthShort(next) + ' plan.'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((b) => {
          const then = closing?.balances[b.member.id];
          const inNext = used.get(b.member.id);
          return (
            <article key={b.member.id} className="card r16" style={{ padding: '12px 18px', overflow: 'visible' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <Avatar name={b.member.name} color={b.member.color} size={30} />
                <span style={{ fontWeight: 600 }}>{b.member.name}</span>
              </div>
              <BalanceLines b={b} month={month} spent={spent} sumPct={sumPct} count={b.advanceCount} db={db} memberId={b.member.id} />
              {then && <Compare label={'At closing on ' + dateTime(closing!.at)} then={then.balance} now={b.balance} />}
              {nextConfirmed && inNext != null && <Compare label={'Used in the ' + monthShort(next) + ' plan'} then={inNext} now={b.balance} />}
              {!nextConfirmed && (
                <div className="cap" style={{ marginTop: 6 }}>
                  Used when the {monthShort(next)} plan is confirmed.
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Section>
  );
}

/** A figure shown before, next to the same figure now. */
function Compare({ label, then, now }: { label: string; then: Cents; now: Cents }) {
  const same = then === now;
  return (
    <div className="cl" style={{ fontSize: 13, paddingTop: 6 }}>
      <span className="l">
        {label}: {money(then, { sign: true })}
      </span>
      <span className="num" style={{ color: same ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>
        {same ? 'same as now' : money(now - then, { sign: true }) + ' since'}
      </span>
    </div>
  );
}

function Closings({ db, month }: { db: Db; month: MonthKey }) {
  const list = closings(monthDoc(db, month));
  if (!list.length) return null;
  return (
    <Section title="Closing history" caption="What the month showed each time it was closed.">
      <div className="card lst in16">
        {[...list].reverse().map((c) => (
          <div key={c.at} style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{dateTime(c.at)}</span>
              <span className="num">spent {money(c.spent)}</span>
            </div>
            <div className="cap">Closed by {member(db, c.by)?.name ?? 'someone'}</div>
            {Object.entries(c.balances).map(([id, b]) => (
              <div key={id} className="cl" style={{ fontSize: 13, padding: '3px 0' }}>
                <span className="l">
                  {member(db, id)?.name ?? 'Former member'}: transferred {money(b.transferred)}, share {money(b.due)}
                </span>
                <span className="num">{money(b.balance, { sign: true })}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

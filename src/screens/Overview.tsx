import { useEffect, useState } from 'react';
import { setLocal, useDb, type Db } from '../data/store';
import { deleteExpense } from '../domain/actions';
import {
  budgetOf,
  canEnterExpenses,
  canPlan,
  currentMonth,
  forecastView,
  isMonthEnd,
  memberBalances,
  monthStats,
  plannedFor,
  type ForecastView,
  type MonthStats
} from '../domain/calc';
import { categories, category, expensesOf, household, others, received, type CategoryView, type ExpenseView } from '../domain/select';
import { addMonths, dateKey, monthAbbr, daysInMonth, lastDayOf, monthShort, plural, shortDay, type MonthKey } from '../lib/dates';
import { money } from '../lib/money';
import { navigate } from '../lib/router';
import { Icon } from '../ui/icons';
import { ActionSheet, Avatar, MonthBar, Seg, Tile } from '../ui/kit';
import { openOverlay, toast } from '../ui/overlays';
import { useMonth } from '../ui/useMonth';
import { SwipeRow } from './Expenses';
import { PlanFirst } from './PlanFirst';
import { TransfersCard } from './Transfers';

const PREVIEW = 4;

/** The month page: plan, expenses and balances of one month, everything else is pushed from here. */
export function Overview() {
  const db = useDb();
  const mb = useMonth(db);
  const { month } = mb;
  const stats = monthStats(db, month);
  const budget = budgetOf(db, month);
  const view = forecastView(db, month);
  const closed = mb.info.phase === 'closed';
  const entered = stats.count > 0;
  const plannable = canPlan(db, month);
  const showBalances = entered && (closed || budget != null) && memberBalances(db, month).length === 2;
  const hasOthers = others(db).length > 0;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [month]);

  const planDot = closed || view.confirmedAt ? 'var(--good)' : plannable ? 'var(--warn)' : 'var(--ter)';
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <header className="mhead">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: 8, gap: 8 }}>
          <h1>{household(db)?.name ?? 'DuoCount'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
            <a className="iconbtn" href="#/charts" aria-label="Charts: planned vs paid and breakdown">
              <Icon name="chart" size={22} />
            </a>
            <a className="iconbtn" href="#/export" aria-label="Export to Excel">
              <Icon name="excel" size={22} />
            </a>
            <a className="iconbtn" href="#/settings" aria-label="Settings">
              <Icon name="sliders" size={22} />
            </a>
          </div>
        </div>
        <MonthBar month={month} stat={mb.stat} statColor={mb.statColor} canPrev={mb.canPrev} canNext={mb.canNext} onMove={mb.move} />
        <nav className="jump" aria-label="Sections of this month">
          <button type="button" onClick={() => jump('plan')}>
            <span className="d" style={{ background: planDot }} />
            Plan
          </button>
          <button type="button" onClick={() => jump('expenses')}>
            <span className="d" style={{ background: entered ? 'var(--good)' : 'var(--ter)' }} />
            Expenses
          </button>
          {showBalances && (
            <button type="button" onClick={() => jump('balances')}>
              <span className="d" style={{ background: 'var(--good)' }} />
              Balances
            </button>
          )}
        </nav>
      </header>

      <main className="page below nofab">
        {db.local.firstExpenseBanner && entered && hasOthers && <FirstExpenseBanner />}

        {entered ? (
          <PlanVsSpent db={db} month={month} stats={stats} budget={budget} closed={closed} plannable={plannable} />
        ) : (
          <PlanSection db={db} view={view} plannable={plannable} />
        )}

        <ExpensesSection db={db} month={month} stats={stats} closed={closed} />

        {showBalances && <Balances db={db} month={month} closed={closed} />}

        {closed && <NextPlanCard db={db} month={month} />}

        <p className="cap" style={{ margin: '0 8px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="shieldCheck" size={16} style={{ marginTop: 1 }} />
          Everything stays on this phone. Share it with the household from Settings › Household sync.
        </p>
      </main>
    </>
  );
}

function FirstExpenseBanner() {
  return (
    <div role="status" className="card" style={{ background: 'var(--goodSoft)', padding: '14px 8px 8px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <Icon name="checkCircle" size={24} style={{ color: 'var(--good)', marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>First expense saved</div>
        <div style={{ fontSize: 15, lineHeight: 1.4, marginTop: 2 }}>It's kept on this phone. Share it with your household whenever you like.</div>
        <a className="lnk" href="#/sync" onClick={() => setLocal({ firstExpenseBanner: false })}>
          Share my data
          <Icon name="chevron" size={16} />
        </a>
      </div>
      <button className="iconbtn" type="button" aria-label="Close" onClick={() => setLocal({ firstExpenseBanner: false })} style={{ color: 'var(--sec)', width: 36, height: 36 }}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

function Pill({ text, tone }: { text: string; tone: 'good' | 'warn' | 'tint' | 'sec' }) {
  const colors = {
    good: ['var(--goodSoft)', 'var(--good)'],
    warn: ['var(--warnSoft)', 'var(--warn)'],
    tint: ['var(--tintSoft)', 'var(--tintText)'],
    sec: ['var(--fill)', 'var(--sec)']
  }[tone];
  return (
    <span className="pill" style={{ background: colors[0], color: colors[1] }}>
      {text}
    </span>
  );
}

function MoreButton({ all, count, onToggle }: { all: boolean; count: number; onToggle: () => void }) {
  return (
    <button className="more" type="button" aria-expanded={all} onClick={onToggle}>
      {all ? 'Show fewer categories' : 'Show all ' + plural(count, 'category', 'categories')}
    </button>
  );
}

// ---------- Plan (before any expense is entered) ----------

function PlanSection({ db, view, plannable }: { db: Db; view: ForecastView; plannable: boolean }) {
  const [all, setAll] = useState(false);
  const month = view.month;
  const prev = addMonths(month, -1);
  const confirmed = !!view.confirmedAt;
  const title = monthShort(month) + ' plan';

  if (!plannable) {
    return (
      <section id="plan" className="msec" aria-labelledby="planT">
        <h2 className="sh lg" id="planT">
          {title} <Pill text="Not open yet" tone="sec" />
        </h2>
        <div className="dashed">
          <h3>Close {monthShort(prev)} first</h3>
          <p>This plan opens once {monthShort(prev)}'s expenses are entered and closed. It is then pre-filled from {monthShort(prev)} and your recurring expenses.</p>
          <button
            className="btn sec"
            type="button"
            style={{ marginTop: 6 }}
            onClick={() => {
              setLocal({ selectedMonth: prev });
              navigate('/month/review');
            }}
          >
            Review and close {monthShort(prev)}
          </button>
        </div>
      </section>
    );
  }

  const rows = [
    ...view.lines.filter((l) => l.amount > 0).map((l) => ({ id: l.cat.id, icon: l.cat.icon, color: l.cat.color, name: l.cat.name, caption: l.caption, tone: l.tone, amount: l.amount })),
    ...view.extras.filter((x) => x.amount > 0).map((x) => ({ id: x.id, icon: 'receipt' as const, color: 'var(--ter)', name: x.label || 'One-off', caption: 'One-off', tone: 'sec' as const, amount: x.amount }))
  ];
  const shown = all ? rows : rows.slice(0, PREVIEW);
  const diff = view.prevTotal != null ? view.total - view.prevTotal : null;
  const sub = confirmed
    ? 'Confirmed on ' + shortDay(dateKey(new Date(view.confirmedAt!)))
    : view.total === 0
      ? 'Nothing planned yet'
      : (diff != null && diff !== 0 ? money(diff, { compact: true, sign: true }) + ' vs ' + monthShort(prev) + ' · ' : '') +
        (view.exists ? 'draft, not confirmed yet' : 'pre-filled from ' + (view.prevTotal != null ? monthShort(prev) + ' and ' : '') + 'recurring');

  return (
    <section id="plan" className="msec" aria-labelledby="planT">
      <h2 className="sh lg" id="planT">
        {title} <Pill text={confirmed ? 'Confirmed' : 'Draft'} tone={confirmed ? 'good' : 'warn'} />
      </h2>
      <div className="card r16" style={{ padding: '16px 18px' }}>
        <div className="cap" style={{ fontSize: 15 }}>
          Planned for the month
        </div>
        <div className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em' }}>
          {money(view.total)}
        </div>
        <div className="cap" style={{ fontSize: 15 }}>
          {sub}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card r16 lst" style={{ marginTop: 12, ['--inset' as string]: '62px' }}>
          {shown.map((r) => (
            <div key={r.id} className="crow">
              <Tile icon={r.icon} color={r.color} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 500 }}>{r.name}</span>
                <span className="cap" style={{ color: r.tone === 'sec' ? undefined : 'var(--' + r.tone + ')' }}>
                  {r.caption}
                </span>
              </span>
              <span className="num" style={{ fontWeight: 600 }}>
                {money(r.amount, { compact: true })}
              </span>
            </div>
          ))}
          {rows.length > PREVIEW && <MoreButton all={all} count={rows.length} onToggle={() => setAll(!all)} />}
        </div>
      )}

      {confirmed ? (
        <div style={{ marginTop: 20 }}>
          <TransfersCard db={db} month={month} title="Transfers to the joint account" />
        </div>
      ) : (
        view.shares.length > 0 && view.total > 0 && <DraftTransfers view={view} />
      )}

      {confirmed ? (
        <p className="cap" style={{ margin: '8px 4px 0' }}>
          The plan is confirmed.{' '}
          <a className="textbtn" href="#/forecast" style={{ fontSize: 13 }}>
            Open the plan
          </a>{' '}
          to see how the transfers were calculated.
        </p>
      ) : (
        <a className="btn pri" href="#/forecast" style={{ marginTop: 12 }}>
          Adjust and confirm the plan
        </a>
      )}
    </section>
  );
}

function DraftTransfers({ view }: { view: ForecastView }) {
  const [calc, setCalc] = useState(false);
  const prev = monthShort(addMonths(view.month, -1));
  return (
    <div className="card r16" style={{ marginTop: 12, padding: '6px 16px 0' }}>
      <div className="cap" style={{ fontSize: 15, padding: '8px 0 2px' }}>
        Transfers to the joint account
      </div>
      {view.shares.map((s) => (
        <div key={s.member.id} className="trow">
          <Avatar name={s.member.name} color={s.member.color} size={30} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block' }}>
              {s.member.name} · {s.pct}%
            </span>
            <span className="cap">
              {s.carry > 0 ? 'Credit from ' + prev + ' deducted' : s.carry < 0 ? 'Still owed from ' + prev + ' added' : 'Due at the start of the month'}
            </span>
          </span>
          <span className="num" style={{ fontWeight: 700, color: 'var(--tintText)' }}>
            {money(s.transfer)}
          </span>
        </div>
      ))}
      {calc && (
        <div className="calc">
          {view.shares.map((s, i) => (
            <div key={s.member.id} style={{ borderTop: i ? '0.5px solid var(--sep)' : undefined }}>
              <div className="cl">
                <span className="l">
                  {s.member.name}: {money(view.total, { compact: true })} × {s.pct}%
                </span>
                <span className="num">{money(s.gross)}</span>
              </div>
              {s.carry !== 0 && (
                <div className="cl">
                  <span className="l">{s.carry > 0 ? '− credit from ' + prev : '+ still owed from ' + prev}</span>
                  <span className="num" style={{ color: s.carry > 0 ? 'var(--good)' : 'var(--warn)' }}>
                    {money(-s.carry, { sign: true })}
                  </span>
                </div>
              )}
              <div className="cl">
                <span className="l">= to transfer</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {money(s.transfer)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="more" type="button" aria-expanded={calc} style={{ marginTop: 6 }} onClick={() => setCalc(!calc)}>
        {calc ? 'Hide the calculation' : 'How are the transfers calculated?'}
      </button>
    </div>
  );
}

// ---------- Plan vs spent (once expenses are entered) ----------

function PlanVsSpent({ db, month, stats, budget, closed, plannable }: { db: Db; month: MonthKey; stats: MonthStats; budget: number | null; closed: boolean; plannable: boolean }) {
  const view = forecastView(db, month);
  const untickedTransfers = !closed && !!view.confirmedAt && view.shares.some((s) => received(db, month, s.member.id) == null);
  const reopened = view.exists && !view.confirmedAt;
  const pill = closed ? (
    <Pill text="Month closed" tone="good" />
  ) : budget != null ? (
    <Pill text="In progress" tone="tint" />
  ) : (
    <Pill text={reopened ? 'Plan reopened' : 'No plan'} tone={reopened ? 'warn' : 'sec'} />
  );
  return (
    <section id="plan" className="msec" aria-labelledby="planT">
      <h2 className="sh lg" id="planT">
        {budget != null ? 'Plan vs spent' : 'Spent'} {pill}
      </h2>
      {untickedTransfers && (
        <div style={{ marginBottom: 20 }}>
          <TransfersCard db={db} month={month} />
        </div>
      )}
      <SpentCard month={month} stats={stats} budget={budget} closed={closed} confirmedAt={view.confirmedAt} plannable={plannable} reopened={reopened} />
      <ByCategory db={db} month={month} stats={stats} budget={budget} />
    </section>
  );
}

function SpentCard({
  month,
  stats,
  budget,
  closed,
  confirmedAt,
  plannable,
  reopened
}: {
  month: MonthKey;
  stats: MonthStats;
  budget: number | null;
  closed: boolean;
  confirmedAt: number | null;
  plannable: boolean;
  reopened: boolean;
}) {
  if (budget == null) {
    return (
      <div className="card r16" style={{ padding: '16px 18px 8px' }}>
        <div className="num" style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em' }}>
          {money(stats.total)}
        </div>
        <div className="cap" style={{ fontSize: 15, paddingBottom: plannable ? 0 : 10 }}>
          {reopened ? 'spent · the plan was reopened and needs confirming' : 'spent · no plan for this month yet'}
        </div>
        {plannable && (
          <a className="lnk" href="#/forecast">
            {reopened ? 'Confirm the plan' : 'Prepare the plan'}
            <Icon name="chevron" size={16} />
          </a>
        )}
      </div>
    );
  }
  const pct = budget > 0 ? Math.round((stats.total / budget) * 100) : 0;
  const left = budget - stats.total;
  const over = left < 0;
  const remainingDays = daysInMonth(month) - new Date().getDate();
  const right = !closed && month === currentMonth() && remainingDays > 0 ? plural(remainingDays, 'day') + ' left' : '';
  return (
    <div className="card r16" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="num" style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em' }}>
          {money(stats.total)}
        </span>
        <span
          className="num"
          style={{ fontSize: 15, fontWeight: 600, color: over ? 'var(--bad)' : 'var(--tintText)', background: over ? 'var(--badSoft)' : 'var(--tintSoft)', padding: '3px 9px', borderRadius: 10 }}
        >
          {pct}%
        </span>
      </div>
      <div className="cap" style={{ fontSize: 15 }}>
        spent of {money(budget)} planned{confirmedAt ? ' · plan confirmed ' + shortDay(dateKey(new Date(confirmedAt))) : ''}
      </div>
      <div className="meter" style={{ margin: '14px 0 10px' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-label={pct + '% of the plan used'}>
        <div style={{ width: Math.min(100, pct) + '%', background: over ? 'var(--bad)' : 'var(--tint)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 15 }}>
          <strong className="num" style={{ color: over ? 'var(--bad)' : undefined }}>
            {money(Math.abs(left))}
          </strong>{' '}
          {over ? 'over plan' : 'under plan'}
        </span>
        <span className="cap">{right}</span>
      </div>
    </div>
  );
}

function ByCategory({ db, month, stats, budget }: { db: Db; month: MonthKey; stats: MonthStats; budget: number | null }) {
  const [all, setAll] = useState(false);
  const cats = categories(db);
  const deleted = [...stats.byCat.keys()].filter((id) => !cats.some((c) => c.id === id)).map((id) => category(db, id)).filter((c): c is CategoryView => !!c);
  const rows = [...cats, ...deleted]
    .map((c) => ({ c, spent: stats.byCat.get(c.id)?.spent ?? 0, planned: budget != null ? plannedFor(db, month, c.id) ?? 0 : 0 }))
    .filter((r) => r.spent > 0 || r.planned > 0)
    .sort((a, b) => b.spent - a.spent || b.planned - a.planned);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, PREVIEW);
  return (
    <div className="card r16 lst" style={{ marginTop: 12, ['--inset' as string]: '62px' }}>
      {shown.map(({ c, spent, planned }) => {
        const pct = planned ? Math.round((spent / planned) * 100) : null;
        let note = budget == null ? plural(stats.byCat.get(c.id)?.count ?? 0, 'expense') : pct == null ? 'Not planned' : pct + '%';
        let tone: string | undefined;
        if (pct != null && pct >= 100 && c.recurringDay && spent <= planned * 1.02) note = '100% · paid';
        else if (pct != null && pct > 100) {
          note = pct + '% · over plan';
          tone = 'var(--bad)';
        }
        return (
          <div key={c.id} className="crow">
            <Tile icon={c.icon} color={c.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {money(spent)}
                </span>
              </div>
              {planned > 0 && (
                <div className="mini">
                  <div style={{ width: pct == null ? '0%' : Math.min(100, pct) + '%', background: tone ?? c.color }} />
                </div>
              )}
              <div className="ln">
                <span style={tone ? { color: tone, fontWeight: 500 } : undefined}>{note}</span>
                <span className="num">{planned ? 'planned ' + money(planned, { compact: true }) : ''}</span>
              </div>
            </div>
          </div>
        );
      })}
      {rows.length > PREVIEW && <MoreButton all={all} count={rows.length} onToggle={() => setAll(!all)} />}
    </div>
  );
}

// ---------- Expenses ----------

function ExpensesSection({ db, month, stats, closed }: { db: Db; month: MonthKey; stats: MonthStats; closed: boolean }) {
  const [filter, setFilter] = useState<'all' | 'adv'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ExpenseView | null>(null);
  const name = monthShort(month);
  const all = expensesOf(db, month);
  const list = filter === 'adv' ? all.filter((e) => e.payer !== 'joint') : all;
  const monthEnd = isMonthEnd(db, month);
  const future = month > currentMonth();
  const canAdd = canEnterExpenses(db, month);

  useEffect(() => setOpen(null), [month, filter]);

  if (!stats.count && !canAdd) {
    return (
      <section id="expenses" className="msec" aria-labelledby="expT">
        <h2 className="sh lg" id="expT">
          Expenses <Pill text="After the plan" tone="sec" />
        </h2>
        <PlanFirst db={db} month={month} cta={false} />
      </section>
    );
  }

  if (!stats.count) {
    const late = monthEnd;
    const reminder = db.local.reminder ? " We'll remind you on " + shortDay(lastDayOf(month)) + ' at 8:00 PM.' : '';
    return (
      <section id="expenses" className="msec" aria-labelledby="expT">
        <h2 className="sh lg" id="expT">
          Expenses <Pill text="None yet" tone="sec" />
        </h2>
        <div className="dashed">
          <div
            style={{ width: 56, height: 56, borderRadius: 28, background: late ? 'var(--warnSoft)' : 'var(--tintSoft)', color: late ? 'var(--warn)' : 'var(--tintText)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-hidden="true"
          >
            <Icon name="receipt" size={28} stroke={1.8} />
          </div>
          <h3>{late ? 'Time to enter ' + name : 'Nothing entered for ' + name + ' yet'}</h3>
          <p>
            {late
              ? 'Get your receipts and bank statement: enter each expense, or one total per category.'
              : future
                ? name + ' starts on ' + shortDay(month + '-01') + '. You can already add an expense you know about.'
                : 'Enter everything at the end of the month.' + reminder}
          </p>
          <button className="btn pri" type="button" style={{ marginTop: 6 }} onClick={() => navigate('/month/entry')}>
            Enter {name}'s expenses
          </button>
          <button className="btn sec" type="button" onClick={() => openOverlay({ expense: { month } })}>
            Add one expense now
          </button>
        </div>
        <p className="cap" style={{ margin: '8px 4px 0' }}>
          Spending and balances appear here, next to the plan, once the expenses are entered.
        </p>
      </section>
    );
  }

  const doDelete = (e: ExpenseView) => {
    const undo = deleteExpense(e.id);
    setConfirm(null);
    setOpen(null);
    toast('Expense deleted', { label: 'Undo', run: undo });
  };

  return (
    <section id="expenses" className="msec" aria-labelledby="expT">
      <h2 className="sh lg" id="expT">
        Expenses{' '}
        {canAdd && (
        <button className="link" type="button" onClick={() => openOverlay({ addMenu: month })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32 }}>
          <Icon name="plus" size={16} stroke={2.6} />
          Add
        </button>
        )}
      </h2>
      <Seg
        small
        label="Filter"
        value={filter}
        onChange={setFilter}
        items={[
          { id: 'all', label: 'All' },
          { id: 'adv', label: 'Paid by a member' }
        ]}
      />
      <div className="card r16 lst" style={{ marginTop: 10 }}>
        {list.slice(0, 5).map((e) => (
          <SwipeRow
            key={e.id}
            db={db}
            e={e}
            open={open === e.id}
            onOpen={(v) => setOpen(v ? e.id : null)}
            onEdit={() => {
              setOpen(null);
              openOverlay({ expense: { id: e.id, month } });
            }}
            onDelete={() => setConfirm(e)}
          />
        ))}
        {list.length === 0 && (
          <p className="cap" style={{ margin: 0, padding: '16px', fontSize: 15, textAlign: 'center' }}>
            Nothing paid with a member's own money this month.
          </p>
        )}
        <a className="more" href="#/expenses">
          See all {plural(all.length, 'expense')}
          <Icon name="chevron" size={16} />
        </a>
      </div>
      <p className="cap" style={{ margin: '8px 4px 0' }}>
        Swipe left (or tap) an expense to edit or delete it.
      </p>
      {!canAdd && (
        <p className="cap" style={{ margin: '8px 4px 0', color: 'var(--warn)' }}>
          The {name} plan was reopened: confirm it again to add expenses.
        </p>
      )}
      {!closed && monthEnd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          <button className="btn pri" type="button" onClick={() => navigate('/month/review')}>
            Review and close {name}
          </button>
          <button className="btn sec" type="button" onClick={() => navigate('/month/entry')}>
            Enter more expenses
          </button>
        </div>
      )}
      {confirm && (
        <ActionSheet
          title={'Delete “' + confirm.label + '”?'}
          detail={money(confirm.amount) + ' · ' + (category(db, confirm.categoryId)?.name ?? '') + '. The deletion will reach the household at the next sync.'}
          actions={[{ label: 'Delete expense', danger: true, onClick: () => doDelete(confirm) }]}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}

// ---------- Balances ----------

function Balances({ db, month, closed }: { db: Db; month: MonthKey; closed: boolean }) {
  const list = memberBalances(db, month);
  const next = monthShort(addMonths(month, 1));
  return (
    <section id="balances" className="msec" aria-labelledby="balT">
      <h2 className="sh lg" id="balT">
        {closed ? 'Balances' : 'Balances so far'} <span className="shc">transfers + paid − share</span>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {list.map((b) => {
          const tone = b.balance > 0 ? 'var(--good)' : b.balance < 0 ? 'var(--warn)' : 'var(--label)';
          const label = b.balance > 0 ? 'Credit' : b.balance < 0 ? 'Owes' : 'All settled';
          return (
            <div key={b.member.id} className="card r16" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar name={b.member.name} color={b.member.color} size={30} />
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.member.name}</span>
              </div>
              <div className="cap" style={{ marginTop: 12 }}>
                {label}
              </div>
              <div className="num" style={{ fontSize: 24, fontWeight: 700, color: tone }}>
                {money(b.balance, { sign: true })}
              </div>
              <div style={{ borderTop: '0.5px solid var(--sep)', margin: '10px 0 8px' }} />
              <div className="ln">
                <span>Transferred for {monthAbbr(month)}</span>
                <span className="num">{money(b.transferred, { compact: true })}</span>
              </div>
              {b.advances > 0 && (
                <div className="ln" style={{ marginTop: 3 }}>
                  <span>Paid for home</span>
                  <span className="num">{money(b.advances, { compact: true })}</span>
                </div>
              )}
              {b.between !== 0 && (
                <div className="ln" style={{ marginTop: 3 }}>
                  <span>{b.between > 0 ? 'Paid for other' : 'Owed to other'}</span>
                  <span className="num">{money(Math.abs(b.between), { compact: true })}</span>
                </div>
              )}
              <div className="ln" style={{ marginTop: 3 }}>
                <span>Share ({b.pct}%)</span>
                <span className="num">{money(b.due, { compact: true })}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="cap" style={{ margin: '8px 4px 0' }}>
        {closed
          ? 'Carried into the ' + next + ' plan: a credit lowers the transfer, a debt raises it.'
          : 'Transfers compared with each share of what has been spent so far. The final balance is carried into ' + next + '.'}
      </p>
    </section>
  );
}

function NextPlanCard({ db, month }: { db: Db; month: MonthKey }) {
  const next = addMonths(month, 1);
  if (!canPlan(db, next)) return null;
  const f = forecastView(db, next);
  const name = monthShort(next);
  const confirmed = !!f.confirmedAt;
  return (
    <button
      className="card r16"
      type="button"
      onClick={() => setLocal({ selectedMonth: next })}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 14px 16px', border: 0, color: 'var(--label)', textAlign: 'left', cursor: 'pointer', width: '100%', fontSize: 17 }}
    >
      <span
        style={{
          flex: 'none',
          width: 40,
          height: 40,
          borderRadius: 11,
          background: confirmed ? 'var(--goodSoft)' : 'var(--warnSoft)',
          color: confirmed ? 'var(--good)' : 'var(--warn)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Icon name="calendar" size={22} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{confirmed ? name + "'s plan is confirmed" : name + "'s plan is ready to confirm"}</span>
        <span className="cap">{money(f.total, { compact: true })} · balances from {monthShort(month)} included</span>
      </span>
      <Icon name="chevron" size={18} style={{ color: 'var(--ter)' }} />
    </button>
  );
}

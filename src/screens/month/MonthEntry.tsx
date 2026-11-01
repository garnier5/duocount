import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../data/store';
import { addExpense, deleteExpense, setCategoryTotal } from '../../domain/actions';
import { budgetOf, canEnterExpenses, isBetweenMembers, monthStats, plannedFor } from '../../domain/calc';
import { NEUTRAL } from '../../domain/defaults';
import { categories, category, expensesOf, members } from '../../domain/select';
import { monthShort, plural, type MonthKey } from '../../lib/dates';
import { currencySymbol, money, parseAmount } from '../../lib/money';
import { Icon } from '../../ui/icons';
import { AmountInput, NavBar, Seg, Switch, Tile } from '../../ui/kit';
import { toast } from '../../ui/overlays';
import { useMonth } from '../../ui/useMonth';
import { expenseCaption, reimburseCaption } from '../Expenses';
import { PlanFirst } from '../PlanFirst';
import { compare, PlanBar, PlanBox, PlanPill } from './PlanCompare';

export function MonthEntry() {
  const db = useDb();
  const { month } = useMonth(db);
  const [mode, setMode] = useState<'list' | 'cat'>('cat');
  const list = expensesOf(db, month);
  const total = list.filter((e) => !isBetweenMembers(e)).reduce((a, e) => a + e.amount, 0);
  const budget = budgetOf(db, month);
  const pct = budget ? Math.min(100, (total / budget) * 100) : 0;
  const catCount = new Set(list.map((e) => e.categoryId)).size;

  if (!canEnterExpenses(db, month)) {
    return (
      <div className="sub">
        <NavBar
          left={
            <a className="navbtn" href="#/overview">
              Close
            </a>
          }
          title={'Enter ' + monthShort(month)}
        />
        <div className="sub-body" style={{ paddingTop: 10 }}>
          <PlanFirst db={db} month={month} />
        </div>
      </div>
    );
  }

  return (
    <div className="sub">
      <NavBar
        left={
          <a className="navbtn" href="#/overview">
            Close
          </a>
        }
        title={'Enter ' + monthShort(month)}
        right={
          <a className="navbtn strong" href="#/month/review">
            Review
          </a>
        }
      />
      <div className="sub-body" style={{ gap: 16, paddingTop: 10 }}>
        <section className="card" style={{ padding: '14px 16px' }} aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span className="num" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {money(total)}
            </span>
            <span className="cap" style={{ fontSize: 15 }}>
              {mode === 'list' ? plural(list.length, 'expense') : catCount + ' of ' + plural(categories(db).length, 'category', 'categories')}
            </span>
          </div>
          {budget != null && (
            <div className="meter s6" style={{ margin: '10px 0 6px' }}>
              <div style={{ background: 'var(--tint)', width: pct + '%' }} />
            </div>
          )}
          <div className="cap">{budget != null ? 'of the ' + money(budget, { compact: true }) + ' budget · saved as you go' : 'Saved as you go'}</div>
        </section>

        <Seg
          label="Entry mode"
          value={mode}
          onChange={setMode}
          items={[
            { id: 'cat', label: 'Totals by category' },
            { id: 'list', label: 'One by one' }
          ]}
        />

        {mode === 'list' ? <OneByOne month={month} /> : <Totals month={month} onAdvance={() => setMode('list')} />}
      </div>
    </div>
  );
}

function OneByOne({ month }: { month: MonthKey }) {
  const db = useDb();
  const cats = categories(db);
  const ms = members(db);
  const [amt, setAmt] = useState('');
  const [label, setLabel] = useState('');
  const [cat, setCat] = useState(cats[0]?.id ?? '');
  const [payer, setPayer] = useState('joint');
  const [adv, setAdv] = useState(false);
  const amtRef = useRef<HTMLInputElement>(null);
  const list = expensesOf(db, month)
    .slice()
    .sort((a, b) => b.at - a.at);

  const cents = parseAmount(amt) ?? 0;
  const byCat = monthStats(db, month).byCat;
  const plan = plannedFor(db, month, cat);
  const add = () => {
    if (cents <= 0 || !cat) {
      amtRef.current?.focus();
      return;
    }
    const catName = cats.find((c) => c.id === cat)?.name ?? '';
    addExpense({ month, label: label.trim() || catName, amount: cents, categoryId: cat, payer, advance: payer !== 'joint' && adv });
    setAmt('');
    setLabel('');
    amtRef.current?.focus();
  };

  return (
    <>
      <section className="card" aria-label="New expense">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="frow" style={{ minHeight: 48 }}>
            <span className="num" style={{ fontSize: 28, fontWeight: 600, color: 'var(--sec)' }}>
              {currencySymbol()}
            </span>
            <input
              ref={amtRef}
              className="fin num"
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              aria-label="Amount"
              placeholder="0.00"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              style={{ fontSize: 28, fontWeight: 700, height: 56 }}
            />
          </div>
          <div className="frow" style={{ minHeight: 48 }}>
            <input className="fin" type="text" aria-label="Label" placeholder="Label (optional)" enterKeyHint="done" value={label} onChange={(e) => setLabel(e.target.value)} style={{ height: 46 }} />
          </div>
          <div style={{ paddingTop: 10, borderTop: '0.5px solid var(--sep)' }}>
            <div className="cap" style={{ padding: '0 16px' }}>
              Category
            </div>
            <div className="chips" role="radiogroup" aria-label="Category">
              {cats.map((c) => (
                <button key={c.id} className={'chip fill' + (c.id === cat ? ' on' : '')} type="button" role="radio" aria-checked={c.id === cat} onClick={() => setCat(c.id)}>
                  <span className="dot" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
            {plan != null && <PlanBox name={cats.find((c) => c.id === cat)?.name ?? ''} entered={byCat.get(cat)?.spent ?? 0} plan={plan} />}
          </div>
          {ms.length > 0 && (
            <div style={{ padding: '0 16px 12px' }}>
              <div className="cap" style={{ paddingBottom: 6 }}>
                Paid by
              </div>
              <Seg
                label="Paid by"
                value={payer}
                onChange={(v) => {
                  setPayer(v);
                  setAdv(v !== 'joint');
                }}
                items={[{ id: 'joint', label: 'Joint account' }, ...ms.map((m) => ({ id: m.id, label: m.name }))]}
              />
            </div>
          )}
          {payer !== 'joint' && (
            <div className="frow" style={{ borderTop: '0.5px solid var(--sep)', minHeight: 56 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>Reimbursed by the joint account</span>
                <span className="cap" style={{ color: adv ? undefined : 'var(--warn)' }}>
                  {reimburseCaption(db, payer, adv)}
                </span>
              </span>
              <Switch on={adv} onChange={setAdv} label="Reimbursed by the joint account" />
            </div>
          )}
          <div style={{ padding: '4px 16px 16px' }}>
            <button className="btn pri s50" type="submit" disabled={cents <= 0}>
              <Icon name="plus" size={20} stroke={2.4} />
              Add and enter the next one
            </button>
          </div>
        </form>
      </section>

      <PlanVsEntered month={month} />

      {list.length > 0 && (
        <section>
          <h2 className="sh">
            <span>Entered</span>
            <span>{list.length}</span>
          </h2>
          <div className="card lst">
            {list.map((e) => {
              const c = category(db, e.categoryId);
              return (
                <div key={e.id} className="erow static" style={{ padding: '6px 6px 6px 16px', minHeight: 56 }}>
                  <span className="init" style={{ background: c?.color ?? NEUTRAL }} aria-hidden="true">
                    {(c?.name ?? '?').charAt(0)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.label}
                      {e.payer !== 'joint' && <span className="tag">{e.advance ? 'Advance' : 'Owed'}</span>}
                    </div>
                    <div className="cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {expenseCaption(db, e)}
                    </div>
                  </div>
                  <span className="num" style={{ fontWeight: 600 }}>
                    {money(e.amount)}
                  </span>
                  <button
                    className="x"
                    type="button"
                    aria-label={'Remove ' + e.label}
                    onClick={() => {
                      const undo = deleteExpense(e.id);
                      toast('Expense removed', { label: 'Undo', run: undo }, { low: true });
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

/** Each category's plan next to what is entered so far. */
function PlanVsEntered({ month }: { month: MonthKey }) {
  const db = useDb();
  const byCat = monthStats(db, month).byCat;
  const rows = categories(db)
    .map((c) => ({ c, plan: plannedFor(db, month, c.id) ?? 0, entered: byCat.get(c.id)?.spent ?? 0 }))
    .filter((r) => r.plan > 0 || r.entered > 0);
  if (budgetOf(db, month) == null || rows.length === 0) return null;
  return (
    <section>
      <h2 className="sh">
        <span>Plan vs entered</span>
        <span>{monthShort(month)}</span>
      </h2>
      <div className="card">
        {rows.map(({ c, plan, entered }) => {
          const cmp = compare(entered, plan);
          return (
            <div key={c.id} className="vrow">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 15 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="dot" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="num" style={{ whiteSpace: 'nowrap' }}>
                  <strong>{money(entered)}</strong>
                  <span style={{ color: 'var(--sec)' }}> of </span>
                  <PlanPill plan={plan} small suffix />
                </span>
              </div>
              <PlanBar entered={entered} plan={plan} style={{ margin: '8px 0 4px' }} />
              <div className="num" style={{ fontSize: 13, textAlign: 'right', color: cmp.color, fontWeight: 600 }}>
                {cmp.delta}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Totals({ month, onAdvance }: { month: MonthKey; onAdvance: () => void }) {
  const db = useDb();
  const cats = categories(db);
  const list = expensesOf(db, month);
  const byCat = monthStats(db, month).byCat;
  const prefilled = useRef(false);

  // Fixed monthly amounts are filled in for categories with nothing entered yet.
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    let n = 0;
    for (const c of cats) {
      if (c.recurringDay && c.planned && !list.some((e) => e.categoryId === c.id)) {
        setCategoryTotal(month, c, c.planned);
        n++;
      }
    }
    if (n) toast(plural(n, 'fixed amount') + ' filled in', undefined, { low: true });
  }, [month, cats, list]);

  return (
    <>
      <p className="cap" style={{ margin: '0 4px', fontSize: 15, lineHeight: 1.4 }}>
        Type one total per category, for example from your bank statement. Fixed amounts are already filled in.
      </p>
      <section className="card lst" aria-label="Totals by category">
        {cats.map((c) => {
          const totalRow = list.find((e) => e.kind === 'total' && e.categoryId === c.id);
          const singles = list.filter((e) => e.kind !== 'total' && e.categoryId === c.id);
          const singlesSum = singles.reduce((a, e) => a + e.amount, 0);
          const planned = plannedFor(db, month, c.id) ?? c.planned ?? 0;
          const entered = byCat.get(c.id)?.spent ?? 0;
          const cmp = compare(entered, planned);
          let sub = c.recurringDay ? (totalRow ? 'Recurring · prefilled' : 'Recurring') : '';
          if (singles.length) sub = '+ ' + money(singlesSum) + ' entered one by one';
          return (
            <div key={c.id} className="trow2">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tile icon={c.icon} color={c.color} iconSize={19} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="t" style={{ display: 'block' }}>{c.name}</span>
                  <span style={{ display: 'block', marginTop: 4 }}>
                    <PlanPill plan={planned} />
                  </span>
                </span>
                <AmountInput className="amtin" label={c.name + ' total'} placeholder={currencySymbol() + '0.00'} value={totalRow?.amount ?? null} onCommit={(v) => setCategoryTotal(month, c, v)} />
              </div>
              {(planned > 0 || entered > 0) && (
                <>
                  <PlanBar entered={entered} plan={planned} style={{ margin: '10px 0 4px 46px' }} />
                  <div className="num" style={{ marginLeft: 46, display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--sec)' }}>{sub}</span>
                    <span style={{ color: cmp.color, fontWeight: 600 }}>{cmp.delta}</span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </section>
      <div className="note warn">
        <Icon name="undo" size={20} />
        <span>
          Advances still go in one by one, so the right person gets repaid.{' '}
          <button className="textbtn" type="button" onClick={onAdvance} style={{ fontSize: 15 }}>
            Add an advance
          </button>
        </span>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useDb } from '../../data/store';
import { addExpense, updateExpense } from '../../domain/actions';
import { canEnterExpenses, maxMonth, monthStats, plannedFor, startMonth } from '../../domain/calc';
import { expenseVersion } from '../../domain/history';
import { categories, expenseRec, member, members } from '../../domain/select';
import type { Db } from '../../data/store';
import type { Expense, Rec } from '../../domain/types';
import { expenseDiff } from '../../sync/describe';
import { addMonths, dateTime, monthName, monthShort, type MonthKey } from '../../lib/dates';
import { currencySymbol, money } from '../../lib/money';
import { Icon } from '../../ui/icons';
import { Seg, Sheet, SheetNav, Switch } from '../../ui/kit';
import { closeOverlay, toast, type ExpenseSheetState } from '../../ui/overlays';
import { reimburseCaption } from '../Expenses';
import { PlanBox } from '../month/PlanCompare';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/** Months an expense can go in, latest first (an edited expense keeps its own month in the list). */
function monthChoices(min: MonthKey, max: MonthKey, own?: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = max; m >= min; m = addMonths(m, -1)) out.push(m);
  if (own && !out.includes(own)) out.push(own);
  return out.sort().reverse();
}

function toText(cents: number): string {
  const s = (cents / 100).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

export function ExpenseSheet({ state }: { state: ExpenseSheetState }) {
  const db = useDb();
  const cats = categories(db);
  const ms = members(db);
  const meId = db.local.meId ?? '';
  const existing = state.id ? expenseRec(db, state.id) : undefined;
  const e = existing?.data;

  const [amt, setAmt] = useState(e ? toText(e.amount) : '');
  const [cat, setCat] = useState(e?.categoryId ?? cats[0]?.id ?? '');
  const [label, setLabel] = useState(e?.label ?? '');
  const [target, setTarget] = useState<MonthKey>(e?.month ?? state.month);
  const [payer, setPayer] = useState(e?.payer ?? (state.advance ? meId : 'joint'));
  const [adv, setAdv] = useState(e ? e.advance : true);

  const close = () => closeOverlay('expense');
  const cents = Math.round(parseFloat(amt || '0') * 100) || 0;
  // An expense can only go into a month whose plan is confirmed (an edit may stay where it already is).
  const locked = !canEnterExpenses(db, target) && !(e && e.month === target);
  const valid = cents > 0 && !!cat && !locked;
  const personal = payer !== 'joint';
  const who = ms.find((m) => m.id === payer)?.name ?? '';
  const catName = cats.find((c) => c.id === cat)?.name ?? '';
  const plan = cat && !locked ? plannedFor(db, target, cat) : null;

  const press = (ch: string) => {
    setAmt((a) => {
      if (ch === 'del') return a.slice(0, -1);
      if (ch === '.') return a.includes('.') ? a : (a || '0') + '.';
      const [int, dec] = a.split('.');
      if (dec != null && dec.length >= 2) return a;
      if (dec == null && int.length >= 7) return a;
      return (a === '0' ? '' : a) + ch;
    });
  };

  // Physical keyboard on a computer.
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(ev.key)) press(ev.key);
      else if (ev.key === '.' || ev.key === ',') press('.');
      else if (ev.key === 'Backspace') press('del');
      else return;
      ev.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const save = () => {
    if (!valid) return;
    const input = { month: target, label: label.trim() || catName, amount: cents, categoryId: cat, payer, advance: personal && adv, kind: e?.kind, recurring: e?.recurring };
    if (state.id) {
      updateExpense(state.id, input);
      toast('Expense updated', undefined, { low: true });
    } else {
      addExpense(input);
      toast(personal && adv ? 'Advance saved' : 'Expense saved', undefined, { low: true });
    }
    close();
  };

  const [int, dec] = (amt || '0').split('.');
  const shown = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec != null ? '.' + dec : '');
  const title = state.id ? 'Edit expense' : state.advance ? 'New advance' : 'New expense';

  return (
    <Sheet onClose={close} labelledBy="expT">
      <SheetNav
        id="expT"
        title={title}
        left={
          <button className="navbtn" type="button" onClick={close}>
            Cancel
          </button>
        }
        right={
          <button className="navbtn strong" type="button" disabled={!valid} onClick={save}>
            {state.id ? 'Save' : 'Add'}
          </button>
        }
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center', padding: '6px 16px 10px' }}>
          <div className="num" aria-live="polite" style={{ fontSize: 50, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.12, color: cents ? undefined : 'var(--ter)' }}>
            <span style={{ color: 'var(--sec)', fontWeight: 600 }}>{currencySymbol()}</span>
            {shown}
          </div>
          <div className="cap">
            {catName} · {personal ? 'paid by ' + who : 'joint account'}
          </div>
        </div>

        <div className="catgrid" role="radiogroup" aria-label="Category">
          {cats.map((c) => (
            <button key={c.id} className={'cat' + (c.id === cat ? ' on' : '')} type="button" role="radio" aria-checked={c.id === cat} onClick={() => setCat(c.id)}>
              <span className="t" style={{ background: c.color }}>
                <Icon name={c.icon} size={20} />
              </span>
              <span>{c.name.split(' / ')[0]}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan != null && <PlanBox name={catName} entered={monthStats(db, target).byCat.get(cat)?.spent ?? 0} plan={plan} />}
          <div className="card r12">
            <label className="frow">
              <span>Label</span>
              <input className="fin right" type="text" placeholder={catName} value={label} onChange={(ev) => setLabel(ev.target.value)} enterKeyHint="done" />
            </label>
            <div className="frow">
              <span style={{ flex: 1 }}>Month</span>
              <span className="datebtn">
                {monthName(target)}
                <Icon name="chevronDown" size={14} style={{ marginLeft: 4 }} />
                <select aria-label="Month" value={target} onChange={(ev) => setTarget(ev.target.value)}>
                  {monthChoices(startMonth(db), maxMonth(db), e?.month).map((m) => (
                    <option key={m} value={m}>
                      {monthName(m)}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
          {locked && (
            <div className="note warn" role="alert">
              <Icon name="lock" size={20} />
              <span>The {monthShort(target)} plan isn't confirmed yet. Confirm it before adding expenses to {monthShort(target)}, or pick another month.</span>
            </div>
          )}

          {ms.length > 0 && (
            <Seg
              label="Who paid?"
              value={payer}
              onChange={(v) => {
                setPayer(v);
                if (v !== 'joint' && !e) setAdv(true);
              }}
              items={[{ id: 'joint', label: 'Joint account' }, ...ms.map((m) => ({ id: m.id, label: m.name }))]}
            />
          )}

          {personal ? (
            <div className="card r12" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 16px', minHeight: 58 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>Reimbursed by the joint account</div>
                <div className="cap" style={{ color: adv ? 'var(--tintText)' : 'var(--warn)' }}>
                  {reimburseCaption(db, payer, adv)}
                </div>
              </div>
              <Switch on={adv} onChange={setAdv} label="Reimbursed by the joint account" />
            </div>
          ) : (
            <div className="card r12" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 58, color: 'var(--sec)', fontSize: 15 }}>
              <Icon name="card" size={20} />
              Paid from the joint account.
            </div>
          )}
          {existing && <ExpenseHistory db={db} rec={existing} />}
        </div>
      </div>

      <div className="pad">
        {KEYS.map((k) => (
          <button
            key={k}
            className={'key' + (k === 'del' || k === '.' ? ' alt' : '')}
            type="button"
            aria-label={k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}
            onClick={() => press(k)}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Every version of an expense, newest first: who changed what, and when. */
function ExpenseHistory({ db, rec }: { db: Db; rec: Rec<Expense> }) {
  const versions = [...(rec.data.history ?? []), expenseVersion(rec)];
  if (versions.length < 2) return null;
  const who = (id: string) => member(db, id)?.name ?? 'someone';
  return (
    <section aria-label="History of this expense">
      <h2 className="sh" style={{ padding: '6px 16px 7px' }}>
        History
      </h2>
      <div className="card r12 lst in16">
        {versions
          .map((v, i) => (
            <div key={v.at + ':' + i} style={{ padding: '10px 16px', fontSize: 15 }}>
              <div className="cap">
                {dateTime(v.at)} · {who(v.by)}
              </div>
              {i === 0 ? 'Was: ' + money(v.amount) + ' · ' + v.label + ' · ' + monthShort(v.month) : expenseDiff(db, versions[i - 1], v)}
            </div>
          ))
          .reverse()}
      </div>
    </section>
  );
}

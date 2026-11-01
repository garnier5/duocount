import { useEffect, useRef, useState } from 'react';
import { useDb, type Db } from '../data/store';
import { deleteExpense } from '../domain/actions';
import { canEnterExpenses, isBetweenMembers, isClosed } from '../domain/calc';
import { PlanFirst } from './PlanFirst';
import { NEUTRAL } from '../domain/defaults';
import { category, expensesOf, member, members, type ExpenseView } from '../domain/select';
import { dateKey, monthShort, plural, shortDay } from '../lib/dates';
import { money } from '../lib/money';
import { navigate } from '../lib/router';
import { Icon } from '../ui/icons';
import { ActionSheet, BackLink, Fab, Seg, Tile } from '../ui/kit';
import { openOverlay, toast } from '../ui/overlays';
import { useMonth } from '../ui/useMonth';

export function expenseCaption(db: Db, e: ExpenseView): string {
  const cat = category(db, e.categoryId)?.name ?? 'Deleted category';
  if (e.kind === 'total') return cat + ' · entered as a category total';
  const who = e.payer === 'joint' ? 'Joint account' : member(db, e.payer)?.name ?? 'Former member';
  let payer = who;
  if (e.payer !== 'joint') payer = e.advance ? who + ', reimbursed by the account' : 'paid by ' + who + ' for ' + otherName(db, e.payer);
  return cat + ' · ' + payer + (e.recurring ? ' · recurring' : '');
}

export function otherName(db: Db, memberId: string): string {
  return members(db).find((m) => m.id !== memberId)?.name ?? 'the other member';
}

/** Explains what the "Reimbursed by the joint account" switch means for this payer. */
export function reimburseCaption(db: Db, payerId: string, reimbursed: boolean): string {
  const who = member(db, payerId)?.name ?? '';
  return reimbursed ? 'Counts for the household: ' + who + "'s next transfer goes down by this amount" : otherName(db, payerId) + ' owes the full amount to ' + who;
}

export function Expenses() {
  const db = useDb();
  const { month } = useMonth(db);
  const [filter, setFilter] = useState<'all' | 'adv'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ExpenseView | null>(null);
  const all = expensesOf(db, month);
  const list = filter === 'adv' ? all.filter((e) => e.payer !== 'joint') : all;
  const closed = isClosed(db, month);
  const total = all.filter((e) => !isBetweenMembers(e)).reduce((a, e) => a + e.amount, 0);

  useEffect(() => setOpen(null), [month, filter]);

  const edit = (e: ExpenseView) => {
    setOpen(null);
    openOverlay({ expense: { id: e.id, month } });
  };

  const doDelete = (e: ExpenseView) => {
    const undo = deleteExpense(e.id);
    setConfirm(null);
    setOpen(null);
    toast('Expense deleted', { label: 'Undo', run: undo });
  };

  const closedDoc = closed ? db.records.get('month:' + month) : undefined;
  const closedAt = closedDoc ? (closedDoc.data as { closedAt: number }).closedAt : null;

  return (
    <>
      <main className="page" style={{ gap: 14 }}>
        <header className="phead">
          <div className="phead-row" style={{ marginLeft: -8 }}>
            <BackLink to="/overview" label={monthShort(month)} />
            <a href="#/export" className="chip tint">
              <Icon name="excel" size={18} />
              Excel
            </a>
          </div>
          <h1 className="ptitle">{monthShort(month)} expenses</h1>
        </header>

        {all.length === 0 && !canEnterExpenses(db, month) ? (
          <PlanFirst db={db} month={month} />
        ) : all.length === 0 ? (
          <section className="card empty">
            <div className="empty-ico" aria-hidden="true">
              <Icon name="receipt" size={30} stroke={1.7} />
            </div>
            <h2>No expenses in {monthShort(month)} yet</h2>
            <p>Enter them all at once at the end of the month, or add one now if you don't want to forget it.</p>
            <button className="btn pri s50" type="button" style={{ marginTop: 6 }} onClick={() => navigate('/month/entry')}>
              Enter the whole month
            </button>
            <button className="btn sec s50" type="button" onClick={() => openOverlay({ expense: { month } })}>
              Add one expense
            </button>
          </section>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '2px 4px 0', gap: 8 }}>
              <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>
                {money(total)}
              </span>
              <span className="cap" style={{ fontSize: 15 }}>
                {plural(all.length, 'expense')} · {closedAt ? 'closed ' + shortDay(dateKey(new Date(closedAt))) : filter === 'adv' ? 'paid by a member' : 'latest first'}
              </span>
            </div>
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
            <p className="cap" style={{ margin: '-2px 4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="swipe" size={15} />
              Swipe left (or tap) an expense to edit or delete it.
            </p>
            {list.length === 0 && (
              <p className="cap" style={{ margin: '8px 4px', fontSize: 15, textAlign: 'center' }}>
                Nothing paid with a member's own money this month.
              </p>
            )}
            {list.length > 0 && (
              <div className="card lst">
                {list.map((e) => (
                  <SwipeRow
                    key={e.id}
                    db={db}
                    e={e}
                    open={open === e.id}
                    onOpen={(v) => setOpen(v ? e.id : null)}
                    onEdit={() => edit(e)}
                    onDelete={() => setConfirm(e)}
                  />
                ))}
              </div>
            )}
            {closed && (
              <p className="cap" style={{ margin: '0 4px' }}>
                {monthShort(month)} is closed. You can still correct an expense: the change goes to the household at the next sync.
              </p>
            )}
          </>
        )}
      </main>
      {canEnterExpenses(db, month) && <Fab month={month} />}
      {confirm && (
        <ActionSheet
          title={'Delete “' + confirm.label + '”?'}
          detail={money(confirm.amount) + ' · ' + (category(db, confirm.categoryId)?.name ?? '') + (confirm.advance ? ' · advance' : '') + '. The deletion will reach the household at the next sync.'}
          actions={[{ label: 'Delete expense', danger: true, onClick: () => doDelete(confirm) }]}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

const ACTIONS_WIDTH = 160;

export function SwipeRow({
  db,
  e,
  open,
  onOpen,
  onEdit,
  onDelete
}: {
  db: Db;
  e: ExpenseView;
  open: boolean;
  onOpen: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = category(db, e.categoryId);
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; locked: 'x' | 'y' | null } | null>(null);
  const moved = useRef(false);
  const offset = dx ?? (open ? -ACTIONS_WIDTH : 0);

  return (
    <div className="wrap">
      <div className="acts" aria-hidden={!open}>
        <button className="sa" type="button" style={{ background: NEUTRAL }} tabIndex={open ? 0 : -1} onClick={onEdit}>
          <Icon name="pencil" size={18} />
          Edit
        </button>
        <button className="sa" type="button" style={{ background: 'var(--bad)' }} tabIndex={open ? 0 : -1} onClick={onDelete}>
          <Icon name="trash" size={18} />
          Delete
        </button>
      </div>
      <button
        className={'erow' + (dx != null ? ' dragging' : '')}
        type="button"
        aria-expanded={open}
        style={{ transform: offset ? 'translateX(' + offset + 'px)' : 'none' }}
        onPointerDown={(ev) => {
          if (ev.pointerType === 'mouse') return;
          start.current = { x: ev.clientX, y: ev.clientY, base: open ? -ACTIONS_WIDTH : 0, locked: null };
          moved.current = false;
        }}
        onPointerMove={(ev) => {
          const s = start.current;
          if (!s) return;
          const mx = ev.clientX - s.x;
          const my = ev.clientY - s.y;
          if (!s.locked) {
            if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
            s.locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
            if (s.locked === 'x') (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
          }
          if (s.locked !== 'x') return;
          moved.current = true;
          setDx(Math.max(-ACTIONS_WIDTH - 40, Math.min(0, s.base + mx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          if (dx != null) {
            onOpen(dx < -ACTIONS_WIDTH / 2);
            setDx(null);
          }
          if (s && s.locked === 'y') moved.current = true;
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(null);
        }}
        onClick={() => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          onOpen(!open);
        }}
      >
        <Tile icon={cat?.icon ?? 'receipt'} color={cat?.color ?? NEUTRAL} iconSize={19} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.label || cat?.name}
            {e.payer !== 'joint' && <span className="adv">{e.advance ? 'Advance' : 'Owed by ' + otherName(db, e.payer)}</span>}
          </span>
          <span className="cap" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {expenseCaption(db, e)}
          </span>
        </span>
        <span className="num" style={{ fontWeight: 600 }}>
          {money(e.amount)}
        </span>
      </button>
    </div>
  );
}

import { useState } from 'react';
import { useDb } from '../../data/store';
import { deleteCategory } from '../../domain/actions';
import { forecastView, maxMonth } from '../../domain/calc';
import { categories, category, expenses } from '../../domain/select';
import { monthShort, plural } from '../../lib/dates';
import { money } from '../../lib/money';
import { Icon } from '../../ui/icons';
import { Alert, Sheet, SheetNav, Tile } from '../../ui/kit';
import { closeOverlay, toast } from '../../ui/overlays';

export function DeleteCategorySheet({ id }: { id: string }) {
  const db = useDb();
  const cat = category(db, id);
  const [target, setTarget] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const close = () => closeOverlay('deleteCategory');
  if (!cat) return null;

  const month = db.local.selectedMonth ?? maxMonth(db);
  const list = expenses(db).filter((e) => e.categoryId === id);
  const thisMonth = list.filter((e) => e.month === month);
  // The forecast still being prepared, if any.
  const planMonth = maxMonth(db);
  const fc = forecastView(db, planMonth);
  const planned = !fc.confirmedAt ? fc.lines.find((l) => l.cat.id === id)?.amount ?? 0 : 0;
  const others = categories(db).filter((c) => c.id !== id);
  const shown = all ? others : others.slice(0, 4);
  const targetName = others.find((c) => c.id === target)?.name ?? '';

  const move = () => {
    if (!target) return;
    deleteCategory(id, target);
    toast(cat.name + ' deleted', undefined, { low: true });
    close();
  };
  const remove = () => {
    deleteCategory(id, null);
    toast(cat.name + ' deleted', undefined, { low: true });
    close();
  };

  let summary = list.length ? plural(thisMonth.length, 'expense') + ' · ' + money(thisMonth.reduce((a, e) => a + e.amount, 0)) + ' this month' : 'No expenses';
  if (list.length > thisMonth.length) summary += ', ' + plural(list.length - thisMonth.length, 'other') + ' in earlier months';
  if (planned) summary += ', and ' + money(planned) + ' planned in the ' + monthShort(planMonth) + ' forecast';

  return (
    <Sheet onClose={close} labelledBy="dcT">
      <SheetNav
        id="dcT"
        title="Delete category"
        left={
          <button className="navbtn" type="button" onClick={close}>
            Cancel
          </button>
        }
      />
      <div className="sheet-body" style={{ gap: 18, paddingTop: 10 }}>
        <div className="card r12" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px' }}>
          <Tile icon={cat.icon} color={cat.color} size={48} iconSize={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{cat.name}</div>
            <div className="num" style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--sec)' }}>
              {summary}.
            </div>
          </div>
        </div>

        {list.length > 0 || planned ? (
          <>
            <div>
              <h2 className="sh">Move them to</h2>
              <div className="card r12 lst" role="radiogroup" aria-label="Move expenses to">
                {shown.map((c) => (
                  <button key={c.id} className="row" type="button" role="radio" aria-checked={target === c.id} onClick={() => setTarget(c.id)}>
                    <Tile icon={c.icon} color={c.color} iconSize={19} />
                    <span className="grow">{c.name}</span>
                    <span className={'radio' + (target === c.id ? ' on' : '')} />
                  </button>
                ))}
                {!all && others.length > 4 && (
                  <button className="row link" type="button" onClick={() => setAll(true)}>
                    <span style={{ flex: 'none', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="more" size={20} />
                    </span>
                    <span className="grow">Show all categories</span>
                  </button>
                )}
              </div>
              <p className="cap foot">The planned amount moves too. Other members see the change at the next sync.</p>
            </div>
            <div className="spacer" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="btn pri" type="button" disabled={!target} onClick={move}>
                {target ? 'Move to ' + targetName + ' and delete' : 'Choose where to move them'}
              </button>
              {list.length > 0 && (
                <button className="btn danger" type="button" onClick={() => setConfirm(true)}>
                  Delete the category and its {plural(list.length, 'expense')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="spacer" />
            <button className="btn pri" type="button" style={{ background: 'var(--bad)', color: '#fff' }} onClick={remove}>
              Delete {cat.name}
            </button>
          </>
        )}
      </div>
      {confirm && (
        <Alert
          title={'Delete ' + plural(list.length, 'expense') + '?'}
          message={'They will be removed from every month, also on the other phones after the next sync.'}
          buttons={[
            { label: 'Cancel', style: 'cancel', onClick: () => setConfirm(false) },
            { label: 'Delete', style: 'danger', onClick: remove }
          ]}
        />
      )}
    </Sheet>
  );
}

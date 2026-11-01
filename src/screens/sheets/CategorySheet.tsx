import { useState } from 'react';
import { useDb } from '../../data/store';
import { saveCategory, type CategoryInput } from '../../domain/actions';
import { CATEGORY_COLORS } from '../../domain/defaults';
import { category, expenses } from '../../domain/select';
import { ordinal, plural } from '../../lib/dates';
import { currencySymbol, money } from '../../lib/money';
import { CATEGORY_ICONS, Icon } from '../../ui/icons';
import { AmountInput, Sheet, SheetNav, Switch } from '../../ui/kit';
import { closeOverlay, openOverlay, toast } from '../../ui/overlays';

export function CategorySheet({ id, onDraft }: { id?: string; onDraft?: (input: CategoryInput) => void }) {
  const db = useDb();
  const cur = id ? category(db, id) : undefined;
  const [name, setName] = useState(cur?.name ?? '');
  const [icon, setIcon] = useState(cur?.icon ?? 'gift');
  const [color, setColor] = useState(cur?.color ?? '#0E7C9E');
  const [planned, setPlanned] = useState<number | null>(cur?.planned ?? null);
  const [recurring, setRecurring] = useState(!!cur?.recurringDay);
  const [day, setDay] = useState(cur?.recurringDay ?? 1);
  const close = () => closeOverlay('category');
  const has = name.trim().length > 0;
  const count = id ? expenses(db).filter((e) => e.categoryId === id).length : 0;

  const submit = () => {
    if (!has) return;
    const input: CategoryInput = { name, icon, color, planned, recurringDay: recurring && planned ? day : null };
    if (onDraft) onDraft(input);
    else {
      saveCategory(id ?? null, input);
      toast(id ? 'Category updated' : 'Category added', undefined, { low: true });
    }
    close();
  };

  return (
    <Sheet onClose={close} labelledBy="catT">
      <SheetNav
        id="catT"
        title={id ? 'Edit category' : 'New category'}
        left={
          <button className="navbtn" type="button" onClick={close}>
            Cancel
          </button>
        }
        right={
          <button className="navbtn strong" type="button" disabled={!has} onClick={submit}>
            {id ? 'Save' : 'Add'}
          </button>
        }
      />
      <div className="sheet-body">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 0' }} aria-live="polite">
          <span style={{ width: 72, height: 72, borderRadius: 20, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={36} />
          </span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{has ? name : 'New category'}</span>
          {id && <span className="cap">{count ? plural(count, 'expense') : 'No expenses yet'}</span>}
        </div>

        <div>
          <label className="sh" htmlFor="catName" style={{ display: 'block' }}>
            Name
          </label>
          <input id="catName" className="field" style={{ height: 48, borderRadius: 12 }} type="text" value={name} placeholder="E.g. Gifts" autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <h2 className="sh">Icon</h2>
          <div className="igrid" role="radiogroup" aria-label="Icon">
            {CATEGORY_ICONS.map((ic) => (
              <button key={ic.id} className={'ib' + (ic.id === icon ? ' on' : '')} type="button" role="radio" aria-checked={ic.id === icon} aria-label={ic.label} onClick={() => setIcon(ic.id)}>
                <Icon name={ic.id} size={24} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="sh">Color</h2>
          <div className="igrid" role="radiogroup" aria-label="Color" style={{ gap: 2, padding: '6px 10px' }}>
            {CATEGORY_COLORS.map(([hex, n]) => (
              <button key={hex} className="cb" type="button" role="radio" aria-checked={hex === color} aria-label={n} onClick={() => setColor(hex)}>
                <span style={{ background: hex, boxShadow: hex === color ? '0 0 0 3px var(--card), 0 0 0 5px ' + hex : 'none' }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="sh" htmlFor="budget" style={{ display: 'block' }}>
            Planned per month (optional)
          </label>
          <AmountInput
            className="field"
            label="Planned per month"
            placeholder={currencySymbol() + '0'}
            value={planned}
            format={(c) => money(c, { compact: true })}
            onCommit={(v) => setPlanned(v && v > 0 ? v : null)}
            style={{ height: 48, borderRadius: 12 }}
          />
          <p className="cap foot">Used to pre-fill the next forecasts. Leave empty to plan it month by month.</p>
        </div>

        <div>
          <h2 className="sh">Fixed expense</h2>
          <div className="card r12">
            <div className="frow" style={{ minHeight: 56 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>Same amount every month</span>
                <span className="cap">Rent, insurance, phone plan…</span>
              </span>
              <Switch on={recurring} onChange={setRecurring} label="Recurring expense" />
            </div>
            {recurring && (
              <div className="frow" style={{ minHeight: 52 }}>
                <span style={{ flex: 1 }}>Paid on the</span>
                <select
                  aria-label="Day of the month"
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  style={{ border: 0, background: 'var(--fill)', borderRadius: 8, minHeight: 34, padding: '0 10px', fontSize: 15, color: 'var(--label)' }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {ordinal(d)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {recurring && (
            <p className="cap foot" style={{ color: planned ? undefined : 'var(--warn)' }}>
              {planned ? 'The month-end review reminds you if it is missing.' : 'Set the planned amount above: it is the fixed amount.'}
            </p>
          )}
        </div>

        {id && (
          <div className="card">
            <button
              className="row danger"
              type="button"
              onClick={() => {
                close();
                openOverlay({ deleteCategory: id });
              }}
            >
              Delete this category
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

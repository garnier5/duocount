import { useState } from 'react';
import { setLocal, useDb } from '../../data/store';
import { budgetOf, clampMonth, maxMonth, monthInfo, monthStats, startMonth } from '../../domain/calc';
import { monthDoc } from '../../domain/select';
import { addMonths, dateKey, MONTH_NAMES, monthName, monthShort, plural, shortDay, type MonthKey } from '../../lib/dates';
import { money } from '../../lib/money';
import { Icon } from '../../ui/icons';
import { Sheet, SheetNav } from '../../ui/kit';
import { closeOverlay } from '../../ui/overlays';

export function MonthPicker() {
  const db = useDb();
  const min = startMonth(db);
  const max = maxMonth(db);
  const [sel, setSel] = useState<MonthKey>(clampMonth(db, db.local.selectedMonth));
  const [year, setYear] = useState(Number(sel.slice(0, 4)));
  const close = () => closeOverlay('monthPicker');
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(addMonths(max, 1).slice(0, 4));

  const detailOf = (m: MonthKey): { stat: string; color: string; dot: string; detail: string; selectable: boolean; future: boolean } => {
    if (m < min) return { stat: '—', color: 'var(--ter)', dot: 'var(--fill)', detail: 'Before your household started using DuoCount', selectable: false, future: false };
    if (m > max) {
      const prev = addMonths(m, -1);
      return {
        stat: 'Not started',
        color: 'var(--sec)',
        dot: 'var(--ter)',
        detail: m === addMonths(max, 1) ? 'Opens once ' + monthShort(prev) + ' is closed' : 'Not open yet',
        selectable: false,
        future: true
      };
    }
    const info = monthInfo(db, m);
    const stats = monthStats(db, m);
    const budget = budgetOf(db, m);
    if (info.phase === 'closed') {
      const closedAt = monthDoc(db, m).closedAt;
      return {
        stat: 'Closed',
        color: 'var(--good)',
        dot: 'var(--good)',
        detail:
          plural(stats.count, 'expense') +
          ' · ' +
          money(stats.total) +
          (budget != null ? ' of ' + money(budget, { compact: true }) : '') +
          (closedAt ? ' · closed ' + shortDay(dateKey(new Date(closedAt))) : ''),
        selectable: true,
        future: false
      };
    }
    if (info.phase === 'future') return { stat: 'Not started', color: 'var(--sec)', dot: 'var(--ter)', detail: info.stat, selectable: true, future: true };
    return {
      stat: 'In progress',
      color: 'var(--warn)',
      dot: 'var(--warn)',
      detail: (stats.count ? plural(stats.count, 'expense') + ' · ' + money(stats.total) : 'Nothing entered yet') + (budget != null ? ' · budget ' + money(budget, { compact: true }) : ''),
      selectable: true,
      future: false
    };
  };

  const cur = detailOf(sel);
  return (
    <Sheet onClose={close} labelledBy="mpT">
      <SheetNav
        id="mpT"
        title="Choose a month"
        left={
          <button className="navbtn" type="button" onClick={close}>
            Cancel
          </button>
        }
        right={
          <button
            className="navbtn strong"
            type="button"
            disabled={!cur.selectable}
            onClick={() => {
              setLocal({ selectedMonth: sel });
              close();
            }}
          >
            Done
          </button>
        }
      />
      <div className="sheet-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button className="ynav" type="button" aria-label={String(year - 1)} disabled={year <= minYear} onClick={() => setYear(year - 1)}>
            <Icon name="back" size={22} stroke={2.4} />
          </button>
          <span style={{ fontSize: 22, fontWeight: 700, minWidth: 70, textAlign: 'center' }}>{year}</span>
          <button className="ynav" type="button" aria-label={String(year + 1)} disabled={year >= maxYear} onClick={() => setYear(year + 1)}>
            <Icon name="chevron" size={22} stroke={2.4} />
          </button>
        </div>
        <div className="mgrid" role="radiogroup" aria-label={'Months of ' + year}>
          {MONTH_NAMES.map((n, i) => {
            const m = year + '-' + String(i + 1).padStart(2, '0');
            const x = detailOf(m);
            const on = m === sel;
            return (
              <button
                key={m}
                className={'cell' + (on ? ' on' : x.future ? ' future' : '')}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={monthName(m) + ', ' + x.stat}
                disabled={m < min}
                onClick={() => setSel(m)}
              >
                <span style={{ fontSize: 17, fontWeight: 600 }}>{n.slice(0, 3)}</span>
                <span className="cst" style={{ color: x.color }}>
                  <span className="dot" style={{ background: on ? 'var(--onTint)' : x.dot }} />
                  {x.stat}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', padding: '0 4px' }}>
          <span className="leg s">
            <span className="dot" style={{ background: 'var(--good)' }} />
            Closed
          </span>
          <span className="leg s">
            <span className="dot" style={{ background: 'var(--warn)' }} />
            In progress
          </span>
          <span className="leg s">
            <span className="dot" style={{ background: 'var(--ter)' }} />
            Not started
          </span>
        </div>
        <div className="card" style={{ padding: '14px 16px' }} aria-live="polite">
          <div style={{ fontWeight: 600 }}>{monthName(sel)}</div>
          <div className="cap" style={{ fontSize: 15, marginTop: 2 }}>
            {cur.detail}
          </div>
        </div>
        <p className="cap" style={{ margin: '0 4px' }}>
          The month you pick also applies to its expenses and its plan.
        </p>
      </div>
    </Sheet>
  );
}

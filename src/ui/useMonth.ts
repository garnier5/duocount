import { setLocal, type Db } from '../data/store';
import { addMonths, type MonthKey } from '../lib/dates';
import { clampMonth, maxMonth, monthInfo, startMonth, toneColor } from '../domain/calc';

/** The month shown on the month page and the screens pushed from it (one shared selection). */
export function useMonth(db: Db, opts: { allowNextUnopened?: boolean } = {}) {
  const min = startMonth(db);
  const max = opts.allowNextUnopened ? addMonths(maxMonth(db), 1) : maxMonth(db);
  const sel = db.local.selectedMonth;
  const month: MonthKey = sel && sel <= max && sel >= min ? sel : clampMonth(db, sel);
  const info = monthInfo(db, month);
  return {
    month,
    info,
    stat: info.stat,
    statColor: toneColor(info.tone),
    canPrev: month > min,
    canNext: month < max,
    move: (delta: number) => {
      const next = addMonths(month, delta);
      if (next >= min && next <= max) setLocal({ selectedMonth: next });
    },
    setMonth: (m: MonthKey) => setLocal({ selectedMonth: m })
  };
}

import { useState } from 'react';
import { useDb } from '../data/store';
import { buildWorkbook, countExpenses, exportFileName, SHEETS, type SheetId } from '../export/excel';
import { category, expenses, member, monthsWithData } from '../domain/select';
import { monthAbbr, monthShort, plural, type MonthKey } from '../lib/dates';
import { groupedAmount } from '../lib/money';
import { shareFile } from '../lib/share';
import { Icon } from '../ui/icons';
import { BackLink, NavBar, Note, Seg, Switch } from '../ui/kit';
import { useMonth } from '../ui/useMonth';

type Period = 'month' | 'choose' | 'all';

export function ExportExcel() {
  const db = useDb();
  const { month } = useMonth(db);
  const available = monthsWithData(db).length ? monthsWithData(db) : [month];
  const [period, setPeriod] = useState<Period>('month');
  const [picked, setPicked] = useState<Set<MonthKey>>(new Set([month]));
  const [sheets, setSheets] = useState<Set<SheetId>>(new Set(SHEETS.map((s) => s.id)));
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'downloaded'>('idle');

  const months = period === 'month' ? [month] : period === 'all' ? available : available.filter((m) => picked.has(m));
  const count = countExpenses(db, months);
  const fileName = exportFileName(db, months, period === 'all');
  const nSheets = sheets.size;
  const noMonths = period === 'choose' && months.length === 0;
  const ok = nSheets > 0 && !noMonths;
  const sel = new Set(months);
  const manyYears = new Set(available.map((m) => m.slice(0, 4))).size > 1;
  const preview = expenses(db)
    .filter((e) => sel.has(e.month))
    .slice()
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.at - b.at))
    .slice(0, 4);

  const run = async () => {
    setState('busy');
    try {
      const bytes = buildWorkbook(
        db,
        months,
        SHEETS.filter((s) => sheets.has(s.id)).map((s) => s.id)
      );
      const file = new File([bytes as Uint8Array<ArrayBuffer>], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const res = await shareFile(file, fileName);
      setState(res === 'cancelled' ? 'idle' : res === 'downloaded' ? 'downloaded' : 'done');
    } catch {
      setState('idle');
    }
  };

  const toggle = <T,>(s: Set<T>, v: T) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  return (
    <div className="sub">
      <NavBar left={<BackLink to="/overview" label="Back" />} title="Export to Excel" />
      <div className="sub-body" style={{ gap: 20, paddingTop: 12 }}>
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px' }} aria-live="polite">
          <span style={{ flex: 'none', width: 44, height: 52, borderRadius: 8, background: '#1E7F45', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sheet" size={24} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{fileName}</span>
            <span className="cap">
              {plural(nSheets, 'sheet')} · {plural(count, 'expense')} · opens in Excel, Numbers or Google Sheets
            </span>
          </span>
        </div>

        <div>
          <h2 className="sh">Period</h2>
          <Seg<Period>
            label="Period"
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setState('idle');
            }}
            items={[
              { id: 'month', label: monthShort(month) },
              { id: 'choose', label: 'Choose months' },
              { id: 'all', label: 'Everything' }
            ]}
          />
          {period === 'choose' && (
            <div className="mchips" role="group" aria-label="Months">
              {available.map((m) => (
                <button
                  key={m}
                  className={'mchip' + (picked.has(m) ? ' on' : '')}
                  type="button"
                  aria-pressed={picked.has(m)}
                  onClick={() => {
                    setPicked(toggle(picked, m));
                    setState('idle');
                  }}
                >
                  {manyYears ? monthAbbr(m) + ' ' + m.slice(0, 4) : monthShort(m)}
                </button>
              ))}
            </div>
          )}
          <p className="cap foot">Works at any time: a month still being entered is exported as it stands.</p>
        </div>

        <div>
          <h2 className="sh">Sheets in the file</h2>
          <div className="card lst in16">
            {SHEETS.map((s) => (
              <div key={s.id} className="row" style={{ minHeight: 56, padding: '6px 12px 6px 16px' }}>
                <span className="grow">
                  <span className="t">{s.title}</span>
                  <span className="cap">{s.caption}</span>
                </span>
                <Switch
                  on={sheets.has(s.id)}
                  label={s.title + ' sheet'}
                  onChange={() => {
                    setSheets(toggle(sheets, s.id));
                    setState('idle');
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {sheets.has('exp') && (
          <div>
            <h2 className="sh">Preview · Expenses</h2>
            <div className="card" style={{ background: 'var(--grid)' }} aria-label="Preview of the Expenses sheet">
              <div className="xl" role="table">
                <span className="h">Month</span>
                <span className="h">Label</span>
                <span className="h">Category</span>
                <span className="h r">Amount</span>
                {preview.map((e) => (
                  <PreviewRow key={e.id} month={monthAbbr(e.month)} label={e.label + (e.advance ? ' (' + (member(db, e.payer)?.name ?? '') + ')' : '')} cat={category(db, e.categoryId)?.name ?? ''} amount={groupedAmount(e.amount)} />
                ))}
                {preview.length === 0 && (
                  <>
                    <span>—</span>
                    <span style={{ color: 'var(--sec)' }}>No expenses</span>
                    <span />
                    <span />
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, padding: '6px 6px 0', overflow: 'hidden' }}>
                {SHEETS.filter((s) => sheets.has(s.id)).map((s, i) => (
                  <span key={s.id} className="tabx" style={{ background: i === 0 ? 'var(--card)' : 'transparent', color: i === 0 ? 'var(--good)' : 'var(--sec)', fontWeight: i === 0 ? 700 : 400 }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <Note tone="warn" icon="warning">
          Unlike sync files, the Excel file is <strong>not encrypted</strong>. Anyone who receives it can read it.
        </Note>

        <div className="spacer" />

        {(state === 'done' || state === 'downloaded') && (
          <div role="status" className="note good" style={{ alignItems: 'center' }}>
            <Icon name="checkCircle" size={22} />
            <span>{state === 'done' ? 'File ready. Save it to Files or send it from the share sheet.' : 'File downloaded.'}</span>
          </div>
        )}
        <button className="btn pri" type="button" disabled={!ok || state === 'busy'} onClick={run}>
          {ok && <Icon name="share" size={20} />}
          {!ok ? (noMonths ? 'Choose at least one month' : 'Turn on at least one sheet') : state === 'busy' ? 'Preparing…' : 'Export .xlsx'}
        </button>
      </div>
    </div>
  );
}

function PreviewRow({ month, label, cat, amount }: { month: string; label: string; cat: string; amount: string }) {
  return (
    <>
      <span>{month}</span>
      <span>{label}</span>
      <span>{cat}</span>
      <span className="r">{amount}</span>
    </>
  );
}

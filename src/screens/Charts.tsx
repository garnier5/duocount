import { useEffect, useState } from 'react';
import { useDb } from '../data/store';
import { axisTop, breakdown, chartMonths, monthPoint, type ChartRange, type Slice } from '../domain/charts';
import { monthName, monthShort, type MonthKey } from '../lib/dates';
import { currencySymbol, money, percent } from '../lib/money';
import { Icon } from '../ui/icons';
import { BackLink, Seg } from '../ui/kit';
import { useMonth } from '../ui/useMonth';

type PieMode = 'planned' | 'paid';

export function Charts() {
  const db = useDb();
  const { month } = useMonth(db);
  const [range, setRange] = useState<ChartRange>('six');
  const [picked, setPicked] = useState<MonthKey>(month);
  const [pie, setPie] = useState<PieMode>('paid');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const six = chartMonths(db, 'six');
  const year = chartMonths(db, 'year');
  const sameRange = six.length === year.length;
  const months = range === 'six' || sameRange ? six : year;
  const points = months.map((m) => monthPoint(db, m));
  // Stay on a month that is shown; otherwise the latest month with expenses.
  const sel = months.includes(picked) ? picked : ([...points].reverse().find((p) => p.paid != null)?.month ?? months[months.length - 1]);
  const point = points.find((p) => p.month === sel) ?? monthPoint(db, sel);
  const { top, step } = axisTop(Math.max(0, ...points.map((p) => Math.max(p.planned ?? 0, p.paid ?? 0))));
  const gap = point.paid != null && point.planned != null ? point.paid - point.planned : null;

  return (
    <main className="page" style={{ gap: 0 }}>
      <header className="phead" style={{ gap: 4, marginBottom: 16 }}>
        <div className="phead-row" style={{ marginLeft: -8 }}>
          <BackLink to="/overview" label={monthShort(month)} />
        </div>
        <h1 className="ptitle">Charts</h1>
        <p className="cap" style={{ margin: '0 4px', fontSize: 15 }}>
          Tap a month in the first chart to see its breakdown in the second.
        </p>
      </header>

      <section className="card chart" aria-labelledby="c1">
        <h2 className="h2" id="c1">
          Planned vs paid <span className="shc">per month</span>
        </h2>
        {!sameRange && (
          <Seg<ChartRange>
            small
            label="Period"
            value={range}
            onChange={setRange}
            items={[
              { id: 'six', label: 'Last 6 months' },
              { id: 'year', label: 'Since January' }
            ]}
          />
        )}
        <div className="plot">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="gl" style={{ bottom: (k / 3) * 100 + '%' }}>
              <span>{axisLabel(k * step)}</span>
            </div>
          ))}
          <div className="groups" role="radiogroup" aria-label="Choose a month">
            {points.map((p) => {
              const on = p.month === sel;
              return (
                <button
                  key={p.month}
                  className={'grp' + (on ? ' sel' : '')}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={
                    monthName(p.month) +
                    ': ' +
                    (p.planned == null ? 'no plan' : 'planned ' + money(p.planned)) +
                    (p.paid == null ? ', not entered yet' : ', paid ' + money(p.paid))
                  }
                  onClick={() => setPicked(p.month)}
                >
                  <span className="bar" style={{ height: pctOf(p.planned, top), background: on ? 'var(--plan)' : 'var(--g1)' }} />
                  <span className="bar" style={{ height: pctOf(p.paid, top), background: on ? 'var(--paid)' : 'var(--g2)' }} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="xaxis" aria-hidden="true">
          {points.map((p) => (
            <span key={p.month} style={{ fontWeight: p.month === sel ? 700 : 400, color: p.month === sel ? 'var(--label)' : 'var(--sec)' }}>
              {monthShort(p.month).charAt(0)}
            </span>
          ))}
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--plan)' }} />
            Planned (left)
          </span>
          <span>
            <i style={{ background: 'var(--paid)' }} />
            Paid (right)
          </span>
          <span>
            <i style={{ background: 'var(--g2)' }} />
            Other months
          </span>
        </div>
        <div aria-live="polite" style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--sep)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong>{monthName(sel)}</strong>
            <GapChip gap={gap} planned={point.planned} paid={point.paid} />
          </div>
          <div className="cap num" style={{ fontSize: 15, marginTop: 2 }}>
            {point.planned == null ? 'No plan' : 'Planned ' + money(point.planned)} ·{' '}
            {point.paid == null ? 'paid: expenses not entered yet' : 'paid ' + money(point.paid)}
          </div>
        </div>
      </section>

      <div className="chart-link" aria-hidden="true">
        <Icon name="arrowDown" size={16} />
        {monthShort(sel)}’s breakdown below
      </div>

      <Breakdown key={sel} month={sel} mode={pie} onMode={setPie} />
    </main>
  );
}

function Breakdown({ month, mode, onMode }: { month: MonthKey; mode: PieMode; onMode: (m: PieMode) => void }) {
  const db = useDb();
  const slices = breakdown(db, month);
  const plannedTotal = slices.reduce((a, s) => a + s.planned, 0);
  const paidTotal = slices.reduce((a, s) => a + s.paid, 0);
  const paidOk = paidTotal > 0;
  const planOk = plannedTotal > 0;
  const shown: PieMode = mode === 'paid' ? (paidOk ? 'paid' : 'planned') : planOk ? 'planned' : 'paid';
  const val = (s: Slice) => (shown === 'paid' ? s.paid : s.planned);
  const total = shown === 'paid' ? paidTotal : plannedTotal;
  const pct = (v: number) => percent(v, total);

  return (
    <section className="card chart" aria-labelledby="c2">
      <h2 className="h2" id="c2">
        Where the money goes <span className="chipd">{monthName(month)}</span>
      </h2>
      {!planOk && !paidOk ? (
        <p className="cap" style={{ fontSize: 15, margin: '4px 2px 0' }}>
          Nothing planned or entered for {monthShort(month)} yet.
        </p>
      ) : (
        <>
          <Seg<PieMode>
            small
            label="Show planned or paid"
            value={shown}
            onChange={onMode}
            items={[
              { id: 'planned', label: 'Planned', disabled: !planOk },
              { id: 'paid', label: 'Paid', disabled: !paidOk }
            ]}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <div style={{ position: 'relative', width: 200, height: 200 }}>
              <Donut
                values={slices.map((s) => ({ v: val(s), color: s.color }))}
                label={(shown === 'paid' ? 'Paid' : 'Planned') + ' breakdown for ' + monthShort(month) + ': ' + slices.map((s) => s.name + ' ' + pct(val(s))).join(', ')}
              />
              <div className="donut-mid" aria-hidden="true">
                <span className="cap">{shown === 'paid' ? 'Paid' : 'Planned'}</span>
                <span className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                  {money(total)}
                </span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {slices.map((s) => (
              <div key={s.id} className="pl">
                <i style={{ background: s.color }} />
                <span className="nm">{s.name}</span>
                <span className="num" style={{ color: 'var(--sec)' }}>
                  {money(val(s))}
                </span>
                <span className="num" style={{ fontWeight: 600, textAlign: 'right' }}>
                  {pct(val(s))}
                </span>
              </div>
            ))}
          </div>
          <p className="cap" style={{ fontSize: 15, margin: '12px 2px 0', lineHeight: 1.4 }}>
            {pieNote(slices, shown, planOk, paidOk, month)}
          </p>
        </>
      )}
    </section>
  );
}

function pieNote(slices: Slice[], shown: PieMode, planOk: boolean, paidOk: boolean, month: MonthKey): string {
  if (!paidOk) return monthShort(month) + '’s expenses aren’t entered yet, so only the plan can be shown.';
  if (!planOk) return monthShort(month) + ' has no plan, so only what was paid can be shown.';
  if (shown === 'planned') return 'Switch to Paid to compare the real split with the plan.';
  const tp = slices.reduce((a, s) => a + s.planned, 0);
  const ta = slices.reduce((a, s) => a + s.paid, 0);
  let k = slices[0];
  for (const s of slices) if (Math.abs(s.paid / ta - s.planned / tp) > Math.abs(k.paid / ta - k.planned / tp)) k = s;
  const name = k.id === 'other' ? 'Other costs' : k.name;
  return 'Biggest shift: ' + name + ' is ' + percent(k.paid, ta) + ' of what you paid, against ' + percent(k.planned, tp) + ' of the plan.';
}

function GapChip({ gap, planned, paid }: { gap: number | null; planned: number | null; paid: number | null }) {
  let text = 'Not entered yet';
  let cls = '';
  if (paid != null && planned == null) text = 'No plan';
  else if (gap != null && gap > 0) {
    text = '▲ +' + money(gap);
    cls = ' over';
  } else if (gap != null && gap < 0) {
    text = '▼ ' + money(gap);
    cls = ' under';
  } else if (gap === 0) text = '= on plan';
  return <span className={'chipd num' + cls}>{text}</span>;
}

function Donut({ values, label }: { values: { v: number; color: string }[]; label: string }) {
  const total = values.reduce((a, x) => a + x.v, 0);
  let ang = -Math.PI / 2;
  return (
    <svg viewBox="0 0 180 180" width="200" height="200" role="img" aria-label={label}>
      {values.map((x, i) => {
        if (x.v <= 0) return null;
        const a0 = ang;
        // A full circle can't be drawn as one arc: stop just short of it.
        ang += Math.min((x.v / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
        return <path key={i} d={arc(a0, ang)} fill={x.color} stroke="var(--card)" strokeWidth="2" />;
      })}
    </svg>
  );
}

function arc(a0: number, a1: number): string {
  const R = 84;
  const r = 50;
  const pt = (rad: number, a: number) => (90 + rad * Math.cos(a)).toFixed(2) + ' ' + (90 + rad * Math.sin(a)).toFixed(2);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return 'M' + pt(R, a0) + 'A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + pt(R, a1) + 'L' + pt(r, a1) + 'A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + pt(r, a0) + 'Z';
}

function pctOf(v: number | null, top: number): string {
  return v == null ? '0%' : Math.min(100, (v / top) * 100) + '%';
}

/** "€0", "€500", "€1k", "€2.5k" */
function axisLabel(cents: number): string {
  const v = cents / 100;
  return currencySymbol() + (v >= 1000 ? +(v / 1000).toFixed(1) + 'k' : String(v));
}

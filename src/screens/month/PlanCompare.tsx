import type { CSSProperties } from 'react';
import { money, type Cents } from '../../lib/money';

/** How what's entered compares with the plan: bar width, where the plan tick sits, and the gap in words. */
export function compare(entered: Cents, plan: Cents) {
  // The bar runs to 125 % of the plan, so the plan tick sits at 80 % and an overspend still shows.
  const w = plan > 0 ? (Math.min(entered / plan, 1.25) / 1.25) * 100 : entered > 0 ? 100 : 0;
  let delta = 'Nothing entered yet';
  let color = 'var(--sec)';
  if (entered > 0 && plan === 0) {
    delta = 'Not planned';
    color = 'var(--overInk)';
  } else if (entered > plan) {
    delta = '▲ ' + money(entered - plan) + ' over plan';
    color = 'var(--overInk)';
  } else if (entered > 0 && plan - entered < 50) {
    delta = '= on plan';
  } else if (entered > 0) {
    delta = '▼ ' + money(plan - entered) + ' under plan';
    color = 'var(--underInk)';
  }
  return { w, mark: plan > 0, delta, color };
}

export function PlanPill({ plan, small, suffix }: { plan: Cents; small?: boolean; suffix?: boolean }) {
  return (
    <span className={'planpill num' + (small ? ' s' : '')}>
      {plan === 0 ? 'Nothing planned' : suffix ? money(plan, { whole: true }) + ' planned' : 'Planned ' + money(plan, { whole: true })}
    </span>
  );
}

export function PlanBar({ entered, plan, style }: { entered: Cents; plan: Cents; style?: CSSProperties }) {
  const c = compare(entered, plan);
  return (
    <div className="pbar" style={style} aria-hidden="true">
      <div className="f" style={{ width: c.w + '%' }} />
      {c.mark && <div className="m" />}
    </div>
  );
}

/** The selected category's plan, shown while an expense is being entered. */
export function PlanBox({ name, entered, plan }: { name: string; entered: Cents; plan: Cents }) {
  const c = compare(entered, plan);
  return (
    <div className="planbox" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name} this month</span>
        <PlanPill plan={plan} />
      </div>
      <PlanBar entered={entered} plan={plan} />
      <div className="num" style={{ fontSize: 14, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--sec)' }}>{money(entered)} entered so far</span>
        <span style={{ color: c.color, fontWeight: 600 }}>{c.delta}</span>
      </div>
    </div>
  );
}

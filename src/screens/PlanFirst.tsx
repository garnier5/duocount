import { setLocal, type Db } from '../data/store';
import { canPlan } from '../domain/calc';
import { addMonths, monthShort, type MonthKey } from '../lib/dates';
import { navigate } from '../lib/router';
import { Icon } from '../ui/icons';

/** What to do before a month's expenses can be entered: its plan must be confirmed first. */
export function planFirstStep(db: Db, month: MonthKey) {
  const prev = addMonths(month, -1);
  if (canPlan(db, month)) {
    return {
      title: 'Confirm the ' + monthShort(month) + ' plan first',
      body: "Expenses are entered once the plan is confirmed: it sets the month's budget and everyone's transfer.",
      cta: 'Adjust and confirm the plan',
      go: () => {
        setLocal({ selectedMonth: month });
        navigate('/forecast');
      }
    };
  }
  return {
    title: 'Close ' + monthShort(prev) + ' first',
    body: 'The ' + monthShort(month) + ' plan opens once ' + monthShort(prev) + ' is closed. Expenses come after the plan.',
    cta: 'Review and close ' + monthShort(prev),
    go: () => {
      setLocal({ selectedMonth: prev });
      navigate('/month/review');
    }
  };
}

/** `cta` is off where the plan section right above already offers the same step. */
export function PlanFirst({ db, month, cta = true }: { db: Db; month: MonthKey; cta?: boolean }) {
  const step = planFirstStep(db, month);
  return (
    <div className="dashed">
      <div
        style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--fill)', color: 'var(--sec)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-hidden="true"
      >
        <Icon name="lock" size={26} />
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      {cta && (
        <button className="btn pri" type="button" style={{ marginTop: 6 }} onClick={step.go}>
          {step.cta}
        </button>
      )}
    </div>
  );
}

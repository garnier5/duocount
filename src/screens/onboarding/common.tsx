import type { ReactNode } from 'react';
import { Icon } from '../../ui/icons';

export function StepTop({ step, back }: { step: number; back: string }) {
  return (
    <>
      <div className="onb-top">
        <a className="iconbtn" href={'#' + back} aria-label="Back">
          <Icon name="back" />
        </a>
        <span className="cap" style={{ fontWeight: 600 }}>
          Step {step} of 3
        </span>
        <span style={{ width: 44 }} />
      </div>
      <div className="onb-progress">
        <div style={{ width: Math.round((step / 3) * 100) + '%' }} />
      </div>
    </>
  );
}

export function StepTitle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: '0 4px' }}>
      <h1 className="h1">{title}</h1>
      <p className="lead">{children}</p>
    </div>
  );
}

export function SharesTotal({ parts }: { parts: { color: string; share: number }[] }) {
  const t = parts.reduce((a, p) => a + p.share, 0);
  const ok = t === 100;
  const scale = t > 100 ? 100 / t : 1;
  let msg = 'All set: the shares add up to 100%.';
  if (t < 100) msg = 100 - t + '% missing to reach 100%.';
  if (t > 100) msg = 'The total is ' + (t - 100) + '% over. Lower a share.';
  return (
    <section className={'card' + (ok ? '' : ' badline')} style={{ padding: 16 }} aria-label="Total of shares">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>Total</span>
        <span className={'num tot ' + (ok ? 'ok' : 'bad')} style={{ fontSize: 24, fontWeight: 700 }}>
          {t}%
        </span>
      </div>
      <div className="sharebar">
        {parts.map((p, i) => (
          <div key={i} style={{ width: p.share * scale + '%', background: p.color }} />
        ))}
      </div>
      <div className={'st ' + (ok ? 'ok' : 'bad')} role="status">
        <Icon name={ok ? 'checkCircle' : 'warning'} size={20} />
        <span>{msg}</span>
      </div>
    </section>
  );
}

export function ShareStepper({ name, value, onChange }: { name: string; value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  return (
    <div className="stepper">
      <button className="stp" type="button" aria-label={'Decrease ' + name + "'s share"} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        className="stp-in num"
        type="text"
        inputMode="numeric"
        aria-label={name + "'s share in percent"}
        value={value + '%'}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
          onChange(Number.isFinite(n) ? clamp(n) : 0);
        }}
      />
      <button className="stp" type="button" aria-label={'Increase ' + name + "'s share"} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}

export function Swatches({ colors, value, onPick, label }: { colors: [string, string][]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {colors.map(([c, name]) => (
        <button key={c} className="swb" type="button" role="radio" aria-checked={c === value} aria-label={name} onClick={() => onPick(c)}>
          <span style={{ background: c, boxShadow: c === value ? '0 0 0 3px var(--card), 0 0 0 5px ' + c : 'none' }} />
        </button>
      ))}
    </div>
  );
}

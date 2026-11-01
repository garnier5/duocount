import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { amountInput, parseAmount, type Cents } from '../lib/money';
import { monthName, type MonthKey } from '../lib/dates';
import { navigate } from '../lib/router';
import { Icon, type IconName } from './icons';
import { closeOverlay, openOverlay, useOverlays } from './overlays';

// ---------- Navigation ----------

export function NavBar({ left, title, right }: { left?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="navbar">
      <div>{left}</div>
      <span className="navbar-title">{title}</span>
      <div>{right}</div>
    </div>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <a className="navbtn" href={'#' + to}>
      <Icon name="back" size={22} stroke={2.4} />
      {label}
    </a>
  );
}

export interface MonthBarProps {
  month: MonthKey;
  stat: string;
  statColor: string;
  canPrev: boolean;
  canNext: boolean;
  onMove: (delta: number) => void;
  label?: string;
}

export function MonthBar({ month, stat, statColor, canPrev, canNext, onMove, label = 'Month' }: MonthBarProps) {
  return (
    <nav className="mbar" aria-label={label}>
      <button className="mnav" type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => onMove(-1)}>
        <Icon name="back" stroke={2.4} />
      </button>
      <button className="mpick" type="button" aria-label={'Choose a month. Current: ' + monthName(month) + ', ' + stat} onClick={() => openOverlay({ monthPicker: true })}>
        <span className="mname">
          {monthName(month)}
          <Icon name="chevronDown" size={15} stroke={2.6} style={{ color: 'var(--sec)' }} />
        </span>
        <span className="mstat" style={{ color: statColor }}>
          {stat}
        </span>
      </button>
      <button className="mnav" type="button" aria-label="Next month" disabled={!canNext} onClick={() => onMove(1)}>
        <Icon name="chevron" stroke={2.4} />
      </button>
    </nav>
  );
}

export function Fab({ month }: { month: MonthKey }) {
  return (
    <button className="fab" type="button" onClick={() => openOverlay({ addMenu: month })}>
      <Icon name="plus" size={22} stroke={2.6} />
      Add expenses
    </button>
  );
}

// ---------- Small pieces ----------

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: 30 | 34 | 36 }) {
  const cls = size === 30 ? 'avatar s30' : size === 34 ? 'avatar s34' : 'avatar';
  return (
    <span className={cls} style={{ background: color }} aria-hidden="true">
      {(name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

export function Tile({ icon, color, size = 34, iconSize }: { icon: IconName; color: string; size?: number; iconSize?: number }) {
  const style: CSSProperties = { background: color };
  if (size !== 34) Object.assign(style, { width: size, height: size, borderRadius: Math.round(size * 0.27) });
  return (
    <span className="tile" style={style} aria-hidden="true">
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.56)} />
    </span>
  );
}

export function Note({ tone, icon, children, style }: { tone?: 'tint' | 'warn' | 'good' | 'bad'; icon: IconName; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={'note' + (tone ? ' ' + tone : '')} style={style}>
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={'sw' + (on ? ' on' : '')} type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span className="k" />
    </button>
  );
}

export function Seg<T extends string>({
  items,
  value,
  onChange,
  label,
  small
}: {
  items: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  small?: boolean;
}) {
  return (
    <div className={'seg' + (small ? ' s36' : '')} role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} className={'sbtn' + (it.id === value ? ' on' : '')} type="button" role="radio" aria-checked={it.id === value} disabled={it.disabled} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Text field for an amount; parses and commits when the person leaves the field. */
export function AmountInput({
  value,
  onCommit,
  className = 'amt',
  placeholder,
  label,
  disabled,
  format = (c) => amountInput(c),
  style
}: {
  value: Cents | null;
  onCommit: (v: Cents | null) => void;
  className?: string;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  format?: (c: Cents) => string;
  style?: CSSProperties;
}) {
  const [text, setText] = useState(value == null ? '' : format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value == null ? '' : format(value));
  }, [value, focused]);
  const commit = () => {
    const v = parseAmount(text);
    if (v !== value) onCommit(v);
    setText(v == null ? '' : format(v));
  };
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      style={style}
      onFocus={(e) => {
        // Select what is shown so typing replaces it (rewriting the text here would drop the selection).
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Small "i" button that shows an explanation in a bubble under the row it sits in. */
export function InfoPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span ref={ref} className="ipop">
      <button className="ibtn" type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Icon name="info" size={17} />
      </button>
      {open && (
        <span className="pop" id={id} role="dialog" aria-label={label}>
          {children}
        </span>
      )}
    </span>
  );
}

// ---------- Overlays ----------

let locks = 0;
function useBodyLock() {
  useEffect(() => {
    locks++;
    document.body.classList.add('locked');
    return () => {
      locks--;
      if (!locks) document.body.classList.remove('locked');
    };
  }, []);
}

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

/** Full-height card sheet sliding up from the bottom (New expense, New category…). */
export function Sheet({ onClose, children, labelledBy }: { onClose: () => void; children: ReactNode; labelledBy: string }) {
  useBodyLock();
  useEscape(onClose);
  return createPortal(
    <div className="sheet-wrap">
      <button type="button" className="backdrop" aria-label="Close" onClick={onClose} />
      <section className="sheet elev" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="grabber" aria-hidden="true" />
        {children}
      </section>
    </div>,
    document.body
  );
}

export function SheetNav({ id, title, left, right }: { id: string; title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="sheet-nav">
      <div>{left}</div>
      <h1 id={id}>{title}</h1>
      <div>{right}</div>
    </div>
  );
}

export interface SheetAction {
  label: string;
  sub?: string;
  icon?: IconName;
  iconBg?: string;
  iconColor?: string;
  danger?: boolean;
  onClick: () => void;
}

/** iOS-style action sheet anchored at the bottom of the screen. */
export function ActionSheet({ title, detail, actions, onCancel, rich }: { title?: string; detail?: string; actions: SheetAction[]; onCancel: () => void; rich?: boolean }) {
  useBodyLock();
  useEscape(onCancel);
  const id = useId();
  return createPortal(
    <>
      <button type="button" className="backdrop" aria-label="Close" onClick={onCancel} />
      <div className="asheet" role={rich ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby={title ? id : undefined}>
        <div className="asheet-box">
          {(title || detail) && (
            <div className={'asheet-head' + (rich ? '' : ' sep')}>
              {title && <div id={id}>{title}</div>}
              {detail && (
                <div className="cap" style={{ marginTop: 4, fontWeight: 400 }}>
                  {detail}
                </div>
              )}
            </div>
          )}
          {actions.map((a) =>
            rich ? (
              <button key={a.label} className="mrow" type="button" onClick={a.onClick}>
                {a.icon && (
                  <span className="mico" style={{ background: a.iconBg, color: a.iconColor }}>
                    <Icon name={a.icon} size={22} />
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{a.label}</span>
                  {a.sub && <span className="cap">{a.sub}</span>}
                </span>
              </button>
            ) : (
              <button key={a.label} className="sheetbtn" type="button" style={{ color: a.danger ? 'var(--bad)' : undefined }} onClick={a.onClick}>
                {a.label}
              </button>
            )
          )}
        </div>
        <div className="asheet-cancel">
          <button className="sheetbtn" type="button" style={{ fontWeight: 600 }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

export interface AlertButton {
  label: string;
  style?: 'cancel' | 'danger' | 'default';
  onClick: () => void;
}

export function Alert({ title, message, buttons, children }: { title: string; message?: ReactNode; buttons: AlertButton[]; children?: ReactNode }) {
  useBodyLock();
  const cancel = buttons.find((b) => b.style === 'cancel');
  useEscape(() => cancel?.onClick());
  const id = useId();
  return createPortal(
    <div className="alert-wrap">
      <div className="alert" role="alertdialog" aria-modal="true" aria-labelledby={id}>
        <div className="alert-body">
          <div id={id} className="alert-title">
            {title}
          </div>
          {message && <div className="alert-msg">{message}</div>}
          {children}
        </div>
        <div className={'alert-btns' + (buttons.length > 2 ? ' stack' : '')}>
          {buttons.map((b) => (
            <button
              key={b.label}
              className="abtn"
              type="button"
              style={{ color: b.style === 'danger' ? 'var(--bad)' : undefined, fontWeight: b.style === 'cancel' ? 600 : undefined }}
              onClick={b.onClick}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ToastHost() {
  const { toast } = useOverlays();
  if (!toast) return null;
  return createPortal(
    <div className={'toast' + (toast.low ? ' low' : '')} role="status">
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            closeOverlay('toast');
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>,
    document.body
  );
}

export function go(path: string) {
  return () => navigate(path);
}

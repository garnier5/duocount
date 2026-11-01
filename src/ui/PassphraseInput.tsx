import { useState } from 'react';
import { copyText } from '../lib/share';
import { generatePassword, passphraseStrength, PASSWORD_RULES } from '../sync/password';
import { Icon } from './icons';

/**
 * Field for the household password, hidden by default so it can't be read over a shoulder.
 * Marked up for password managers: they fill it in, and suggest and save a new one.
 */
export function PassphraseInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder,
  username,
  isNew,
  onCard
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  /** What the password manager files the password under, e.g. the household's name. */
  username?: string;
  /** Choosing a new password: the manager may suggest one. */
  isNew?: boolean;
  /** Sits on a white card, so it needs the grey field background. */
  onCard?: boolean;
}) {
  const [shown, setShown] = useState(false);
  // Safari's attribute for the passwords it suggests; React passes it through untouched.
  const rules = isNew ? { passwordrules: PASSWORD_RULES } : {};
  return (
    <div style={{ position: 'relative' }}>
      {username && <input className="sr" type="text" autoComplete="username" value={'DuoCount · ' + username} readOnly tabIndex={-1} aria-hidden="true" />}
      <input
        id={id}
        name="password"
        className={'field mono' + (invalid ? ' err' : '')}
        style={{ paddingRight: 52, background: onCard ? 'var(--fill)' : undefined }}
        type={shown ? 'text' : 'password'}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        placeholder={placeholder}
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        {...rules}
      />
      <button
        className="iconbtn"
        type="button"
        aria-label="Show password"
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
        style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', color: shown ? 'var(--tintText)' : 'var(--sec)' }}
      >
        <Icon name="eye" size={22} />
      </button>
    </div>
  );
}

/**
 * What the new-password field really holds when its form is submitted. Safari can fill in the
 * password it suggests without telling React, so the state alone may still be empty.
 */
export function submittedPassword(form: HTMLFormElement): string {
  return String(new FormData(form).get('password') ?? '');
}

/** Choosing the household password: made by the password manager, or here as a fallback. */
export function NewPasswordField({ value, onChange, username }: { value: string; onChange: (value: string) => void; username: string }) {
  const [copied, setCopied] = useState(false);
  const strength = passphraseStrength(value);
  const color = strength.level >= 3 ? 'var(--good)' : strength.level === 2 ? 'var(--warn)' : 'var(--bad)';
  const change = (v: string) => {
    setCopied(false);
    onChange(v);
  };
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PassphraseInput id="newPw" isNew onCard username={username} placeholder="Tap for a suggestion" value={value} onChange={change} />
      <div>
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="seg-bar" style={{ background: i <= strength.level ? color : undefined }} />
          ))}
        </div>
        <div className="cap" style={{ marginTop: 6, color: strength.level ? color : undefined, fontWeight: 600 }}>
          {strength.label}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="chip tint" type="button" onClick={() => change(generatePassword())}>
          <Icon name="refresh" size={18} />
          Generate one
        </button>
        {value && (
          <button className="chip tint" type="button" onClick={async () => setCopied(await copyText(value))}>
            <Icon name="copy" size={18} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

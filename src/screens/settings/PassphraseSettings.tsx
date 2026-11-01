import { useState } from 'react';
import { setLocal, useDb } from '../../data/store';
import { household, members } from '../../domain/select';
import { dateKey, plural, shortDay } from '../../lib/dates';
import { makeCheck } from '../../sync/crypto';
import { newPasswordProblem } from '../../sync/password';
import { Icon } from '../../ui/icons';
import { BackLink, NavBar, Note, Sheet, SheetNav } from '../../ui/kit';
import { toast } from '../../ui/overlays';
import { NewPasswordField, submittedPassword } from '../../ui/PassphraseInput';

export function PassphraseSettings() {
  const db = useDb();
  const [change, setChange] = useState(false);
  const p = db.local.passphraseCheck;
  const n = members(db).length;
  return (
    <div className="sub">
      <NavBar left={<BackLink to="/settings" label="Settings" />} title="Password" />
      <div className="sub-body" style={{ gap: 24, paddingTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '8px 12px 0' }}>
          <span style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--goodSoft)', color: 'var(--good)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={30} />
          </span>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{p ? 'Password is set' : 'No password yet'}</div>
          {db.local.passphraseSetAt && (
            <div className="cap" style={{ fontSize: 15 }}>
              Set on {shortDay(dateKey(new Date(db.local.passphraseSetAt)))} · shared by all {plural(n, 'member')}
            </div>
          )}
        </div>

        <Note tone="tint" icon="shieldCheck">
          This phone doesn't keep the password, so nobody can read it from here. Your password manager fills it in each time you share, back up or import.
        </Note>

        <div>
          <h2 className="sh">Change</h2>
          <div className="card">
            <button className="row link" type="button" onClick={() => setChange(true)}>
              Change the password…
            </button>
          </div>
          <Note tone="warn" icon="warning" style={{ marginTop: 10 }}>
            Every member must switch to the new password. Files sent before the change still open with the old one.
          </Note>
        </div>
      </div>
      {change && <ChangeSheet onClose={() => setChange(false)} />}
    </div>
  );
}

function ChangeSheet({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (form: HTMLFormElement) => {
    if (busy) return;
    const password = submittedPassword(form);
    if (password !== value) setValue(password);
    const p = newPasswordProblem(password, saved);
    setProblem(p);
    if (p) return;
    setBusy(true);
    setLocal({ passphraseCheck: await makeCheck(password.trim()), passphraseSetAt: Date.now() });
    toast('Password changed. Share the new one through your password manager.', undefined, { low: true });
    onClose();
  };
  return (
    <Sheet onClose={onClose} labelledBy="cpT">
      <SheetNav
        id="cpT"
        title="New password"
        left={
          <button className="navbtn" type="button" onClick={onClose}>
            Cancel
          </button>
        }
        right={
          <button className="navbtn strong" type="submit" form="cpForm" disabled={busy}>
            Save
          </button>
        }
      />
      {/* A real form, so the password manager offers to save the new password. */}
      <form
        id="cpForm"
        className="sheet-body"
        onSubmit={(e) => {
          e.preventDefault();
          save(e.currentTarget);
        }}
      >
        <NewPasswordField
          username={household(db)?.name ?? 'Our household'}
          value={value}
          onChange={(v) => {
            setValue(v);
            setSaved(false);
          }}
        />
        <Note tone="warn" icon="warning">
          Update it in your shared password manager. Until every member uses it, you won't be able to open each other's files.
        </Note>
        <button
          type="button"
          role="checkbox"
          aria-checked={saved}
          onClick={() => {
            setSaved(!saved);
            setProblem(null);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '0 4px', border: 0, background: 'transparent', color: 'var(--label)', textAlign: 'left', cursor: 'pointer', fontSize: 17 }}
        >
          <span className={'chk sq' + (saved ? ' on' : '')}>
            <Icon name="check" size={16} stroke={3} />
          </span>
          I've saved the new password in our password manager
        </button>
        {problem && (
          <Note tone="bad" icon="alertCircle">
            <span role="alert">{problem}</span>
          </Note>
        )}
      </form>
    </Sheet>
  );
}

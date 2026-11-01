import { useState, type CSSProperties } from 'react';
import { createHousehold, type CategoryInput } from '../../domain/actions';
import { MEMBER_COLORS, SUGGESTED_CATEGORIES } from '../../domain/defaults';
import { navigate } from '../../lib/router';
import { newPasswordProblem } from '../../sync/password';
import { Icon } from '../../ui/icons';
import { Avatar, Note, Tile } from '../../ui/kit';
import { NewPasswordField, submittedPassword } from '../../ui/PassphraseInput';
import { openOverlay } from '../../ui/overlays';
import { SharesTotal, ShareStepper, StepTitle, StepTop, Swatches } from './common';

interface DraftMember {
  key: number;
  name: string;
  color: string;
  share: number;
}

interface Draft {
  householdName: string;
  members: DraftMember[];
  off: Record<string, boolean>;
  custom: CategoryInput[];
  passphrase: string;
  saved: boolean;
}

// Kept outside the component so going back and forth between steps keeps what was typed.
let draft: Draft = initialDraft();

function initialDraft(): Draft {
  return {
    householdName: '',
    members: [
      { key: 1, name: '', color: MEMBER_COLORS[0][0], share: 50 },
      { key: 2, name: '', color: MEMBER_COLORS[1][0], share: 50 }
    ],
    off: Object.fromEntries(SUGGESTED_CATEGORIES.filter((c) => !c.on).map((c) => [c.key, true])),
    custom: [],
    passphrase: '',
    saved: false
  };
}

function useDraft(): [Draft, (patch: Partial<Draft>) => void] {
  const [, force] = useState(0);
  return [
    draft,
    (patch) => {
      draft = { ...draft, ...patch };
      force((n) => n + 1);
    }
  ];
}

export function Setup({ step }: { step: 'household' | 'categories' | 'passphrase' }) {
  if (step === 'household') return <HouseholdStep />;
  if (step === 'categories') return <CategoriesStep />;
  return <PassphraseStep />;
}

function HouseholdStep() {
  const [d, set] = useDraft();
  const setMember = (key: number, patch: Partial<DraftMember>) => set({ members: d.members.map((m) => (m.key === key ? { ...m, ...patch } : m)) });
  // The household is two people: changing one share sets the other so they always total 100%.
  const setShare = (key: number, v: number) => set({ members: d.members.map((m) => ({ ...m, share: m.key === key ? v : 100 - v })) });
  const ok = d.members.every((m) => m.name.trim());
  return (
    <div className="onb">
      <StepTop step={1} back="/welcome" />
      <div className="onb-body">
        <StepTitle title="Your household">The two of you share the expenses. How much does each person pay?</StepTitle>
        <div>
          <label className="sh" htmlFor="hhName" style={{ display: 'block' }}>
            Household name
          </label>
          <input id="hhName" className="field" type="text" placeholder="E.g. The Duponts" autoComplete="off" value={d.householdName} onChange={(e) => set({ householdName: e.target.value })} />
        </div>
        <div>
          <h2 className="sh">Members and shares</h2>
          <div className="card">
            {d.members.map((m, i) => (
              <div key={m.key} style={{ borderTop: i ? '.5px solid var(--sep)' : undefined }}>
                <div className="row" style={{ minHeight: 60, padding: '8px 12px 8px 16px' }}>
                  <Avatar name={m.name || (i ? 'M' : 'Y')} color={m.color} />
                  <div className="grow">
                    <input
                      className="plainin"
                      type="text"
                      autoComplete="off"
                      aria-label={'First name of member ' + (i + 1)}
                      placeholder={i === 0 ? 'Your first name' : 'Their first name'}
                      value={m.name}
                      onChange={(e) => setMember(m.key, { name: e.target.value })}
                    />
                    <div className="cap">{i === 0 ? 'You' : 'Member'}</div>
                  </div>
                  <ShareStepper name={m.name || 'member ' + (i + 1)} value={m.share} onChange={(v) => setShare(m.key, v)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px 8px 58px', gap: 4 }}>
                  <Swatches colors={MEMBER_COLORS} value={m.color} onPick={(c) => setMember(m.key, { color: c })} label={(m.name || 'Member') + "'s color"} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <SharesTotal parts={d.members} />
        {!ok && <p className="cap" style={{ margin: '-10px 4px 0' }}>Type both first names to continue.</p>}
      </div>
      <div className="onb-foot">
        <button className="btn pri" type="button" disabled={!ok} onClick={() => navigate('/setup/categories')}>
          Continue
        </button>
      </div>
    </div>
  );
}

function CategoriesStep() {
  const [d, set] = useDraft();
  const count = SUGGESTED_CATEGORIES.filter((c) => !d.off[c.key]).length + d.custom.length;
  const create = () =>
    openOverlay({
      category: { onDraft: (input) => set({ custom: [...draft.custom, input] }) }
    });
  return (
    <div className="onb">
      <StepTop step={2} back="/setup/household" />
      <div className="onb-body" style={{ gap: 20 }}>
        <StepTitle title="Your categories">Keep the ones that fit your household. You can change them anytime in Settings.</StepTitle>
        <div>
          <h2 className="sh">
            <span>Suggested</span>
            <span className="plain">{count} selected</span>
          </h2>
          <div className="card lst">
            {SUGGESTED_CATEGORIES.map((c) => {
              const on = !d.off[c.key];
              return (
                <button key={c.key} className="row" type="button" role="checkbox" aria-checked={on} onClick={() => set({ off: { ...d.off, [c.key]: on } })}>
                  <Tile icon={c.icon} color={c.color} iconSize={19} />
                  <span className="grow">{c.name}</span>
                  <span className={'chk' + (on ? ' on' : '')}>
                    <Icon name="check" size={16} stroke={3} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <h2 className="sh">Your own</h2>
          <div className="card lst">
            {d.custom.map((c, i) => (
              <div key={i} className="row">
                <Tile icon={c.icon} color={c.color} iconSize={19} />
                <span className="grow">
                  {c.name}
                  <span className="badge">Custom</span>
                </span>
                <button className="x" type="button" aria-label={'Remove ' + c.name} onClick={() => set({ custom: d.custom.filter((_, j) => j !== i) })}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            <button type="button" className="row link" onClick={create}>
              <span className="addico">
                <Icon name="plus" size={19} />
              </span>
              <span className="grow">Create a category</span>
              <span className="cap">Name, icon, color</span>
            </button>
          </div>
        </div>
      </div>
      <div className="onb-foot line">
        <button className="btn pri" type="button" disabled={count === 0} onClick={() => navigate('/setup/passphrase')}>
          Continue
        </button>
      </div>
    </div>
  );
}

function PassphraseStep() {
  const [d, set] = useDraft();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const finish = async (form: HTMLFormElement) => {
    if (busy) return;
    const passphrase = submittedPassword(form);
    if (passphrase !== d.passphrase) set({ passphrase });
    const p = newPasswordProblem(passphrase, d.saved);
    setProblem(p);
    if (p) return;
    setBusy(true);
    const cats = [
      ...SUGGESTED_CATEGORIES.filter((c) => !d.off[c.key]).map((c) => ({ name: c.name, icon: c.icon, color: c.color })),
      ...d.custom.map((c) => ({ name: c.name, icon: c.icon, color: c.color, custom: true }))
    ];
    await createHousehold({
      householdName: d.householdName,
      members: d.members.map((m) => ({ name: m.name, color: m.color, share: m.share })),
      categories: cats,
      passphrase: passphrase.trim()
    });
    draft = initialDraft();
    navigate('/overview', { replace: true });
  };
  return (
    // A real form, so the password manager offers to save the password when it's submitted.
    <form
      className="onb"
      onSubmit={(e) => {
        e.preventDefault();
        finish(e.currentTarget);
      }}
    >
      <StepTop step={3} back="/setup/categories" />
      <div className="onb-body">
        <StepTitle title="Household password">It protects the files you exchange. Everyone in the household uses the same one.</StepTitle>
        <div>
          <h2 className="sh">Your password</h2>
          <NewPasswordField username={d.householdName.trim() || 'Our household'} value={d.passphrase} onChange={(v) => set({ passphrase: v, saved: false })} />
        </div>
        <div className="card lst" style={{ '--inset': '52px' } as CSSProperties}>
          <div className="info">
            <Icon name="lock" size={22} />
            <div>It encrypts every file you send on WhatsApp. Without it, the file can't be read.</div>
          </div>
          <div className="info">
            <Icon name="people" size={22} />
            <div>Share it with your household through your password manager. Never send it in the WhatsApp chat.</div>
          </div>
          <div className="info" style={{ background: 'var(--warnSoft)' }}>
            <Icon name="warning" size={22} style={{ color: 'var(--warn)' }} />
            <div>
              <strong style={{ color: 'var(--warn)' }}>It can't be recovered if lost.</strong> This phone won't keep it: your password manager fills it in each time you share, back up or import.
            </div>
          </div>
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={d.saved}
          onClick={() => {
            set({ saved: !d.saved });
            setProblem(null);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '0 4px', border: 0, background: 'transparent', color: 'var(--label)', textAlign: 'left', cursor: 'pointer', fontSize: 17 }}
        >
          <span className={'chk sq' + (d.saved ? ' on' : '')}>
            <Icon name="check" size={16} stroke={3} />
          </span>
          I've saved it in our password manager
        </button>
      </div>
      <div className="onb-foot" style={{ gap: 10 }}>
        {problem && (
          <Note tone="bad" icon="alertCircle">
            <span role="alert">{problem}</span>
          </Note>
        )}
        <button className="btn pri" type="submit" disabled={busy}>
          {busy ? 'Setting up…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { useDb } from '../../data/store';
import { saveHousehold, saveMembers, type MemberDraft } from '../../domain/actions';
import { lastSyncAt } from '../../domain/calc';
import { MEMBER_COLORS } from '../../domain/defaults';
import { household, members } from '../../domain/select';
import { ago } from '../../lib/dates';
import { navigate } from '../../lib/router';
import { Avatar, BackLink, NavBar, Note, Sheet, SheetNav } from '../../ui/kit';
import { toast } from '../../ui/overlays';
import { SharesTotal, ShareStepper, Swatches } from '../onboarding/common';

export function Members() {
  const db = useDb();
  const meId = db.local.meId;
  const [name, setName] = useState(household(db)?.name ?? '');
  const [drafts, setDrafts] = useState<MemberDraft[]>(() => members(db).map((m) => ({ id: m.id, name: m.name, color: m.color, share: m.share })));
  const [editing, setEditing] = useState<string | null>(null);
  const live = drafts.filter((d) => !d.removed);
  const total = live.reduce((a, d) => a + d.share, 0);
  const ok = total === 100 && live.every((d) => d.name.trim()) && name.trim().length > 0;
  const set = (id: string, patch: Partial<MemberDraft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  // Two people: changing one share sets the other so they always total 100%.
  const setShare = (id: string, v: number) =>
    setDrafts((ds) => (ds.filter((d) => !d.removed).length === 2 ? ds.map((d) => (d.removed ? d : { ...d, share: d.id === id ? v : 100 - v })) : ds.map((d) => (d.id === id ? { ...d, share: v } : d))));
  const peerSync = (id: string) => db.local.peers[id]?.importedAt;
  const sync = lastSyncAt(db);

  const save = () => {
    if (!ok) return;
    saveMembers(drafts);
    if (name.trim() !== household(db)?.name) saveHousehold({ name: name.trim() });
    toast('Members saved', undefined, { low: true });
    navigate('/settings');
  };

  const editingDraft = drafts.find((d) => d.id === editing);

  return (
    <div className="sub">
      <NavBar
        left={<BackLink to="/settings" label="Settings" />}
        title="Members"
        right={
          <button className="navbtn strong" type="button" disabled={!ok} onClick={save}>
            Save
          </button>
        }
      />
      <div className="sub-body" style={{ gap: 24, paddingTop: 16 }}>
        <div>
          <label className="sh" htmlFor="hhName" style={{ display: 'block' }}>
            Household name
          </label>
          <input id="hhName" className="field" type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <h2 className="sh">Members and shares</h2>
          <div className="card lst in64">
            {live.map((d) => (
              <div key={d.id} className="row" style={{ minHeight: 64, padding: '8px 12px 8px 16px' }}>
                <Avatar name={d.name || '?'} color={d.color} />
                <button
                  type="button"
                  onClick={() => setEditing(d.id)}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, border: 0, background: 'transparent', color: 'var(--label)', textAlign: 'left', padding: 0, cursor: 'pointer', fontSize: 17 }}
                  aria-label={'Edit ' + (d.name || 'new member') + "'s name and color"}
                >
                  <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || 'New member'}</span>
                  <span className="cap">
                    {d.id === meId ? 'You · this phone' : peerSync(d.id) ? 'Synced ' + ago(peerSync(d.id)!, Date.now(), true) : sync ? 'Not synced from their phone yet' : 'Member'}
                  </span>
                </button>
                <ShareStepper name={d.name || 'new member'} value={d.share} onChange={(v) => setShare(d.id, v)} />
              </div>
            ))}
          </div>
          <p className="cap foot">Tap a name to change it or pick another color.</p>
        </div>

        <SharesTotal parts={live} />

        <Note tone="tint" icon="calendar">
          New shares apply to forecasts you haven't confirmed yet. Past months keep their split.
        </Note>
      </div>

      {editingDraft && (
        <MemberSheet
          draft={editingDraft}
          isMe={editingDraft.id === meId}
          onClose={() => {
            setEditing(null);
          }}
          onSave={(patch) => {
            set(editingDraft.id, patch);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function MemberSheet({ draft, isMe, onClose, onSave }: { draft: MemberDraft; isMe: boolean; onClose: () => void; onSave: (patch: Partial<MemberDraft>) => void }) {
  const [name, setName] = useState(draft.name);
  const [color, setColor] = useState(draft.color);
  return (
    <Sheet onClose={onClose} labelledBy="mbT">
      <SheetNav
        id="mbT"
        title={draft.name ? 'Edit member' : 'New member'}
        left={
          <button className="navbtn" type="button" onClick={onClose}>
            Cancel
          </button>
        }
        right={
          <button className="navbtn strong" type="button" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), color })}>
            Done
          </button>
        }
      />
      <div className="sheet-body">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <span className="avatar" style={{ width: 72, height: 72, borderRadius: 36, fontSize: 30, background: color }}>
            {(name.trim()[0] || '?').toUpperCase()}
          </span>
          {isMe && <span className="cap">You · this phone</span>}
        </div>
        <div>
          <label className="sh" htmlFor="mName" style={{ display: 'block' }}>
            First name
          </label>
          <input id="mName" className="field" type="text" autoComplete="off" autoFocus={!draft.name} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <h2 className="sh">Color</h2>
          <div className="card" style={{ padding: '6px 10px' }}>
            <Swatches colors={MEMBER_COLORS} value={color} onPick={setColor} label="Color" />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

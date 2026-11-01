import { useState } from 'react';
import { setLocal, useDb } from '../../data/store';
import { unsharedCount } from '../../domain/calc';
import { others } from '../../domain/select';
import { dateTime, plural } from '../../lib/dates';
import { navigate } from '../../lib/router';
import { pickFile } from '../../lib/share';
import { buildSyncFile } from '../../sync/files';
import { loadFile, setPending } from '../../sync/importer';
import { Icon } from '../../ui/icons';
import { Avatar, BackLink, NavBar, Note } from '../../ui/kit';
import { toast } from '../../ui/overlays';
import { SealSheet } from './Unlock';

/** Asks for the password, encrypts this phone's data and opens the share sheet. */
export function ShareDataSheet({ passphrase, onClose, onSent }: { passphrase?: string; onClose: () => void; onSent?: () => void }) {
  const db = useDb();
  return (
    <SealSheet
      title="Share my data"
      shareTitle="DuoCount data"
      passphrase={passphrase}
      build={(p) => buildSyncFile(db, p)}
      onClose={onClose}
      onSent={(res) => {
        setLocal({ lastShareAt: Date.now() });
        toast(res === 'downloaded' ? 'File downloaded. Send it to your household.' : 'Data shared', undefined, { low: true });
        onClose();
        onSent?.();
      }}
    />
  );
}

export function Sync() {
  const db = useDb();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peers = others(db);
  const pending = unsharedCount(db);

  const importData = async () => {
    setError(null);
    const f = await pickFile();
    if (!f) return;
    try {
      const opened = await loadFile(f);
      if (opened.header.kind === 'backup') throw new Error('This is a backup file. Restore it from Settings › Restore from a backup.');
      if (opened.header.householdId !== db.local.householdId) throw new Error('This file belongs to another household (' + opened.header.householdName + ').');
      if (opened.header.from.memberId === db.local.meId) throw new Error('This is a file you shared yourself. Open the one a member sent you.');
      setPending(opened);
      navigate('/import');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="sub">
      <NavBar left={<BackLink to="/overview" label="Back" />} title="Household sync" />
      <div className="sub-body">
        <Note tone="good" icon="shieldCheck">
          <strong>No data goes through a server.</strong> You send an encrypted file yourself, and only someone with the household password can open it.
        </Note>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="big pri"
            type="button"
            onClick={() => {
              setError(null);
              setSharing(true);
            }}
          >
            <span className="bigico" style={{ background: 'rgba(255,255,255,.18)' }}>
              <Icon name="share" />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 600 }}>Share my data</span>
              <span style={{ fontSize: 13, opacity: 0.9 }}>Encrypted file, then choose WhatsApp</span>
            </span>
          </button>
          <button className="big sec" type="button" onClick={importData}>
            <span className="bigico" style={{ background: 'var(--tintSoft)', color: 'var(--tintText)' }}>
              <Icon name="download" />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 600 }}>Import data</span>
              <span className="cap">Open a file a member sent you</span>
            </span>
            <Icon name="chevron" size={18} style={{ color: 'var(--ter)' }} />
          </button>
          {error && (
            <Note tone="bad" icon="alertCircle">
              {error}
            </Note>
          )}
        </div>

        <div>
          <h2 className="sh">Last sync</h2>
          <div className="card lst in64">
            {peers.map((p) => {
              const s = db.local.peers[p.id];
              return (
                <div key={p.id} className="row" style={{ minHeight: 64, padding: '10px 16px', alignItems: 'flex-start' }}>
                  <Avatar name={p.name} color={p.color} />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="cap">{s?.importedAt ? 'Imported from ' + p.name + ': ' + dateTime(s.importedAt) : 'Nothing imported from ' + p.name + ' yet'}</div>
                    {s?.theirSentAt && <div className="cap">Their file was made: {dateTime(s.theirSentAt)}</div>}
                  </div>
                </div>
              );
            })}
            <div className="row" style={{ minHeight: 64, padding: '10px 16px' }}>
              <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 18, background: pending ? 'var(--warnSoft)' : 'var(--goodSoft)', color: pending ? 'var(--warn)' : 'var(--good)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={pending ? 'clock' : 'check'} size={20} />
              </span>
              <div className="grow" style={{ fontSize: 15, lineHeight: 1.4 }}>
                {pending
                  ? plural(pending, 'expense') + ' added or changed on this phone since your last share.'
                  : db.local.lastShareAt
                    ? 'Everything was shared. Last share: ' + dateTime(db.local.lastShareAt) + '.'
                    : 'Nothing to share yet.'}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="sh">How it works</h2>
          <div className="card howto">
            <div>
              <span className="k num">1</span>Share your file in the household WhatsApp chat.
            </div>
            <div>
              <span className="k num">2</span>The other member saves it to Files, then taps Import data in DuoCount and enters the household password.
            </div>
            <div>
              <span className="k num">3</span>They check the changes, then share back so you're both up to date.
            </div>
          </div>
        </div>
      </div>
      {sharing && <ShareDataSheet onClose={() => setSharing(false)} />}
    </div>
  );
}

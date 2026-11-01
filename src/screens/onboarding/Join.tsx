import { useState } from 'react';
import { DEFAULT_LOCAL, replaceAll } from '../../data/store';
import { monthKey } from '../../lib/dates';
import { navigate } from '../../lib/router';
import { pickFile } from '../../lib/share';
import { makeCheck, type OpenedFile } from '../../sync/crypto';
import type { SyncPayload } from '../../sync/files';
import { loadFile } from '../../sync/importer';
import { readSyncPayload } from '../../sync/validate';
import type { Member, Rec } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Avatar, Note } from '../../ui/kit';
import { FileCard, UnlockForm } from '../sync/Unlock';

/** A second member sets up their phone from a file the first member shared. */
export function Join() {
  const [file, setFile] = useState<OpenedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ records: Rec[]; passphraseCheck: string } | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    setError(null);
    const f = await pickFile();
    if (!f) return;
    try {
      const opened = await loadFile(f);
      if (opened.header.kind !== 'sync') throw new Error('This is a backup file. To restore a backup, set up the household first.');
      setFile(opened);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const ms = payload
    ? payload.records
        .filter((r): r is Rec<Member> => r.type === 'member' && !r.deleted)
        .sort((a, b) => a.data.order - b.data.order)
        .filter((r) => r.id !== file?.header.from.memberId)
    : [];

  const finish = async () => {
    if (!payload || !file || !who) return;
    setBusy(true);
    const now = Date.now();
    await replaceAll(payload.records, {
      ...DEFAULT_LOCAL,
      householdId: file.header.householdId,
      meId: who,
      passphraseCheck: payload.passphraseCheck,
      passphraseSetAt: now,
      selectedMonth: monthKey(),
      peers: { [file.header.from.memberId]: { importedAt: now, theirSentAt: file.header.sentAt } }
    });
    navigate('/overview', { replace: true });
  };

  const top = (
    <div className="onb-top">
      <a className="iconbtn" href="#/welcome" aria-label="Back">
        <Icon name="back" />
      </a>
      <span className="cap" style={{ fontWeight: 600 }}>
        Join a household
      </span>
      <span style={{ width: 44 }} />
    </div>
  );

  if (file && payload) {
    return (
      <div className="onb">
        {top}
        <div className="onb-body">
          <div style={{ padding: '0 4px' }}>
            <h1 className="h1">Who are you?</h1>
            <p className="lead">
              {file.header.householdName} was set up by {file.header.from.name}. Pick your name so DuoCount knows whose phone this is.
            </p>
          </div>
          <div className="card lst" role="radiogroup" aria-label="Your name">
            {ms.map((m) => (
              <button key={m.id} className="row tall" type="button" role="radio" aria-checked={who === m.id} onClick={() => setWho(m.id)}>
                <Avatar name={m.data.name} color={m.data.color} />
                <span className="grow">{m.data.name}</span>
                <span className={'radio' + (who === m.id ? ' on' : '')} />
              </button>
            ))}
          </div>
          {ms.length === 0 && (
            <Note tone="warn" icon="warning">
              {file.header.from.name} is the only member of this household. Ask them to add you in Settings › Members and shares, then share their data again.
            </Note>
          )}
        </div>
        <div className="onb-foot">
          <button className="btn pri" type="button" disabled={!who || busy} onClick={finish}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (file) {
    return (
      <div className="onb">
        {top}
        <div className="onb-body" style={{ gap: 20 }}>
          <FileCard file={file} />
          <UnlockForm<SyncPayload> file={file} read={(p) => readSyncPayload(p, file.header.householdId)} onUnlocked={async (p, passphrase) => setPayload({ records: p.records, passphraseCheck: await makeCheck(passphrase) })} />
        </div>
      </div>
    );
  }

  return (
    <div className="onb">
      {top}
      <div className="onb-body">
        <div style={{ padding: '0 4px' }}>
          <h1 className="h1">Join your household</h1>
          <p className="lead">A member already set up DuoCount? Get their data file, and the household password from your shared password manager.</p>
        </div>
        <div className="card howto">
          <div>
            <span className="k num">1</span>On their phone: Settings › Household sync › Share my data.
          </div>
          <div>
            <span className="k num">2</span>In WhatsApp, open the file they sent and save it to Files.
          </div>
          <div>
            <span className="k num">3</span>Choose it below, then fill in the household password.
          </div>
        </div>
        {error && (
          <Note tone="bad" icon="alertCircle">
            {error}
          </Note>
        )}
      </div>
      <div className="onb-foot">
        <button className="btn pri" type="button" onClick={choose}>
          <Icon name="download" size={20} />
          Choose the file
        </button>
      </div>
    </div>
  );
}

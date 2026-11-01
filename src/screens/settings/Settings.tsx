import { useState } from 'react';
import { eraseAll, replaceAll, setLocal, useDb, DEFAULT_LOCAL } from '../../data/store';
import { saveHousehold } from '../../domain/actions';
import { lastSyncAt } from '../../domain/calc';
import { CURRENCIES } from '../../domain/defaults';
import { categories, household, liveRecordCount, members, others } from '../../domain/select';
import type { Theme } from '../../domain/types';
import { ago, fullDate, monthName, plural } from '../../lib/dates';
import { navigate } from '../../lib/router';
import { pickFile, shareFile } from '../../lib/share';
import { monthEndReminder } from '../../export/ics';
import { makeCheck, type OpenedFile } from '../../sync/crypto';
import { buildBackupFile, type BackupPayload } from '../../sync/files';
import { loadFile } from '../../sync/importer';
import { readBackupPayload, type Checked } from '../../sync/validate';
import { Icon, type IconName } from '../../ui/icons';
import { Alert, BackLink, Seg, Sheet, SheetNav, Switch } from '../../ui/kit';
import { toast } from '../../ui/overlays';
import { FileCard, RepairedNote, SealSheet, UnlockForm } from '../sync/Unlock';

function SRow({ icon, color, title, sub, value, to, onClick }: { icon: IconName; color: string; title: string; sub?: string; value?: string; to?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="sico" style={{ background: color }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="grow">
        <span className="t">{title}</span>
        {sub && <span className="cap">{sub}</span>}
      </span>
      {value && <span className="val">{value}</span>}
      {to && <Icon name="chevron" size={18} className="chev" />}
    </>
  );
  if (to)
    return (
      <a className="row" href={'#' + to}>
        {inner}
      </a>
    );
  if (onClick)
    return (
      <button className="row" type="button" onClick={onClick}>
        {inner}
      </button>
    );
  return <div className="row">{inner}</div>;
}

export function Settings() {
  const db = useDb();
  const hh = household(db);
  const ms = members(db);
  const [erase, setErase] = useState(false);
  const [restore, setRestore] = useState<OpenedFile | null>(null);
  const [backup, setBackup] = useState(false);
  const sync = lastSyncAt(db);
  const peer = others(db)[0];
  const count = liveRecordCount(db, 'expense');

  const chooseBackup = async () => {
    const f = await pickFile();
    if (!f) return;
    try {
      setRestore(await loadFile(f));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), undefined, { low: true });
    }
  };

  const addReminder = async () => {
    const res = await shareFile(monthEndReminder(location.href.replace(/#.*$/, '')), 'Month-end reminder');
    if (res === 'downloaded') toast('Open the downloaded file to add it to your calendar', undefined, { low: true });
  };

  const theme = db.local.theme;
  const sinceMonth = hh ? monthName(hh.startMonth) : '';

  return (
    <>
      <main className="page nofab" style={{ gap: 26 }}>
        <header className="phead">
          <div className="phead-row" style={{ marginLeft: -8 }}>
            <BackLink to="/overview" label="Back" />
          </div>
          <h1 className="ptitle">Settings</h1>
        </header>

        <a className="card" href="#/settings/members" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 14px 14px 16px', textDecoration: 'none', color: 'var(--label)' }}>
          <span style={{ flex: 'none', width: 52, height: 52, borderRadius: 14, background: 'var(--tint)', color: 'var(--onTint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="house" size={28} stroke={1.7} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 20, fontWeight: 600 }}>{hh?.name}</span>
            <span className="cap" style={{ fontSize: 15 }}>
              {plural(ms.length, 'member')} · since {sinceMonth}
            </span>
          </span>
          <Icon name="chevron" size={18} className="chev" />
        </a>

        <section>
          <h2 className="sh">Household</h2>
          <div className="card lst in58">
            <SRow icon="people" color="#3E6FD8" title="Members and shares" value={ms.map((m) => m.share + '%').join(' · ')} to="/settings/members" />
            <SRow icon="grid" color="#2E9457" title="Categories" value={String(categories(db).length)} to="/settings/categories" />
          </div>
        </section>

        <section>
          <h2 className="sh">Sharing and security</h2>
          <div className="card lst in58">
            <SRow
              icon="refresh"
              color="#0B7A75"
              title="Household sync"
              sub={sync ? 'Last: ' + (peer && ms.length === 2 ? 'with ' + peer.name + ', ' : '') + ago(sync, Date.now(), true) : 'Not synced yet'}
              to="/sync"
            />
            <SRow icon="lock" color="#6E7380" title="Password" value={db.local.passphraseCheck ? 'Set' : 'Not set'} to="/settings/passphrase" />
          </div>
        </section>

        <section>
          <h2 className="sh">Appearance</h2>
          <div className="card lst in58">
            <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: '12px 16px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="sico" style={{ background: '#5856D6' }}>
                  <Icon name="moon" size={18} />
                </span>
                <span>Theme</span>
              </span>
              <Seg<Theme>
                label="Theme"
                value={theme}
                onChange={(t) => setLocal({ theme: t })}
                items={[
                  { id: 'system', label: 'Automatic' },
                  { id: 'light', label: 'Light' },
                  { id: 'dark', label: 'Dark' }
                ]}
              />
            </div>
            <label className="row" style={{ position: 'relative' }}>
              <span className="sico" style={{ background: '#B87A00' }}>
                <Icon name="euro" size={18} />
              </span>
              <span className="grow">Currency</span>
              <span className="val">{CURRENCIES.find((c) => c.code === hh?.currency)?.label ?? hh?.currency}</span>
              <Icon name="chevronDown" size={16} className="chev" />
              <select
                aria-label="Currency"
                value={hh?.currency ?? 'EUR'}
                onChange={(e) => saveHousehold({ currency: e.target.value })}
                style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2 className="sh">Monthly routine</h2>
          <div className="card lst in58">
            <SRow icon="checklist" color="#D9622B" title="Month-end entry" sub="Enter all of a month's expenses in one go" to="/month/entry" />
            <div className="row">
              <span className="sico" style={{ background: '#CF4A86' }}>
                <Icon name="bell" size={18} />
              </span>
              <span className="grow">
                <span className="t">Reminder</span>
                <span className="cap">Last day of the month, 8:00 PM</span>
              </span>
              <Switch on={db.local.reminder} onChange={(v) => setLocal({ reminder: v })} label="Month-end reminder" />
            </div>
            {db.local.reminder && <SRow icon="calendar" color="#8E5BD0" title="Add the reminder to my calendar" sub="A monthly event with an alert" onClick={addReminder} />}
          </div>
          <p className="cap foot">On the last day, the month page asks you to enter the month when you open DuoCount. Phones don't let web apps send scheduled notifications, so the calendar event does the reminding.</p>
        </section>

        <section>
          <h2 className="sh">Data</h2>
          <div className="card lst in58">
            <SRow icon="excel" color="#1E7F45" title="Export to Excel" sub="Any month, any time · .xlsx" to="/export" />
            <SRow icon="share" color="#2F7FD0" title="Export a backup" sub="Encrypted file, saved where you choose" onClick={() => setBackup(true)} />
            <SRow icon="download" color="#2F7FD0" title="Restore from a backup" onClick={chooseBackup} />
            <SRow icon="phone" color="#6E7380" title="Stored on this phone" value={plural(count, 'expense')} />
          </div>
          <p className="cap foot">{db.local.lastBackupAt ? 'Last backup: ' + fullDate(db.local.lastBackupAt) + '.' : 'No backup yet.'}</p>
        </section>

        <section>
          <div className="card">
            <button className="row danger" type="button" onClick={() => setErase(true)}>
              Erase all data on this phone
            </button>
          </div>
          <p className="cap foot">Other members keep their own copy.</p>
        </section>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0 8px', color: 'var(--sec)' }}>
          <Icon name="shieldCheck" size={18} style={{ marginTop: 1 }} />
          <p className="cap" style={{ margin: 0 }}>
            DuoCount has no server. Your data only leaves this phone inside the encrypted files you choose to share. Version {__APP_VERSION__}
          </p>
        </div>
      </main>

      {erase && (
        <Alert
          title="Erase all data?"
          message="Expenses, forecasts and settings will be deleted from this phone. This can't be undone. Export a backup first if you might need it."
          buttons={[
            { label: 'Cancel', style: 'cancel', onClick: () => setErase(false) },
            {
              label: 'Erase',
              style: 'danger',
              onClick: async () => {
                setErase(false);
                await eraseAll();
                navigate('/welcome', { replace: true });
              }
            }
          ]}
        />
      )}
      {restore && <RestoreSheet file={restore} onClose={() => setRestore(null)} />}
      {backup && (
        <SealSheet
          title="Export a backup"
          shareTitle="DuoCount backup"
          build={(p) => buildBackupFile(db, p)}
          onClose={() => setBackup(false)}
          onSent={(res) => {
            setLocal({ lastBackupAt: Date.now() });
            toast(res === 'downloaded' ? 'Backup downloaded' : 'Backup ready', undefined, { low: true });
            setBackup(false);
          }}
        />
      )}
    </>
  );
}

function RestoreSheet({ file, onClose }: { file: OpenedFile; onClose: () => void }) {
  const db = useDb();
  const [payload, setPayload] = useState<{ data: BackupPayload & Checked; passphraseCheck: string } | null>(null);

  const otherHousehold = file.header.householdId !== db.local.householdId;
  const restore = async () => {
    if (!payload) return;
    const { data, passphraseCheck } = payload;
    await replaceAll(data.records, { ...DEFAULT_LOCAL, ...data.local, passphraseCheck, theme: db.local.theme, selectedMonth: null });
    onClose();
    navigate('/overview', { replace: true });
    toast('Backup restored', undefined, { low: true });
  };
  const n = payload ? payload.data.records.filter((r) => r.type === 'expense' && !r.deleted).length : 0;

  return (
    <Sheet onClose={onClose} labelledBy="rsT">
      <SheetNav
        id="rsT"
        title="Restore a backup"
        left={
          <button className="navbtn" type="button" onClick={onClose}>
            Cancel
          </button>
        }
      />
      <div className="sheet-body" style={{ gap: 20, paddingTop: 14 }}>
        <FileCard file={file} />
        {file.header.kind !== 'backup' && (
          <div className="note warn">
            <Icon name="warning" size={20} />
            <span>This is a sync file, not a backup. To merge a member's data, use Household sync › Import data.</span>
          </div>
        )}
        {payload ? (
          <>
            {payload.data.repaired > 0 && <RepairedNote count={payload.data.repaired} />}
            <div className="note warn">
              <Icon name="warning" size={20} />
              <span>
                Everything on this phone will be replaced by this backup ({plural(n, 'expense')}, {file.header.householdName}).
                {otherHousehold ? ' It belongs to a different household than the one on this phone.' : ''}
              </span>
            </div>
            <div className="spacer" />
            <button className="btn pri" type="button" style={{ background: 'var(--bad)', color: '#fff' }} onClick={restore}>
              Replace my data with this backup
            </button>
          </>
        ) : (
          <UnlockForm<BackupPayload & Checked> file={file} read={(p) => readBackupPayload(p, file.header.householdId)} onUnlocked={async (data, passphrase) => setPayload({ data, passphraseCheck: await makeCheck(passphrase) })} />
        )}
      </div>
    </Sheet>
  );
}

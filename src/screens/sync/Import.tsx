import { useEffect, useMemo, useState } from 'react';
import { setLocal, useDb, write, type Db } from '../../data/store';
import { diffRecords, resolve, type Change, type Choice, type Diff } from '../../domain/merge';
import { member } from '../../domain/select';
import type { Rec } from '../../domain/types';
import { dateAtTime, plural } from '../../lib/dates';
import { money } from '../../lib/money';
import { navigate } from '../../lib/router';
import { makeCheck, matchesCheck, type OpenedFile } from '../../sync/crypto';
import { describe, overlay, versionLine, type Described } from '../../sync/describe';
import type { SyncPayload } from '../../sync/files';
import { getPending, setPending } from '../../sync/importer';
import { readSyncPayload, type Checked } from '../../sync/validate';
import { Icon } from '../../ui/icons';
import { Avatar, NavBar, Note, Tile } from '../../ui/kit';
import { toast } from '../../ui/overlays';
import { FileCard, RepairedNote, UnlockForm } from './Unlock';
import { ShareDataSheet } from './Sync';

interface Applied {
  added: number;
  changed: number;
  deleted: number;
  others: number;
  conflicts: { title: string; kept: Choice }[];
  theyLackExpenses: number;
  theyLack: number;
}

export function Import() {
  const db = useDb();
  const file = getPending();
  const [unlocked, setUnlocked] = useState<{ records: Rec[]; repaired: number; current: string | null } | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  useEffect(() => {
    if (!file) navigate('/sync', { replace: true });
  }, [file]);

  if (!file) return null;
  const cancel = () => {
    setPending(null);
    navigate('/sync');
  };

  /** Is the password that opened the file the one this phone uses? Adopts it if the household switched since. */
  const currentPassphrase = async (passphrase: string): Promise<string | null> => {
    const check = db.local.passphraseCheck;
    if (check && (await matchesCheck(check, passphrase))) return passphrase;
    // An older file still opens with the old passphrase: only a newer one means the household changed it.
    if (file.header.sentAt <= (db.local.passphraseSetAt ?? 0)) return null;
    setLocal({ passphraseCheck: await makeCheck(passphrase), passphraseSetAt: Date.now() });
    toast('This phone now uses the password that opened this file', undefined, { low: true });
    return passphrase;
  };

  if (applied) return <Success file={file} applied={applied} passphrase={unlocked?.current ?? undefined} />;

  if (unlocked) return <Review db={db} file={file} records={unlocked.records} repaired={unlocked.repaired} onCancel={cancel} onApplied={setApplied} />;

  return (
    <div className="sub">
      <NavBar
        left={
          <button className="navbtn" type="button" onClick={cancel}>
            Cancel
          </button>
        }
        title="Import data"
      />
      <div className="sub-body" style={{ gap: 20 }}>
        <FileCard file={file} />
        <UnlockForm<SyncPayload & Checked>
          file={file}
          read={(p) => readSyncPayload(p, file.header.householdId)}
          onUnlocked={async (p, passphrase) => setUnlocked({ records: p.records, repaired: p.repaired, current: await currentPassphrase(passphrase) })}
        />
      </div>
    </div>
  );
}

function ChangeRow({ d, strike, extra }: { d: Described; strike?: boolean; extra?: string }) {
  return (
    <div className="erow static">
      <Tile icon={d.icon} color={d.color} iconSize={19} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, textDecoration: strike ? 'line-through' : undefined, color: strike ? 'var(--sec)' : undefined }}>
          {d.title}
          {extra && <span className="tag">{extra}</span>}
        </div>
        <div className="cap">{d.sub}</div>
      </div>
      {d.amount != null && (
        <span className="num" style={{ fontWeight: 600, color: strike ? 'var(--sec)' : undefined, textDecoration: strike ? 'line-through' : undefined }}>
          {money(d.amount)}
        </span>
      )}
    </div>
  );
}

function Section({ title, items, view, limit = 3 }: { title: string; items: Change[]; view: Db; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, limit);
  return (
    <section>
      <h2 className="sh">
        <span>{title}</span>
        <span>{items.length}</span>
      </h2>
      <div className="card lst">
        {shown.map((c) => {
          const d = describe(view, c.kind, c.after, c.before);
          const adv = c.after.type === 'expense' && (c.after.data as { advance?: boolean }).advance ? 'Advance' : undefined;
          return <ChangeRow key={c.after.key} d={d} strike={c.kind === 'deleted'} extra={adv} />;
        })}
        {!all && items.length > limit && (
          <button className="erow" type="button" style={{ justifyContent: 'center', color: 'var(--tintText)', minHeight: 48, background: 'transparent' }} onClick={() => setAll(true)}>
            Show {items.length - limit} more
          </button>
        )}
      </div>
    </section>
  );
}

function Review({
  db,
  file,
  records,
  repaired,
  onCancel,
  onApplied
}: {
  db: Db;
  file: OpenedFile;
  records: Rec[];
  repaired: number;
  onCancel: () => void; onApplied: (a: Applied) => void }) {
  const diff: Diff = useMemo(() => diffRecords(db.records, records), [db.records, records]);
  const view = useMemo(() => overlay(db, records), [db, records]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const from = file.header.from;
  const sender = member(view, from.memberId);
  const exp = diff.changes.filter((c) => c.after.type === 'expense');
  const other = diff.changes.filter((c) => c.after.type !== 'expense');
  const added = exp.filter((c) => c.kind === 'added');
  const changed = exp.filter((c) => c.kind === 'changed');
  const deleted = exp.filter((c) => c.kind === 'deleted');
  const unresolved = diff.conflicts.filter((c) => !choices[c.mine.key]).length;
  const total = diff.changes.length + diff.conflicts.length;

  const apply = () => {
    const recs = resolve(diff, choices, db.local.meId ?? 'unknown');
    write(recs);
    const now = Date.now();
    setLocal({ peers: { ...db.local.peers, [from.memberId]: { importedAt: now, theirSentAt: file.header.sentAt } } });
    const minePicked = diff.conflicts.filter((c) => choices[c.mine.key] === 'mine').length;
    onApplied({
      added: added.length,
      changed: changed.length,
      deleted: deleted.length,
      others: other.length,
      conflicts: diff.conflicts.map((c) => ({ title: describe(view, 'changed', c.theirs).title, kept: choices[c.mine.key] })),
      theyLackExpenses: diff.theyLack.filter((r) => r.type === 'expense').length,
      theyLack: diff.theyLack.length + minePicked
    });
  };

  return (
    <div className="sub">
      <NavBar
        left={
          <button className="navbtn" type="button" onClick={onCancel}>
            Cancel
          </button>
        }
        title="Review changes"
      />
      <div className="sub-body" style={{ paddingTop: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 12px' }}>
            <Avatar name={from.name} color={sender?.color ?? '#3E6FD8'} size={30} />
            <span style={{ fontSize: 15 }}>
              From <strong>{from.name}</strong>, sent {dateAtTime(file.header.sentAt)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <div className="stat">
              <span className="num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--good)' }}>
                {added.length}
              </span>
              <span className="cap">added</span>
            </div>
            <div className="stat">
              <span className="num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--tintText)' }}>
                {changed.length}
              </span>
              <span className="cap">changed</span>
            </div>
            <div className="stat">
              <span className="num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--bad)' }}>
                {deleted.length}
              </span>
              <span className="cap">deleted</span>
            </div>
          </div>
        </div>

        {repaired > 0 && <RepairedNote count={repaired} />}

        {total === 0 && (
          <Note tone="good" icon="checkCircle">
            You already have everything in this file. Nothing to change.
          </Note>
        )}

        {diff.conflicts.length > 0 && (
          <section aria-labelledby="conf">
            <h2 className="sh" id="conf">
              <span>{unresolved ? plural(unresolved, 'conflict') + ' to resolve' : diff.conflicts.length > 1 ? 'Conflicts resolved' : 'Conflict resolved'}</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {diff.conflicts.map((c) => {
                const d = describe(view, 'changed', c.theirs.deleted ? c.mine : c.theirs);
                const pick = choices[c.mine.key];
                const opt = (side: Choice, r: Rec) => {
                  const dd = r.deleted ? null : describe(view, 'added', r);
                  return (
                    <button className="opt" type="button" role="radio" aria-checked={pick === side} onClick={() => setChoices({ ...choices, [c.mine.key]: side })}>
                      <span className={'radio' + (pick === side ? ' on' : '')} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 500 }}>{side === 'mine' ? 'Keep mine' : 'Keep ' + from.name + "'s"}</span>
                        <span className="cap">{versionLine(view, r)}</span>
                        {dd && !dd.isExpense && <span className="cap" style={{ display: 'block' }}>{dd.sub}</span>}
                      </span>
                      {dd?.amount != null && (
                        <span className="num" style={{ fontWeight: 600 }}>
                          {money(dd.amount)}
                        </span>
                      )}
                    </button>
                  );
                };
                return (
                  <div key={c.mine.key} className="card" style={{ boxShadow: pick ? 'none' : 'inset 0 0 0 2px var(--warn)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '0.5px solid var(--sep)' }}>
                      <Tile icon={d.icon} color={d.color} iconSize={19} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{d.title}</div>
                        <div className="cap">{d.isExpense && !c.mine.deleted && !c.theirs.deleted ? 'Edited on both phones' : 'Changed on both phones'}</div>
                      </div>
                    </div>
                    <div role="radiogroup" aria-label="Which version to keep" className="lst in16">
                      {opt('mine', c.mine)}
                      {opt('theirs', c.theirs)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <Section title="Added" items={added} view={view} />
        <Section title="Changed" items={changed} view={view} />
        <Section title="Deleted" items={deleted} view={view} />
        <Section title="Other updates" items={other} view={view} limit={4} />

        <div className="spacer" />
        {total === 0 ? (
          <button className="btn sec" type="button" onClick={() => apply()}>
            Done
          </button>
        ) : unresolved ? (
          <button className="btn off" type="button" disabled>
            {unresolved > 1 ? 'Resolve the ' + unresolved + ' conflicts to continue' : 'Resolve the conflict to continue'}
          </button>
        ) : (
          <button className="btn pri" type="button" onClick={apply}>
            Apply {plural(total, 'change')}
          </button>
        )}
      </div>
    </div>
  );
}

function Success({ file, applied, passphrase }: { file: OpenedFile; applied: Applied; passphrase?: string }) {
  const name = file.header.from.name;
  const total = applied.added + applied.changed + applied.deleted + applied.others + applied.conflicts.length;
  const [sharing, setSharing] = useState(false);
  const done = () => {
    setPending(null);
    navigate('/overview', { replace: true });
  };
  return (
    <div className="sub" style={{ padding: 'calc(var(--sat) + 16px) 16px calc(var(--sab) + 24px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }} role="status">
          <span style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--goodSoft)', color: 'var(--good)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={46} stroke={2.2} />
          </span>
          <h1 className="h1">You're up to date with {name}</h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--sec)', lineHeight: 1.4 }}>
            {total ? plural(total, 'change') + ' applied on this phone.' : 'Nothing needed to change.'} No server was involved.
          </p>
        </div>
        {total > 0 && (
          <div className="card lst in16">
            <div className="lrow">
              <span>Expenses added</span>
              <span className="num" style={{ fontWeight: 600, color: 'var(--good)' }}>
                {applied.added}
              </span>
            </div>
            <div className="lrow">
              <span>Expenses changed</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {applied.changed}
              </span>
            </div>
            <div className="lrow">
              <span>Expenses deleted</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {applied.deleted}
              </span>
            </div>
            {applied.others > 0 && (
              <div className="lrow">
                <span>Other updates</span>
                <span className="cap">{applied.others} · forecast, categories…</span>
              </div>
            )}
            {applied.conflicts.map((c, i) => (
              <div key={i} className="lrow">
                <span>Conflict resolved</span>
                <span className="cap">Kept {c.kept === 'mine' ? 'your' : name + "'s"} version</span>
              </div>
            ))}
          </div>
        )}
        {applied.theyLack > 0 && (
          <Note tone="tint" icon="share">
            {name} doesn't have {applied.theyLackExpenses ? 'your ' + plural(applied.theyLackExpenses, 'latest expense') : 'your latest changes'} yet. Share your data back so you both see the same thing.
          </Note>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16 }}>
        {applied.theyLack > 0 && (
          <button className="btn pri" type="button" onClick={() => setSharing(true)}>
            {'Share my data with ' + name}
          </button>
        )}
        <button className={'btn ' + (applied.theyLack > 0 ? 'sec' : 'pri')} type="button" onClick={done}>
          Back to the month
        </button>
      </div>
      {sharing && <ShareDataSheet passphrase={passphrase} onClose={() => setSharing(false)} onSent={done} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useDb } from '../../data/store';
import { household } from '../../domain/select';
import { dateAtTime } from '../../lib/dates';
import { formatSize, shareFile } from '../../lib/share';
import { FileTooBig, matchesCheck, openFile, WrongPassphrase, type OpenedFile } from '../../sync/crypto';
import { InvalidData } from '../../sync/validate';
import { Icon } from '../../ui/icons';
import { Note, Sheet, SheetNav } from '../../ui/kit';
import { PassphraseInput } from '../../ui/PassphraseInput';

export function FileCard({ file, detail }: { file: OpenedFile; detail?: string }) {
  const h = file.header;
  const what = h.kind === 'backup' ? 'Backup made by ' + h.from.name : 'Sent by ' + h.from.name;
  return (
    <div className="card filecard" style={{ padding: '14px 16px' }}>
      <span className="fileico" style={{ width: 40, height: 48, borderRadius: 7 }}>
        <Icon name="lock" size={22} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{file.fileName || h.householdName}</span>
        <span className="cap">{detail ?? what + ' · ' + dateAtTime(h.sentAt) + ' · ' + formatSize(file.size) + ' · encrypted'}</span>
      </span>
    </div>
  );
}

/** Asks for the household password and decrypts the file. */
export function UnlockForm<T>({
  file,
  read,
  onUnlocked
}: {
  file: OpenedFile;
  /** Checks the decrypted content: nothing reaches the phone unless it passes. */
  read: (payload: unknown) => T;
  onUnlocked: (payload: T, passphrase: string) => void | Promise<void>;
}) {
  const [val, setVal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    if (!val.trim() || busy) return;
    setBusy(true);
    try {
      const payload = read(await openFile<unknown>(file, val));
      await onUnlocked(payload, val.trim());
    } catch (e) {
      setError(
        e instanceof WrongPassphrase
          ? "Wrong password. This file can't be opened with it. Check with " + file.header.from.name + ': the whole household uses the same one.'
          : e instanceof InvalidData || e instanceof FileTooBig
            ? e.message
            : "This file is damaged and can't be opened."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', padding: '6px 12px 0' }}>
        <span
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            background: error ? 'var(--badSoft)' : 'var(--tintSoft)',
            color: error ? 'var(--bad)' : 'var(--tintText)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Icon name="lock" size={28} />
        </span>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Enter the household password</div>
        <div className="cap" style={{ fontSize: 15 }}>
          The file is unlocked on this phone only.
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          unlock();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}
      >
        <div>
          <label className="sh" htmlFor="pp" style={{ display: 'block' }}>
            Password
          </label>
          <PassphraseInput
            id="pp"
            username={file.header.householdName}
            value={val}
            invalid={!!error}
            describedBy="ppErr"
            onChange={(v) => {
              setVal(v);
              setError(null);
            }}
          />
          {error && (
            <div id="ppErr" role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 4px 0', color: 'var(--bad)', fontSize: 15, lineHeight: 1.4 }}>
              <Icon name="alertCircle" size={20} style={{ marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="spacer" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn pri" type="submit" disabled={!val.trim() || busy}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <p className="cap" style={{ margin: 0, textAlign: 'center' }}>
            Nothing is changed until you review and confirm.
          </p>
        </div>
      </form>
    </>
  );
}

/** Tells the person that some values of the file were replaced by defaults when it was read. */
export function RepairedNote({ count }: { count: number }) {
  return (
    <Note tone="warn" icon="warning">
      {count === 1 ? 'One item' : count + ' items'} in this file had a currency, color or icon DuoCount can't use. Default ones were put instead: you can change them in Settings.
    </Note>
  );
}

export type Sent = 'shared' | 'downloaded';

/**
 * Asks for the household password, checks it against this phone's, encrypts a file with it,
 * then lets the person send it. Sending is its own tap: iOS only opens the share sheet right after one.
 */
export function SealSheet({
  title,
  shareTitle,
  passphrase: known,
  build,
  onSent,
  onClose
}: {
  title: string;
  shareTitle: string;
  /** Already typed in this flow (e.g. to open their file): skips the question. */
  passphrase?: string;
  build: (passphrase: string) => Promise<File>;
  onSent: (res: Sent) => void;
  onClose: () => void;
}) {
  const db = useDb();
  const [val, setVal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!known) return;
    let alive = true;
    setBusy(true);
    build(known)
      .then((f) => alive && setFile(f))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line
  }, [known]);

  const submit = async () => {
    const p = val.trim();
    if (!p || busy) return;
    setBusy(true);
    try {
      const check = db.local.passphraseCheck;
      if (check && !(await matchesCheck(check, p))) {
        setError("That's not the password set on this phone. If your household changed it, update it in Settings › Password.");
        return;
      }
      setFile(await build(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!file) return;
    const res = await shareFile(file, shareTitle);
    if (res !== 'cancelled') onSent(res);
  };

  return (
    <Sheet onClose={onClose} labelledBy="sealT">
      <SheetNav
        id="sealT"
        title={title}
        left={
          <button className="navbtn" type="button" onClick={onClose}>
            Cancel
          </button>
        }
      />
      <div className="sheet-body" style={{ gap: 20, paddingTop: 14 }}>
        {file ? (
          <>
            <div className="card filecard" role="status">
              <span className="fileico">
                <Icon name="lock" size={20} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{file.name}</span>
                <span className="cap">Encrypted · {formatSize(file.size)}</span>
              </span>
            </div>
            <button className="btn pri" type="button" onClick={send}>
              Send the file
            </button>
          </>
        ) : known ? (
          error ? (
            <Note tone="bad" icon="alertCircle">
              {error}
            </Note>
          ) : (
            <p className="cap" style={{ textAlign: 'center', fontSize: 15 }}>
              Encrypting…
            </p>
          )
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            <div>
              <label className="sh" htmlFor="sealPp" style={{ display: 'block' }}>
                Household password
              </label>
              <PassphraseInput
                id="sealPp"
                username={household(db)?.name}
                value={val}
                invalid={!!error}
                describedBy="sealErr"
                onChange={(v) => {
                  setVal(v);
                  setError(null);
                }}
              />
              {error && (
                <div id="sealErr" role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 4px 0', color: 'var(--bad)', fontSize: 15, lineHeight: 1.4 }}>
                  <Icon name="alertCircle" size={20} style={{ marginTop: 1 }} />
                  <span>{error}</span>
                </div>
              )}
              <p className="cap foot">This phone doesn't keep the password: the file is encrypted with the one you enter.</p>
            </div>
            <button className="btn pri" type="submit" disabled={!val.trim() || busy}>
              {busy ? 'Encrypting…' : 'Encrypt'}
            </button>
          </form>
        )}
      </div>
    </Sheet>
  );
}

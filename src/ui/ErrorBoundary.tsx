import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { eraseAll, getDb } from '../data/store';
import { household } from '../domain/select';
import { navigate } from '../lib/router';
import { shareFile } from '../lib/share';
import { matchesCheck } from '../sync/crypto';
import { buildBackupFile } from '../sync/files';
import { PassphraseInput } from './PassphraseInput';

/**
 * Safety net: if a screen crashes while rendering, show a way out instead of a blank page.
 * The data stays on the phone, and the person can still back it up, get an update or start over.
 * Navigating elsewhere gives the app another try.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('DuoCount crashed', error, info.componentStack);
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.retry);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.retry);
  }

  retry = () => {
    if (this.state.error) this.setState({ error: null });
  };

  render() {
    return this.state.error ? <Fallback error={this.state.error} onRetry={this.retry} /> : this.props.children;
  }
}

/** Fetches a newer version of the app if there is one, so a fix can arrive even when the app can't start. */
async function updateAndReload() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      const sw = reg.waiting ?? reg.installing;
      if (sw) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 5000);
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            clearTimeout(timer);
            resolve();
          });
          const activate = () => sw.state === 'installed' && sw.postMessage({ type: 'SKIP_WAITING' });
          sw.addEventListener('statechange', activate);
          activate();
        });
      }
    }
  } catch {
    // Offline or no service worker: a plain reload is all we can do.
  }
  location.reload();
}

function Fallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const backup = async () => {
    const p = passphrase.trim();
    if (!p || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const db = getDb();
      if (db.local.passphraseCheck && !(await matchesCheck(db.local.passphraseCheck, p))) {
        setStatus({ tone: 'bad', text: "That's not the password set on this phone." });
        return;
      }
      const res = await shareFile(await buildBackupFile(db, p), 'DuoCount backup');
      if (res !== 'cancelled') setStatus({ tone: 'good', text: res === 'downloaded' ? 'Backup downloaded.' : 'Backup ready.' });
    } catch (e) {
      setStatus({ tone: 'bad', text: e instanceof Error ? e.message : 'Backup failed.' });
    } finally {
      setBusy(false);
    }
  };

  const erase = async () => {
    if (!confirm("Erase all DuoCount data on this phone? This can't be undone. Other members keep their own copy.")) return;
    await eraseAll();
    navigate('/welcome', { replace: true });
    onRetry();
  };

  return (
    <div className="onb" role="alert" style={{ padding: 'calc(var(--sat) + 24px) 16px calc(var(--sab) + 24px)', gap: 24 }}>
      <div style={{ padding: '0 4px' }}>
        <h1 className="h1">Something went wrong</h1>
        <p className="lead">DuoCount hit an error on this screen. Your data is still on this phone.</p>
        <p className="cap mono" style={{ margin: '10px 0 0', fontSize: 13, overflowWrap: 'anywhere' }}>
          {error.message}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          className="btn pri"
          type="button"
          onClick={() => {
            navigate('/overview', { replace: true });
            onRetry();
          }}
        >
          Back to the month
        </button>
        <button className="btn sec" type="button" onClick={updateAndReload}>
          Update and reload DuoCount
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          backup();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <label className="sh" htmlFor="rescuePp">
          Keep a copy of your data
        </label>
        <PassphraseInput id="rescuePp" placeholder="Household password" username={household(getDb())?.name} value={passphrase} onChange={setPassphrase} />
        <button className="btn ghost" type="submit" disabled={!passphrase.trim() || busy}>
          {busy ? 'Encrypting…' : 'Export a backup'}
        </button>
        {status && (
          <div className={'note ' + status.tone} role="status">
            <span>{status.text}</span>
          </div>
        )}
      </form>

      <div className="spacer" />
      <button className="btn danger" type="button" onClick={erase}>
        Erase all data on this phone
      </button>
    </div>
  );
}

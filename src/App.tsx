import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useDb } from './data/store';
import { canEnterExpenses } from './domain/calc';
import { household } from './domain/select';
import { addMonths, monthShort } from './lib/dates';
import { navigate, useRoute } from './lib/router';
import { SheetHost } from './screens/sheets/hosts';
import { Charts } from './screens/Charts';
import { Expenses } from './screens/Expenses';
import { ExportExcel } from './screens/ExportExcel';
import { Forecast } from './screens/Forecast';
import { MonthEntry } from './screens/month/MonthEntry';
import { MonthReview } from './screens/month/MonthReview';
import { Join } from './screens/onboarding/Join';
import { Setup } from './screens/onboarding/Setup';
import { Welcome } from './screens/onboarding/Welcome';
import { Overview } from './screens/Overview';
import { ManageCategories } from './screens/settings/ManageCategories';
import { Members } from './screens/settings/Members';
import { PassphraseSettings } from './screens/settings/PassphraseSettings';
import { Settings } from './screens/settings/Settings';
import { Import } from './screens/sync/Import';
import { Sync } from './screens/sync/Sync';
import { planFirstStep } from './screens/PlanFirst';
import { ActionSheet, Alert, ToastHost } from './ui/kit';
import { closeOverlay, openOverlay, useOverlays } from './ui/overlays';

function useTheme(theme: 'system' | 'light' | 'dark') {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7');
  }, [dark]);
}

const SETUP_ROUTES = ['/welcome', '/setup/household', '/setup/categories', '/setup/passphrase', '/join'];

function Screen({ route, ready }: { route: string; ready: boolean }) {
  if (!ready) {
    switch (route) {
      case '/setup/household':
        return <Setup step="household" />;
      case '/setup/categories':
        return <Setup step="categories" />;
      case '/setup/passphrase':
        return <Setup step="passphrase" />;
      case '/join':
        return <Join />;
      default:
        return <Welcome />;
    }
  }
  switch (route) {
    case '/expenses':
      return <Expenses />;
    case '/charts':
      return <Charts />;
    case '/forecast':
      return <Forecast />;
    case '/settings':
      return <Settings />;
    case '/settings/members':
      return <Members />;
    case '/settings/categories':
      return <ManageCategories />;
    case '/settings/passphrase':
      return <PassphraseSettings />;
    case '/sync':
      return <Sync />;
    case '/import':
      return <Import />;
    case '/export':
      return <ExportExcel />;
    case '/month/entry':
      return <MonthEntry />;
    case '/month/review':
      return <MonthReview />;
    default:
      return <Overview />;
  }
}

function AddMenu({ month }: { month: string }) {
  const db = useDb();
  const close = () => closeOverlay('addMenu');
  if (!canEnterExpenses(db, month)) {
    const step = planFirstStep(db, month);
    return (
      <Alert
        title={step.title}
        message={step.body}
        buttons={[
          { label: 'Cancel', style: 'cancel', onClick: close },
          {
            label: step.cta,
            onClick: () => {
              close();
              step.go();
            }
          }
        ]}
      />
    );
  }
  const next = monthShort(addMonths(month, 1));
  return (
    <ActionSheet
      rich
      title={'Add to ' + monthShort(month) + ' ' + month.slice(0, 4)}
      onCancel={close}
      actions={[
        {
          label: 'Enter the whole month',
          sub: 'Several expenses in a row, or one total per category',
          icon: 'checklist',
          iconBg: 'var(--tint)',
          iconColor: 'var(--onTint)',
          onClick: () => {
            close();
            navigate('/month/entry');
          }
        },
        {
          label: 'Add one expense',
          sub: 'A forgotten receipt, a one-off purchase',
          icon: 'plus',
          iconBg: 'var(--tintSoft)',
          iconColor: 'var(--tintText)',
          onClick: () => {
            close();
            openOverlay({ expense: { month } });
          }
        },
        {
          label: 'I paid with my own money',
          sub: 'Reimbursed by the joint account in the ' + next + ' transfer, or owed by the other',
          icon: 'undo',
          iconBg: 'var(--warnSoft)',
          iconColor: 'var(--warn)',
          onClick: () => {
            close();
            openOverlay({ expense: { month, advance: true } });
          }
        }
      ]}
    />
  );
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Look for a new version every hour while the app stays open.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }
  });
  if (!needRefresh) return null;
  return (
    <div className="toast low" role="status" style={{ zIndex: 50 }}>
      <span>A new version of DuoCount is ready.</span>
      <span style={{ display: 'flex' }}>
        <button type="button" style={{ fontWeight: 400 }} onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button type="button" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
      </span>
    </div>
  );
}

export function App() {
  const db = useDb();
  const route = useRoute();
  const overlays = useOverlays();
  useTheme(db.local.theme);
  const ready = db.status === 'ready' && !!household(db) && !!db.local.meId;

  // Keep the URL in line with what is shown.
  useEffect(() => {
    if (db.status !== 'ready') return;
    if (!ready && !SETUP_ROUTES.includes(route)) navigate('/welcome', { replace: true });
    if (ready && (SETUP_ROUTES.includes(route) || route === '/')) navigate('/overview', { replace: true });
  }, [db.status, ready, route]);

  if (db.status === 'loading') return null;
  if (db.status === 'error') {
    return (
      <div className="onb" style={{ padding: 24, justifyContent: 'center', textAlign: 'center', gap: 12 }}>
        <h1 className="h1">DuoCount can't open its storage</h1>
        <p className="lead">{db.error}. Private browsing can block it: open DuoCount in a normal window, or from your Home Screen.</p>
      </div>
    );
  }

  return (
    <>
      <Screen route={route} ready={ready} />
      {ready && overlays.addMenu && <AddMenu month={overlays.addMenu} />}
      <SheetHost overlays={overlays} ready={ready} />
      <ToastHost />
      <UpdatePrompt />
    </>
  );
}

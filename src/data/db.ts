import { openDB, type IDBPDatabase } from 'idb';
import type { LocalState, Rec } from '../domain/types';

const DB_NAME = 'duocount';
const LOCAL_KEY = 'state';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('records', { keyPath: 'key' });
        d.createObjectStore('local');
      }
    });
  }
  return dbPromise;
}

export async function loadAll(): Promise<{ records: Rec[]; local: Partial<LocalState> | undefined }> {
  const d = await db();
  const records = (await d.getAll('records')) as Rec[];
  const local = (await d.get('local', LOCAL_KEY)) as Partial<LocalState> | undefined;
  return { records, local };
}

export async function putRecords(recs: Rec[]): Promise<void> {
  if (!recs.length) return;
  const d = await db();
  const tx = d.transaction('records', 'readwrite');
  for (const r of recs) tx.store.put(r);
  await tx.done;
}

export async function putLocal(local: LocalState): Promise<void> {
  const d = await db();
  await d.put('local', local, LOCAL_KEY);
}

/** Replaces everything on this phone (restore from backup, erase). */
export async function replaceAll(recs: Rec[], local: LocalState | null): Promise<void> {
  const d = await db();
  const tx = d.transaction(['records', 'local'], 'readwrite');
  await tx.objectStore('records').clear();
  await tx.objectStore('local').clear();
  for (const r of recs) tx.objectStore('records').put(r);
  if (local) tx.objectStore('local').put(local, LOCAL_KEY);
  await tx.done;
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported: nothing to do.
  }
}

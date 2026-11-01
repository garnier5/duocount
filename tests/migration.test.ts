import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { getDb, init } from '../src/data/store';
import { matchesCheck } from '../src/sync/crypto';

describe('passphrase migration', () => {
  it('replaces a stored passphrase with a check and removes it from disk', async () => {
    const d = await openDB('duocount', 1, {
      upgrade(db) {
        db.createObjectStore('records', { keyPath: 'key' });
        db.createObjectStore('local');
      }
    });
    await d.put('local', { meId: 'cam', householdId: 'hh', passphrase: 'sailboat-lemon-thunder-42', passphraseSetAt: 1, theme: 'dark' }, 'state');
    d.close();

    await init();

    const local = getDb().local as unknown as Record<string, unknown>;
    expect(local.passphrase).toBeUndefined();
    expect(local.theme).toBe('dark');
    expect(await matchesCheck(local.passphraseCheck as string, 'sailboat-lemon-thunder-42')).toBe(true);
    const onDisk = await (await openDB('duocount', 1)).get('local', 'state');
    expect(onDisk.passphrase).toBeUndefined();
    expect(onDisk.passphraseCheck).toBe(local.passphraseCheck);
  }, 20_000);
});

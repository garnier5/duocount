import type { Db } from '../data/store';
import { dateKey } from '../lib/dates';
import { slug } from '../lib/share';
import { household, householdRec, me } from '../domain/select';
import type { LocalState, Rec } from '../domain/types';
import { FILE_EXTENSION, sealFile, type FileHeader } from './crypto';

export interface SyncPayload {
  records: Rec[];
}

export interface BackupPayload {
  records: Rec[];
  local: Partial<LocalState>;
}

function header(db: Db, kind: FileHeader['kind']): FileHeader {
  const hh = householdRec(db);
  const self = me(db);
  if (!hh || !self) throw new Error('No household on this phone yet.');
  return {
    app: 'duocount',
    v: 1,
    kind,
    householdId: hh.id,
    householdName: hh.data.name,
    from: { memberId: self.id, name: self.name },
    sentAt: Date.now()
  };
}

/** The encrypted file a member sends to the household (WhatsApp…). */
export async function buildSyncFile(db: Db, passphrase: string): Promise<File> {
  const h = header(db, 'sync');
  const text = await sealFile(h, { records: [...db.records.values()] } satisfies SyncPayload, passphrase);
  const name = slug(h.householdName) + '-' + slug(h.from.name) + '-' + dateKey() + FILE_EXTENSION;
  return new File([text], name, { type: 'application/octet-stream' });
}

/** A full encrypted copy of this phone's data, including its local settings. */
export async function buildBackupFile(db: Db, passphrase: string): Promise<File> {
  const h = header(db, 'backup');
  const { theme, reminder, meId, householdId, lastShareAt, peers, passphraseSetAt } = db.local;
  const payload: BackupPayload = {
    records: [...db.records.values()],
    local: { theme, reminder, meId, householdId, lastShareAt, peers, passphraseSetAt }
  };
  const text = await sealFile(h, payload, passphrase);
  const name = slug(household(db)?.name ?? 'household') + '-backup-' + dateKey() + FILE_EXTENSION;
  return new File([text], name, { type: 'application/octet-stream' });
}

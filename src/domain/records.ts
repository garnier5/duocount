import type { Rec, RecType } from './types';

const REV_HISTORY = 50;

export function randomId(len = 10): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += alphabet[b % 36];
  return s;
}

export function uuid(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : randomId(8) + '-' + randomId(4) + '-' + randomId(12);
}

export function recKey(type: RecType, id: string): string {
  return type + ':' + id;
}

export function createRec<T>(type: RecType, id: string, data: T, by: string): Rec<T> {
  const rev = randomId();
  return { key: recKey(type, id), type, id, rev, revs: [rev], at: Date.now(), by, data };
}

/** New version of a record. Its history keeps the previous revs so peers can fast-forward. */
export function editRec<T>(rec: Rec<T>, data: T, by: string, deleted = false): Rec<T> {
  const rev = randomId();
  const out: Rec<T> = { ...rec, rev, revs: [...rec.revs, rev].slice(-REV_HISTORY), at: Date.now(), by, data };
  if (deleted) out.deleted = true;
  else delete out.deleted;
  return out;
}

/** Version that descends from both a and b (used when resolving a conflict). */
export function mergeRevs(a: Rec, b: Rec): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...a.revs, ...b.revs]) {
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out.slice(-REV_HISTORY * 2);
}

export function sameData(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(o[k]))
      .join(',') +
    '}'
  );
}

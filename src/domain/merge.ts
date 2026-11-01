import { mergeRevs, randomId, sameData } from './records';
import type { Rec } from './types';

export interface Change {
  kind: 'added' | 'changed' | 'deleted';
  before?: Rec;
  after: Rec;
}

export interface Conflict {
  mine: Rec;
  theirs: Rec;
}

export interface Diff {
  /** Visible changes to review. */
  changes: Change[];
  /** Records edited on both phones since they last agreed. */
  conflicts: Conflict[];
  /** Applied without asking (tombstones of unknown records, identical edits…). */
  silent: Rec[];
  /** Records this phone has that are newer than, or missing from, the incoming file. */
  theyLack: Rec[];
}

/**
 * Compares the incoming records with what this phone has.
 * Each record carries the list of its recent revs: if one side's current rev appears
 * in the other side's history, the other side simply has newer edits.
 */
export function diffRecords(local: ReadonlyMap<string, Rec>, incoming: Rec[]): Diff {
  const out: Diff = { changes: [], conflicts: [], silent: [], theyLack: [] };
  const seen = new Set<string>();
  for (const inc of incoming) {
    seen.add(inc.key);
    const loc = local.get(inc.key);
    if (!loc) {
      if (inc.deleted) out.silent.push(inc);
      else out.changes.push({ kind: 'added', after: inc });
      continue;
    }
    if (loc.rev === inc.rev) continue;
    if (loc.revs.includes(inc.rev)) {
      out.theyLack.push(loc);
      continue;
    }
    if (inc.revs.includes(loc.rev)) {
      if (loc.deleted && inc.deleted) out.silent.push(inc);
      else if (inc.deleted) out.changes.push({ kind: 'deleted', before: loc, after: inc });
      else if (loc.deleted) out.changes.push({ kind: 'added', before: loc, after: inc });
      else if (sameData(loc.data, inc.data)) out.silent.push(inc);
      else out.changes.push({ kind: 'changed', before: loc, after: inc });
      continue;
    }
    // Edited on both phones.
    if (!!loc.deleted === !!inc.deleted && (loc.deleted || sameData(loc.data, inc.data))) {
      out.silent.push({ ...inc, revs: mergeRevs(inc, loc) });
    } else {
      out.conflicts.push({ mine: loc, theirs: inc });
    }
  }
  for (const loc of local.values()) {
    if (!seen.has(loc.key) && !loc.deleted) out.theyLack.push(loc);
  }
  return out;
}

export type Choice = 'mine' | 'theirs';

/** Records to save once the person has picked a side for every conflict. */
export function resolve(diff: Diff, choices: Record<string, Choice>, me: string): Rec[] {
  const out: Rec[] = [...diff.changes.map((c) => c.after), ...diff.silent];
  for (const c of diff.conflicts) {
    const choice = choices[c.mine.key] ?? 'theirs';
    if (choice === 'theirs') {
      out.push({ ...c.theirs, revs: mergeRevs(c.theirs, c.mine) });
    } else {
      // A new version that descends from both, so the other phone fast-forwards to ours.
      const rev = randomId();
      const merged = { ...c.mine, rev, revs: [...mergeRevs(c.mine, c.theirs), rev], at: Date.now(), by: me };
      out.push(merged);
    }
  }
  return out;
}

export function countByType(changes: Change[], type: Rec['type']) {
  const of = changes.filter((c) => c.after.type === type);
  return {
    added: of.filter((c) => c.kind === 'added').length,
    changed: of.filter((c) => c.kind === 'changed').length,
    deleted: of.filter((c) => c.kind === 'deleted').length
  };
}

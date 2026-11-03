import { mergeHistories, sameButHistory } from './history';
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
      // A newer version that only adds history entries changes nothing to review.
      else if (sameButHistory(loc.data, inc.data)) out.silent.push(inc);
      else out.changes.push({ kind: 'changed', before: loc, after: inc });
      continue;
    }
    // Edited on both phones.
    if (!!loc.deleted === !!inc.deleted && (loc.deleted || sameData(loc.data, inc.data))) {
      out.silent.push({ ...inc, revs: mergeRevs(inc, loc) });
    } else if (!!loc.deleted === !!inc.deleted && sameButHistory(loc.data, inc.data)) {
      // Same values, different histories: keep both histories in a version that descends from both.
      const rev = randomId();
      out.silent.push({ ...inc, data: mergeHistories(inc, loc), rev, revs: [...mergeRevs(inc, loc), rev] });
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
    const [chosen, other] = choice === 'theirs' ? [c.theirs, c.mine] : [c.mine, c.theirs];
    // The version not picked goes into the history, along with both phones' histories.
    const data = mergeHistories(chosen, other);
    if (choice === 'theirs' && sameData(data, chosen.data)) {
      out.push({ ...c.theirs, revs: mergeRevs(c.theirs, c.mine) });
    } else {
      // A new version that descends from both, so the other phone fast-forwards to it.
      const rev = randomId();
      const mine = choice === 'mine';
      out.push({ ...chosen, data, rev, revs: [...mergeRevs(chosen, other), rev], at: mine ? Date.now() : chosen.at, by: mine ? me : chosen.by });
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

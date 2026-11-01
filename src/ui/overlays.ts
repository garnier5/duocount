import { useSyncExternalStore } from 'react';
import type { MonthKey } from '../lib/dates';
import type { CategoryInput } from '../domain/actions';

// Sheets and dialogs shown above the current page. Kept out of the URL so the
// page underneath stays as it was.

export interface ExpenseSheetState {
  id?: string;
  month: MonthKey;
  advance?: boolean;
}

export interface Overlays {
  expense?: ExpenseSheetState;
  addMenu?: MonthKey;
  monthPicker?: boolean;
  /** Edit a category, or (during setup) collect a new one without saving it. */
  category?: { id?: string; onDraft?: (input: CategoryInput) => void };
  deleteCategory?: string;
  toast?: { id: number; text: string; action?: { label: string; run: () => void }; low?: boolean };
}

let state: Overlays = {};
const listeners = new Set<() => void>();

function set(next: Overlays) {
  state = next;
  listeners.forEach((l) => l());
}

export function useOverlays(): Overlays {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

export function openOverlay(patch: Partial<Overlays>) {
  set({ ...state, ...patch });
}

export function closeOverlay(key: keyof Overlays) {
  const next = { ...state };
  delete next[key];
  set(next);
}

let toastTimer: number | undefined;
let toastSeq = 0;

export function toast(text: string, action?: { label: string; run: () => void }, opts: { low?: boolean } = {}) {
  window.clearTimeout(toastTimer);
  const id = ++toastSeq;
  set({ ...state, toast: { id, text, action, low: opts.low } });
  toastTimer = window.setTimeout(() => {
    if (state.toast?.id === id) closeOverlay('toast');
  }, action ? 5000 : 2600);
}

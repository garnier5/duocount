import { useSyncExternalStore } from 'react';

// Hash routes ("#/expenses") work on GitHub Pages without server rewrites.

function current(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

function subscribe(l: () => void) {
  window.addEventListener('hashchange', l);
  return () => window.removeEventListener('hashchange', l);
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, current, () => '/');
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (current() === path) return;
  if (opts.replace) {
    const url = window.location.href.replace(/#.*$/, '') + '#' + path;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path;
  }
  window.scrollTo(0, 0);
}

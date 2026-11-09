import { useSyncExternalStore } from 'react';

/** ハッシュルーティング（/#/quiz）。GitHub Pages でリロードしても 404 にならない（SPEC §4.1） */
export type Route = '/' | '/home' | '/setup' | '/quiz' | '/result' | '/stats' | '/settings';

const ROUTES: readonly Route[] = ['/', '/home', '/setup', '/quiz', '/result', '/stats', '/settings'];

function current(): Route {
  const h = window.location.hash.replace(/^#/, '').split('?')[0] || '/';
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : '/';
}

function subscribe(l: () => void): () => void {
  window.addEventListener('hashchange', l);
  return () => window.removeEventListener('hashchange', l);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, current, current);
}

export function navigate(to: Route, opts: { replace?: boolean } = {}): void {
  const url = `#${to}`;
  if (opts.replace) {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}

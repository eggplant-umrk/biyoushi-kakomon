import { useSyncExternalStore } from 'react';

/** ハッシュルーティング（/#/quiz）。GitHub Pages でリロードしても 404 にならない（SPEC §4.1） */
export type Route = '/' | '/home' | '/setup' | '/quiz' | '/result' | '/stats' | '/settings' | '/admin';

const ROUTES: readonly Route[] = ['/', '/home', '/setup', '/quiz', '/result', '/stats', '/settings', '/admin'];

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

function currentQuery(): string {
  return window.location.hash.split('?')[1] ?? '';
}

/** ハッシュの ? 以降（例：#/admin?u=xxx の u）から値を1つ読む。なければ null */
export function useRouteParam(name: string): string | null {
  const q = useSyncExternalStore(subscribe, currentQuery, currentQuery);
  return new URLSearchParams(q).get(name);
}

export function navigate(to: Route, opts: { replace?: boolean; query?: Record<string, string> } = {}): void {
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
  const url = `#${to}${qs}`;
  if (opts.replace) {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = `${to}${qs}`;
  }
}

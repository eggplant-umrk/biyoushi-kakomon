import { useSyncExternalStore } from 'react';
import type { SetupOptions } from './select';

/** 端末ごとの表示設定。localStorage に置く（使えない環境では既定値で動く） */
export interface Settings {
  fontSize: 'normal' | 'large' | 'xlarge';
  theme: 'system' | 'light' | 'dark';
  vibration: boolean;
  guest: boolean; // 「ログインせずに使う」を選んだ
  lastSetup: SetupOptions | null; // 前回の出題条件
}

const KEY = 'kakomon-settings-v1';
const DEFAULTS: Settings = { fontSize: 'normal', theme: 'system', vibration: true, guest: false, lastSetup: null };

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = read();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // 保存できなくても、このタブの間は反映する
  }
  applyToDocument(current);
  listeners.forEach((l) => l());
}

export function resetSettings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  current = DEFAULTS;
  applyToDocument(current);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSettings,
    getSettings,
  );
}

export function applyToDocument(s: Settings): void {
  const el = document.documentElement;
  el.dataset.font = s.fontSize;
  if (s.theme === 'system') delete el.dataset.theme;
  else el.dataset.theme = s.theme;
}

export function vibrate(pattern: number | number[]): void {
  if (!current.vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 対応していない端末では何もしない */
  }
}

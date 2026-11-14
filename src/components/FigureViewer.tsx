import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Icon } from './Icon';

const MIN = 1;
const MAX = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 図の拡大表示（全画面）。2本指のピンチで拡大・縮小、1本指で動かす、ダブルタップで拡大／元に戻す。
 * ボタン（＋・−・元に戻す）でも操作できる。閲覧モード（7a-2）でも使う。
 */
export function FigureViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; s: number; cx: number; cy: number; x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeBtn.current?.focus();
    // 拡大表示の間は、後ろの画面がスクロールしないようにする
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const zoomTo = useCallback((s: number) => setView((v) => (s <= MIN ? { s: 1, x: 0, y: 0 } : { s: clamp(s, MIN, MAX), x: v.x, y: v.y })), []);

  function onPointerDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, x: view.x, y: view.y };
    } else if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) zoomTo(view.s > 1 ? 1 : 2.5);
      lastTap.current = now;
      gesture.current = { d: 0, s: view.s, cx: e.clientX, cy: e.clientY, x: view.x, y: view.y };
    }
  }
  function onPointerMove(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size >= 2 && g.d > 0) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = clamp((g.s * d) / g.d, MIN, MAX);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setView({ s, x: g.x + (cx - g.cx), y: g.y + (cy - g.cy) });
    } else if (pointers.current.size === 1 && view.s > 1) {
      setView({ s: view.s, x: g.x + (e.clientX - g.cx), y: g.y + (e.clientY - g.cy) });
    }
  }
  function onPointerUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()] as [{ x: number; y: number }];
      gesture.current = { d: 0, s: view.s, cx: p.x, cy: p.y, x: view.x, y: view.y };
    } else if (pointers.current.size === 0) {
      gesture.current = null;
      if (view.s <= 1.02) setView({ s: 1, x: 0, y: 0 });
    }
  }

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="図の拡大表示">
      <div className="viewer-bar">
        <span className="viewer-hint small">ピンチ・ダブルタップで拡大</span>
        <button ref={closeBtn} type="button" className="viewer-close" onClick={onClose} aria-label="閉じる">
          <Icon name="close" />
          <span>閉じる</span>
        </button>
      </div>
      <div
        className="viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
          data-testid="viewer-img"
        />
      </div>
      <div className="viewer-tools">
        <button type="button" className="icon-btn" onClick={() => zoomTo(view.s - 0.5)} aria-label="縮小" disabled={view.s <= MIN}>
          <Icon name="zoomOut" />
        </button>
        <button type="button" className="btn btn-ghost viewer-reset" onClick={() => zoomTo(1)} disabled={view.s === 1}>
          {Math.round(view.s * 100)}%・元に戻す
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomTo(view.s + 0.5)} aria-label="拡大" disabled={view.s >= MAX}>
          <Icon name="zoomIn" />
        </button>
      </div>
    </div>
  );
}

import { useEffect, type ReactNode } from 'react';

export function Footer() {
  return (
    <footer className="footer">
      <p>
        出典：公益財団法人 理容師美容師試験研修センター「過去の筆記試験問題」。問題番号は「第○回 問○」で表示しています。
      </p>
      <p>このアプリは非公式・個人作成です。解説は独自に作成したもので、公式のものではありません。</p>
    </footer>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="読み込み中">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="card error" role="alert">
      {children}
    </div>
  );
}

/** 図の全画面表示。ピンチズームはブラウザ標準のものを使う（viewport でズームを止めていない） */
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="図の拡大表示">
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="閉じる">
        ✕ 閉じる
      </button>
      <div className="lightbox-body">
        <img src={src} alt={alt} />
      </div>
    </div>
  );
}

import { type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

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

/** 読み込み中の表示。何を待っているかを文字でも出す */
export function Skeleton({ lines = 3, label = '読み込み中…' }: { lines?: number; label?: string }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label={label}>
      <p className="skeleton-label small muted">{label}</p>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  );
}

/** 空の状態。何がないのか、次に何をすればよいかを出す */
export function EmptyState({
  icon = 'info',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body small muted">{children}</div>}
      {action}
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

import { navigate, type Route } from '../lib/router';

const TABS: { to: Route; label: string; icon: string }[] = [
  { to: '/home', label: 'ホーム', icon: '⌂' },
  { to: '/setup', label: '出題', icon: '✎' },
  { to: '/stats', label: '記録', icon: '▤' },
  { to: '/settings', label: '設定', icon: '⚙' },
];

// 管理者だけに出すタブ（SPEC §4.1）。出し分けは見た目だけで、データを守るのはセキュリティルール
const ADMIN_TAB = { to: '/admin', label: '管理', icon: '☰' } as const;

export function TabBar({ route, admin = false }: { route: Route; admin?: boolean }) {
  const tabs = admin ? [...TABS, ADMIN_TAB] : TABS;
  return (
    <nav className="tabbar" aria-label="メインメニュー">
      {tabs.map((t) => {
        const active = route === t.to || (t.to === '/setup' && route === '/result');
        return (
          <button
            key={t.to}
            type="button"
            className={`tab ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(t.to)}
          >
            <span className="tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

import { navigate, type Route } from '../lib/router';

const TABS: { to: Route; label: string; icon: string }[] = [
  { to: '/home', label: 'ホーム', icon: '⌂' },
  { to: '/setup', label: '出題', icon: '✎' },
  { to: '/stats', label: '記録', icon: '▤' },
  { to: '/settings', label: '設定', icon: '⚙' },
];

export function TabBar({ route }: { route: Route }) {
  return (
    <nav className="tabbar" aria-label="メインメニュー">
      {TABS.map((t) => {
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

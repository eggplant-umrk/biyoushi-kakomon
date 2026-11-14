import { navigate, type Route } from '../lib/router';
import { Icon, type IconName } from './Icon';

const TABS: { to: Route; label: string; icon: IconName; also?: Route[] }[] = [
  { to: '/home', label: 'ホーム', icon: 'home' },
  { to: '/setup', label: '解く', icon: 'pencil', also: ['/result'] },
  { to: '/read', label: '読む', icon: 'book' },
  { to: '/stats', label: '記録', icon: 'chart' },
  { to: '/settings', label: '設定', icon: 'gear' },
];

// 管理者だけに出すタブ（SPEC §4.1）。出し分けは見た目だけで、データを守るのはセキュリティルール
const ADMIN_TAB: { to: Route; label: string; icon: IconName; also?: Route[] } = { to: '/admin', label: '管理', icon: 'shield' };

export function TabBar({ route, admin = false }: { route: Route; admin?: boolean }) {
  const tabs = admin ? [...TABS, ADMIN_TAB] : TABS;
  return (
    <nav className="tabbar" aria-label="メインメニュー">
      <div className="tabbar-inner">
        {tabs.map((t) => {
          const active = route === t.to || (t.also ?? []).includes(route);
          return (
            <button
              key={t.to}
              type="button"
              className={`tab ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(t.to)}
            >
              <Icon name={t.icon} size={24} />
              <span className="tab-label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

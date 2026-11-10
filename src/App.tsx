import { useEffect } from 'react';
import { Skeleton } from './components/common';
import { TabBar } from './components/TabBar';
import { useAuth } from './lib/auth';
import { navigate, useRoute, type Route } from './lib/router';
import { useSettings } from './lib/settings';
import { AdminScreen } from './screens/AdminScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { QuizScreen } from './screens/QuizScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';
import { StatsScreen } from './screens/StatsScreen';

const WITH_TABS: readonly Route[] = ['/home', '/setup', '/result', '/stats', '/settings', '/admin'];

export default function App() {
  const route = useRoute();
  const { guest } = useSettings();
  const auth = useAuth();

  const loading = auth.status === 'loading';
  // ログイン中か、「ログインせずに使う」を選んでいれば中に入れる
  const entered = auth.status === 'signedIn' || (auth.status === 'off' && guest);

  useEffect(() => {
    if (loading) return;
    if (route === '/' && entered) navigate('/home', { replace: true });
    if (route !== '/' && !entered) navigate('/', { replace: true });
    // 管理タブは管理者だけ。表示の出し分けで、データを守るのはセキュリティルール（SPEC §7）
    if (route === '/admin' && entered && !auth.isAdmin) navigate('/home', { replace: true });
  }, [route, entered, loading, auth.isAdmin]);

  // 画面が変わったら先頭へスクロール
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  if (loading) {
    return (
      <div className="app">
        <main className="main">
          <div className="screen">
            <Skeleton lines={6} />
          </div>
        </main>
      </div>
    );
  }

  const showTabs = entered && WITH_TABS.includes(route);

  return (
    <div className={`app ${showTabs ? 'has-tabs' : ''}`}>
      <main className="main">
        {route === '/' && <LoginScreen />}
        {route === '/home' && <HomeScreen />}
        {route === '/setup' && <SetupScreen />}
        {route === '/quiz' && <QuizScreen />}
        {route === '/result' && <ResultScreen />}
        {route === '/stats' && <StatsScreen />}
        {route === '/settings' && <SettingsScreen />}
        {route === '/admin' && auth.isAdmin && <AdminScreen />}
      </main>
      {showTabs && <TabBar route={route} admin={auth.isAdmin} />}
    </div>
  );
}

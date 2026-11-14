import { lazy, Suspense, useEffect } from 'react';
import { Skeleton } from './components/common';
import { TabBar } from './components/TabBar';
import { useAuth } from './lib/auth';
import { navigate, useRoute, type Route } from './lib/router';
import { useSettings } from './lib/settings';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { QuizScreen } from './screens/QuizScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';

// 最初の画面（ホーム・解く・出題）に要らない画面は、使うときに読み込む（初回表示を軽くする）
const AdminScreen = lazy(() => import('./screens/AdminScreen').then((m) => ({ default: m.AdminScreen })));
const StatsScreen = lazy(() => import('./screens/StatsScreen').then((m) => ({ default: m.StatsScreen })));
const ReadScreen = lazy(() => import('./screens/ReadScreen').then((m) => ({ default: m.ReadScreen })));
const Onboarding = lazy(() => import('./components/Onboarding').then((m) => ({ default: m.Onboarding })));

const WITH_TABS: readonly Route[] = ['/home', '/setup', '/result', '/read', '/stats', '/settings', '/admin'];

export default function App() {
  const route = useRoute();
  const { guest, onboarded } = useSettings();
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
            <Skeleton lines={6} label="準備しています…" />
          </div>
        </main>
      </div>
    );
  }

  const showTabs = entered && WITH_TABS.includes(route);

  return (
    <div className={`app ${showTabs ? 'has-tabs' : ''}`}>
      <main className="main">
        <Suspense
          fallback={
            <div className="screen">
              <Skeleton lines={6} />
            </div>
          }
        >
          {route === '/' && <LoginScreen />}
          {route === '/home' && <HomeScreen />}
          {route === '/setup' && <SetupScreen />}
          {route === '/quiz' && <QuizScreen />}
          {route === '/result' && <ResultScreen />}
          {route === '/read' && <ReadScreen />}
          {route === '/stats' && <StatsScreen />}
          {route === '/settings' && <SettingsScreen />}
          {route === '/admin' && auth.isAdmin && <AdminScreen />}
        </Suspense>
      </main>
      {showTabs && <TabBar route={route} admin={auth.isAdmin} />}
      {/* 初回だけ、ホームで1画面の説明を出す（スキップできる） */}
      {entered && route === '/home' && !onboarded && (
        <Suspense fallback={null}>
          <Onboarding />
        </Suspense>
      )}
    </div>
  );
}

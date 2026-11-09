import { useEffect } from 'react';
import { TabBar } from './components/TabBar';
import { navigate, useRoute, type Route } from './lib/router';
import { useSettings } from './lib/settings';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { QuizScreen } from './screens/QuizScreen';
import { ResultScreen } from './screens/ResultScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SetupScreen } from './screens/SetupScreen';
import { StatsScreen } from './screens/StatsScreen';

const WITH_TABS: readonly Route[] = ['/home', '/setup', '/result', '/stats', '/settings'];

export default function App() {
  const route = useRoute();
  const { guest } = useSettings();

  // フェーズ1はゲストモードのみ。ゲストを選んでいなければログイン画面へ、選んでいればホームへ
  useEffect(() => {
    if (route === '/' && guest) navigate('/home', { replace: true });
    if (route !== '/' && !guest) navigate('/', { replace: true });
  }, [route, guest]);

  // 画面が変わったら先頭へスクロール
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const showTabs = guest && WITH_TABS.includes(route);

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
      </main>
      {showTabs && <TabBar route={route} />}
    </div>
  );
}

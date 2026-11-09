import { Footer } from '../components/common';
import { navigate } from '../lib/router';
import { updateSettings } from '../lib/settings';

export function LoginScreen() {
  return (
    <div className="screen login">
      <div className="login-hero">
        <div className="login-logo" aria-hidden="true">
          ✂
        </div>
        <h1>美容師国家試験 過去問トレーナー</h1>
        <p className="muted">第41回〜第54回（新制度）の筆記試験をスマホで</p>
      </div>

      <div className="login-actions">
        <button type="button" className="btn btn-secondary" disabled aria-describedby="login-soon">
          Googleでログイン
        </button>
        <p id="login-soon" className="small muted center">
          Googleログインは準備中です
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            updateSettings({ guest: true });
            navigate('/home');
          }}
        >
          ログインせずに使う
        </button>
        <p className="small notice">
          学習記録はクラウドに保存され、作成者が問題の改善や苦手分析に使います。
          ログインせずに使う場合、記録はこの端末の中だけに保存されます。
        </p>
      </div>
      <Footer />
    </div>
  );
}

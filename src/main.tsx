import { StrictMode } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initAuth } from './lib/auth';
import { applyToDocument, getSettings } from './lib/settings';
import './styles.css';

// 他サイトへの埋め込み（クリックジャッキング）対策。<meta> の CSP では frame-ancestors が効かないため（SPEC §8.3）
if (window.top !== window.self) {
  document.body.replaceChildren();
} else {
  applyToDocument(getSettings());
  initAuth();
  // Service Worker を登録する。新しい版が有効になったら、このページを自動で読み込み直す
  // （出題中でも、解答は1問ごとに端末内へ保存しているので続きから再開できる）
  registerSW({ immediate: true });
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

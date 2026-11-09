import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyToDocument, getSettings } from './lib/settings';
import './styles.css';

// 他サイトへの埋め込み（クリックジャッキング）対策。<meta> の CSP では frame-ancestors が効かないため（SPEC §8.3）
if (window.top !== window.self) {
  document.body.replaceChildren();
} else {
  applyToDocument(getSettings());
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

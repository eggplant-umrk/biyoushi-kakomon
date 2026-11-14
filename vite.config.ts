/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のリポジトリ名（https://eggplant-umrk.github.io/biyoushi-kakomon/）
const BASE = '/biyoushi-kakomon/';

/**
 * CSP（SPEC §8.3）。GitHub Pages はレスポンスヘッダーを設定できないので <meta> で入れる。
 * 開発サーバーは React Fast Refresh のインラインスクリプトを使うため、本番ビルドにだけ入れる。
 *
 * 外部のドメインは、Firebase の設定値（VITE_FIREBASE_*）があるビルドにだけ、使うものだけを足す：
 * - Google ログイン（ポップアップ）: apis.google.com のスクリプトと、{authDomain} の iframe
 * - Firestore / Authentication / App Check の API
 * - reCAPTCHA Enterprise（App Check の Fraud Defense）: www.google.com/recaptcha/（enterprise.js を含む）と www.gstatic.com/recaptcha/
 * E2E 用ビルド（--mode e2e）は Firebase Emulator（localhost）だけを足す。
 */
export function buildCsp(mode: string, env: Record<string, string>): string {
  const script = ["'self'"];
  const connect = ["'self'"];
  const frame: string[] = [];
  if (mode === 'e2e') {
    connect.push('http://localhost:9099', 'http://localhost:8080');
  } else if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN) {
    script.push('https://apis.google.com', 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/');
    connect.push(
      'https://firestore.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://content-firebaseappcheck.googleapis.com',
      'https://www.google.com/recaptcha/',
    );
    frame.push(
      `https://${env.VITE_FIREBASE_AUTH_DOMAIN}`,
      'https://www.google.com/recaptcha/',
      'https://recaptcha.google.com/recaptcha/',
    );
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    `frame-src ${frame.length ? frame.join(' ') : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

function cspMeta(csp: string): Plugin {
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      // charset の直後（どのスクリプトよりも前）に置く
      handler: (html) =>
        html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        ),
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: BASE,
  plugins: [
    react(),
    cspMeta(buildCsp(mode, loadEnv(mode, process.cwd(), 'VITE_'))),
    VitePWA({
      registerType: 'autoUpdate',
      // 登録は src/main.tsx の virtual:pwa-register で行う（バンドルされた外部ファイルになるので、インラインスクリプトは出ない）。
      // 新しい版の Service Worker はすぐに有効になり、開いているページは自動で読み込み直される。
      // 以前の registerSW.js だけの登録では、新しい版が「待機中」のまま、アプリを完全に閉じるまで切り替わらなかった
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: '美容師国家試験 過去問トレーナー',
        short_name: '美容師過去問',
        description: '美容師国家試験（筆記）の過去問をスマホで解ける学習アプリ（非公式・個人作成）',
        lang: 'ja',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#b0436e',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 問題データ（JSON）と図（WebP）もプリキャッシュしてオフラインで解けるようにする
        globPatterns: ['**/*.{js,css,html,svg,png,webp,json,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        // 新しい版をすぐ有効にする（待機させない）。開いているページの読み込み直しは virtual:pwa-register が行う
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
  },
}));

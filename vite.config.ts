/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のリポジトリ名（https://eggplant-umrk.github.io/biyoushi-kakomon/）
const BASE = '/biyoushi-kakomon/';

/**
 * CSP（SPEC §8.3）。GitHub Pages はレスポンスヘッダーを設定できないので <meta> で入れる。
 * 開発サーバーは React Fast Refresh のインラインスクリプトを使うため、本番ビルドにだけ入れる。
 * フェーズ1は Firebase を使わないので 'self' のみ。Firebase を入れるフェーズ3で
 * Google / Firebase / reCAPTCHA のドメインを追加する。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      // charset の直後（どのスクリプトよりも前）に置く
      handler: (html) =>
        html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        ),
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    cspMeta(),
    VitePWA({
      registerType: 'autoUpdate',
      // インラインスクリプトを出さないよう、登録コードを外部ファイル（registerSW.js）にする
      injectRegister: 'script',
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
      },
    }),
  ],
  build: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
  },
});

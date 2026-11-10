/**
 * ビルド時に決まる設定（.env.local / GitHub Secrets の VITE_ で始まる値）。
 * ここに入る値はビルド後の JS に含まれ、だれでも読める。秘密の値（管理者メールなど）は入れないこと（SPEC §6.5 / §8.4）。
 */
/**
 * E2E テスト用のビルド（`vite build --mode e2e`）。Firebase Emulator につなぐ。本番にはデプロイしない。
 * import.meta.env.VITE_… はビルド時に値そのものへ置き換わるので、本番ビルドではここが false になり、
 * Emulator 用のコードはビルド結果から消える（CI の scripts/check-dist.sh で確認している）。
 */
export const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === '1';

export const RECAPTCHA_SITE_KEY: string = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';

export const firebaseConfig = USE_EMULATOR
  ? { apiKey: 'demo-api-key', authDomain: 'demo-kakomon.firebaseapp.com', projectId: 'demo-kakomon', appId: 'demo-app' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
    };

/**
 * ログイン（＝クラウドへの記録の保存）を使えるか。
 * 本番では Firebase の設定値と App Check（Fraud Defense＝reCAPTCHA Enterprise）のサイトキーが両方そろっているときだけ有効にする。
 * App Check なしで Firestore を使う状態を作らないため。
 */
export const LOGIN_ENABLED =
  USE_EMULATOR || (firebaseConfig.apiKey !== '' && firebaseConfig.projectId !== '' && RECAPTCHA_SITE_KEY !== '');

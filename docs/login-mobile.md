# スマホでの Google ログイン（2026-11-15）

## 起きたこと

iPhone で「Googleでログイン」を押し、Google で認証したあと、`biyoushi-kakomon.firebaseapp.com` のページに次のエラーが出て、アプリに戻れなかった。

> Unable to process request due to missing initial state. ...

## 原因

- **アプリはリダイレクト（`signInWithRedirect`）を一度も使っていない**。ログインは `signInWithPopup` だけ（`src/lib/cloud.ts`）。アプリ側に、リダイレクトに切り替える条件はない。
- ただし Firebase の SDK（`@firebase/auth` 13.2.0）は、**iPhone のホーム画面に追加したアプリ（`navigator.standalone`）では、ポップアップを開かずに、ログイン用のページ（`{authDomain}/__/auth/handler`）を普通のリンクとして開く**（SDK の `_open` → `_isIOSStandalone` → `openAsNewWindowIOS`）。
  - このページは Safari 側に開くので、アプリ（呼び出し元）との結びつきがなくなる。Google から戻ったログイン用のページは、ポップアップとしての呼び出し元がないので「最初の状態がない」と判断してエラーになる。エラー文の「ストレージが分離されたブラウザでのリダイレクト」の説明と同じ状態になる。
  - Safari とホーム画面のアプリは保存領域が別なので、Safari 側でログインが終わっても、ホーム画面のアプリはログインした状態にならない。
- **Safari・Chrome でも起こりうること**：SDK は、ポップアップを開く直前に App Check のトークンを取りに行く（`_getRedirectUrl` → `_getAppCheckToken`）。初回はトークンの取得（reCAPTCHA Enterprise）に時間がかかるので、タップからポップアップまでの間が空き、iPhone の Safari がポップアップをブロックすることがある。ブロックされたポップアップを利用者が手で開くと、呼び出し元とのつながりのない新しいタブになり、同じエラーになりうる。
- **App Check（Authentication への強制）**：上のとおり、ポップアップの開くのが遅れる原因にはなりうる。トークンが取れないときは、エラーは Google の認証のあと（`auth/firebase-app-check-token-is-invalid` など）に出るので、今回のエラー文の直接の原因ではない。

## 直した内容（PR：`fix/mobile-login`）

1. **リダイレクトを使わない方針を明記**し、ポップアップだけにした（もともとリダイレクトのコードはない）。
2. **タップの処理の中で、待たずにポップアップを開く**：ログイン用の部品を読み込み済みなら、`signInWithPopup` を await を挟まずに呼ぶ（`src/lib/auth.ts` の `login`）。
3. **App Check のトークンを先に取る**：ログイン画面を開いた時点で `getToken` を呼んでおき、ポップアップを開く直前の待ち時間をなくす（`src/lib/cloud.ts` の `prepare`）。
4. **ポップアップがブロックされたとき**：リダイレクトに切り替えず、「ポップアップを許可してから、もう一度押してください」と、iPhone の Safari・Chrome、Android の Chrome での許可のしかたを出す。
5. **iPhone のホーム画面に追加したアプリ**：ポップアップが開けないので、ログインボタンの代わりに「ログインは Safari で行ってください」と「Safari で開く」を出す（ログインせずには、そのまま使える）。
6. **アプリ内ブラウザ（LINE など）**：これまでどおり、外部ブラウザで開く案内（URL のコピー）を出す。
7. テスト：ポップアップのブロック・閉じたとき・ホーム画面のアプリ・ふつうの Safari の E2E（`e2e/login-popup.spec.ts`）と、判定の単体テスト（`src/lib/inapp.test.ts`）。

Firestore ルール、App Check、認証の設定、CSP は変えていない。

## 代替案の比較（まだ実装していない）

ホーム画面に追加したアプリ（iPhone）でもログインできるようにしたい場合は、Firebase のログイン用のページ（firebaseapp.com）を使わない方式が必要になる。

| | A. 今回の方式（ポップアップ＋案内） | B. Google Identity Services（GIS）＋ `signInWithCredential` | C. ログイン用のページを同じサイトに置く | D. `signInWithRedirect` |
|---|---|---|---|---|
| しくみ | Firebase のポップアップ | Google のスクリプトでページの中で ID トークンを受け取り、Firebase に渡す | `{authDomain}` をアプリと同じサイトにする | Firebase のリダイレクト |
| iPhone の Safari・Chrome | 通る見込み（要実機確認） | 通る見込み | 通る | ストレージの分離で失敗しやすい（今回のエラー） |
| ホーム画面のアプリ（iPhone） | 通らない（Safari への案内を出す） | 通る可能性がある（GIS のポップアップの動きは要実機確認） | 通る | 失敗しやすい |
| Android の Chrome | 通る見込み | 通る見込み | 通る | 失敗しやすい |
| CSP の追加 | なし | `script-src https://accounts.google.com/gsi/client`、`frame-src`・`connect-src https://accounts.google.com/gsi/`、`style-src https://accounts.google.com/gsi/style` | なし | なし |
| 追加のスクリプト | なし（今の apis.google.com のまま） | Google の GIS スクリプト（ページ内で動く。今の apis.google.com と同じく Google のもの） | なし | なし |
| コンソールの操作 | なし | Google Cloud で OAuth クライアント ID の「承認済みの JavaScript 生成元」に `https://eggplant-umrk.github.io` を足す（梅澤さんの操作） | 独自ドメインが必要 | なし |
| 手間 | 済み | 半日〜1日（GIS の読み込み、ボタン、E2E の作り直し、実機確認） | GitHub Pages の `/__/auth/` はリポジトリの下に置けないので、独自ドメインが要り、大きい | 小さいが、直らない |

**おすすめ**：まず A（今回の修正）で、iPhone の Safari・Chrome と Android の Chrome で通るかを実機で確かめる。ホーム画面のアプリでもログインが必要なら、B を検討する（実装の前に確認をとる）。

## 実機で確認してほしい手順

準備：PR `fix/mobile-login` をマージする前に確かめる場合は、PR のプレビューがないので、マージ後に本番で確かめる（問題があれば戻す）。各手順のあと、設定 → ログアウトで元に戻す。

1. **iPhone の Safari**
   1. Safari で https://eggplant-umrk.github.io/biyoushi-kakomon/ を開く（ホーム画面のアイコンからではなく）
   2. 「Googleでログイン」を押す → 新しいタブで Google のアカウント選択が開く
   3. アカウントを選ぶ → タブが閉じて、アプリのホームに戻り、ログインした状態になる
   4. ブロックされた案内が出たら：「設定」アプリ →「アプリ」→「Safari」→「ポップアップブロック」をオフにして、もう一度押す（結果を教えてください）
2. **iPhone の Chrome**：1 と同じ。ブロックされたら Chrome の「設定」→「コンテンツの設定」→「ポップアップをブロック」をオフ
3. **iPhone のホーム画面に追加したアプリ**
   1. Safari の共有ボタン →「ホーム画面に追加」で追加し、ホーム画面のアイコンから開く
   2. ログイン画面に「ログインは Safari で行ってください」と「Safari で開く」が出て、「Googleでログイン」は出ないこと
   3. 「ログインせずに使う」でそのまま使えること
4. **Android の Chrome**：1 と同じ手順。アカウント選択はポップアップ（または新しいタブ）で開き、選んだあとアプリに戻る。ブロックされたらアドレスバーの「ポップアップがブロックされました」から「常に許可」
5. **Android のホーム画面に追加したアプリ**（任意）：ホーム画面のアイコンから開き、1 と同じ手順でログインできるか
6. **LINE のアプリ内ブラウザ**：LINE のトークにURLを送って開く → 「Googleログインは Safari / Chrome で開いてください」と「URLをコピー」が出ること
7. ログインしたあと、ホームで問題を1問解き、別の端末で同じアカウントでログインして、記録が見えること

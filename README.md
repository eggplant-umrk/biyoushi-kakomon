# 美容師国家試験 過去問トレーナー

美容師国家試験（筆記）の過去問をスマホで解ける学習Webアプリです（非公式・個人作成）。
仕様は [docs/SPEC.md](docs/SPEC.md) を参照してください。

公開URL: https://eggplant-umrk.github.io/biyoushi-kakomon/

## 開発

```sh
npm ci
npm run dev          # 開発サーバー
npm run typecheck    # 型チェック
npm test             # 単体テスト（Vitest）
npm run test:e2e     # E2E（Playwright：iPhone・Pixel エミュレーション。初回は npx playwright install chromium webkit）
npm run build        # 本番ビルド（dist/）
```

- Node.js 24 以上
- `main` への push で GitHub Actions がテスト → GitHub Pages にデプロイします。`main` は保護されているので、変更はブランチを切って PR で入れてください。
- PWA アイコンの再生成: `python scripts/make-icons.py`（PyMuPDF が必要）
- リポジトリ設定（ブランチ保護など）のやり直し: `bash scripts/setup/github.sh`

## 出典

問題：公益財団法人 理容師美容師試験研修センター「過去の筆記試験問題」。解説は独自に作成したもので、公式のものではありません。

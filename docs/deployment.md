# GitHub Pages — main + develop preview

このリポジトリでは GitHub Actions により、**1つのPagesサイトに2つのブランチを同時公開**します。

| ブランチ | 公開URL | 用途 |
| --- | --- | --- |
| main | https://naoiw.github.io/td4/ | 本番 |
| develop | https://naoiw.github.io/td4/develop/ | 未マージ変更のプレビュー |

## 初回設定（リポジトリ管理者）

GitHub の [Settings → Pages](https://github.com/naoiw/td4/settings/pages) を開き、**Build and deployment → Source を「GitHub Actions」**に変更します。
「Deploy from a branch / main / (root)」のままでは、developのプレビューは公開されません。

設定後、[Actions → Deploy GitHub Pages](https://github.com/naoiw/td4/actions/workflows/deploy-pages.yml) から `main` を選択して **Run workflow** すれば初回の再デプロイができます。初回デプロイ成功後は通常、手動操作不要です。

## 自動公開の動作

- **mainへpush（マージ含む）**：mainとdevelopを取得し、両方のビルド・テストを実行して1つのPagesアーティファクトにまとめてデプロイします。
- **developへpush**：`Validate develop` が検証し、成功するとmainの `Deploy GitHub Pages` が起動します。developの未マージ変更は `/develop/` だけへ適用され、本番はmainから再生成されます。
- **PR作成／更新**：`Validate develop` による検証のみ。PRを作っただけでは新たなPagesデプロイを行いません。
- **手動実行**：デプロイ用ワークフローをmainで手動実行できます。

Pagesの公開アーティファクト内：

```text
publish/
├── .nojekyll
├── index.html          # main
├── assets/             # main
└── develop/
    ├── index.html      # develop
    └── assets/         # develop
```

どちらのHTMLも相対URL（`assets/...`）を使用しているため、`/td4/` と `/td4/develop/` の両方でそのまま読み込めます。生成物にはソースやテストを含めず、エミュレータのWebファイルだけを置きます。

## 開発時の手順

1. developへ変更をpushし、`Validate develop` と `Deploy GitHub Pages` の成功を確認する。
2. https://naoiw.github.io/td4/develop/ で操作を確認する。
3. 問題がなければdevelopのPRをmainにマージする。
4. https://naoiw.github.io/td4/ に反映されたことを確認する。

ソースは `src/**/*.ts`、JavaScript生成物は `assets/js/**`、スタイルは `assets/css/**` に置きます。ビルド時は `pnpm install --frozen-lockfile` → `pnpm run verify`（型チェック＋テスト込み）を実行します。パッケージマネージャーは `package.json` で `pnpm@9.14.2` に固定し、`pnpm-lock.yaml` をコミットします。追加のVite・Reactは使いません。

## 開発・CIのパッケージ管理

- ローカルでは Node.js 22以降と pnpm 9.14.2 を使用し、`pnpm install --frozen-lockfile`、`pnpm run verify` を実行します。
- `Validate develop` は共有CIに `package-manager: pnpm` と `pnpm-version: "9.14.2"` を渡します。
- Pagesは `main` / `develop` をそれぞれ pnpm でインストール・ビルド・検証します。`main` にワークフロー修正をマージするまで、Pagesのデプロイは移行前の `main` の設定で実行される点に注意してください。
- npmのロックファイルは管理せず、`pnpm-lock.yaml` のみを使用します。

## 注意

- 既存のGitHub Pagesの**公開元設定だけは管理者がUIから切り替える必要があります**。
- 先行してworkflowをmainに配置しても、設定変更前のActionsデプロイは失敗する可能性があります。設定を変更して手動再実行してください。
- 2つのブランチは別のPagesサイトではなく、同じサイトのルートとサブディレクトリです。

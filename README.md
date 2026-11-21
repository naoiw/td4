# TD4 — Web Emulator

> 『CPUの創りかた』に登場する4bit CPU「TD4」を、ブラウザ上で実行し、74HCロジックIC・ROMスイッチ・信号の変化を観察できるエミュレータです。

## 公開URL

| 環境 | ブランチ | URL | 状態 |
| --- | --- | --- | --- |
| 本番 | `main` | https://naoiw.github.io/td4/ | 公開中 |
| 開発プレビュー | `develop` | https://naoiw.github.io/td4/develop/ | 公開中 |

1つのGitHub Pagesサイトで本番と開発プレビューを同時公開しています。開発版への変更は、本番へのマージ前に `/develop/` で確認できます。

## 主な機能

- **74HCロジックICを可視化**：13個のICを機能別に表示。左列にMUX / ALU・REGISTERS・CLOCK / CONTROL、中央列に74HC154と74HC540を配置します。
- **DIPパッケージと信号表示**：DIP-14 / 16 / 20 / 24のピン本数とピッチ比を表現。脚のHは緑、Lは灰色、未モデル化の脚は縞模様です。ICをクリックすると基板の下に拡大した入出力詳細を表示し、信号を追跡できます。
- **16×8bit ROMを直接編集**：128個のスイッチを横置き8bit DIP×16組、4行×4列に配置。現在選択中のアドレスを74HC154の負論理出力に対応するLEDで示します。
- **4bit入出力と基板表示**：ROMの下にINPUTスイッチとOUTPUT LEDを横並びで配置。緑レジスト風の基板、四隅の取付穴、従来のCPU機能ブロック図も備えています。
- **CPUの実行・デバッグ**：自動実行、停止、リセット、1クロック実行、速度切替、ブレークポイント、実行履歴を利用できます。
- **論理波形の観察**：クロック・キャリー・レジスタ・ROM・ALUなどをH/Lで確認し、4グループの波形を直近80サンプルまで表示します。
- **プログラム編集**：8種類のサンプルプログラム、アセンブラ、16バイトROMのバイナリ読み書きに対応します。

**シミュレーション範囲**：TD4の命令実行と理想的な論理H/Lをモデル化しています。実ICの伝搬遅延・グリッチ・電圧波形や、実基板の全ネットリストを再現するものではありません。端子詳細の機能配置は、実物のパッケージ上の端子位置とは別です。

## 技術スタック

- **TypeScript 5.8.3（strict）**：CPU、アセンブラ、信号、IC回路、基板表示、アプリ制御
- **Vanilla JavaScript / DOM / SVG / CSS**：React・Vite・バンドラーを使わない静的Webアプリ
- **Node.js 26 / npm**：GitHub Actionsでのビルド・型チェック・テスト（ローカル開発はNode.js 22以降）
- **GitHub Actions / GitHub Pages**：`main` の本番公開と `develop` のプレビューを同時配信

実行時の外部ライブラリ・バックエンドは不要です。

## ローカル開発

Node.js 22以降とnpmを使用します。

```bash
npm ci
npm run build
```

ビルドは `src/**/*.ts` を `assets/js/` に出力します。ブラウザから `index.html` を開いて確認できます。

変更時のチェック：

```bash
npm run typecheck
npm test
npm run verify
```

- `src/` がTypeScriptの編集元、`assets/js/` は生成物です。**生成JavaScriptを直接編集せず**、ビルド後に生成物もコミットしてください。
- スタイルは `assets/css/style.css` から `foundation.css`・`workbench.css`・`circuit-board.css` を順に読み込みます。
- `src/ui/app.ts` はCPU状態・実行制御、`src/ui/board.ts` はDIP・ROMのDOM生成とH/L・配線描画を担当します。
- `npm run verify` はビルド・型チェック・Node.jsテストをまとめて実行します。

## 公開と開発フロー

1. `develop` で実装し、Pull Requestで変更内容を管理します。
2. `Validate develop` の成功後、GitHub Actionsが本番・プレビュー両方をビルドしてPagesへ公開します。
3. [開発プレビュー](https://naoiw.github.io/td4/develop/) で表示・操作を確認します。
4. 問題がなければ `main` にマージし、[本番ページ](https://naoiw.github.io/td4/) を確認します。

GitHub Pagesの公開元は **Settings → Pages → Build and deployment → GitHub Actions** です。デプロイは `main` へのpush、または `develop` のpush検証成功後に実行され、`/td4/` と `/td4/develop/` を1つの公開アーティファクトへまとめます。

- CI：`.github/workflows/validate-develop.yml`（`naoiw/.github` の共通Node.js CIをSHA固定で利用）
- Pages：`.github/workflows/deploy-pages.yml`
- 詳細：[デプロイ手順](docs/deployment.md)

## 依存関係の保守

- パッケージ管理は **npm** です。`package-lock.json` を使用し、依存関係を更新した場合はロックファイルもコミットします（pnpmは使用しません）。
- TypeScriptは `package.json` でバージョン固定しています。更新時は `npm run verify` と `develop` プレビューで確認してください。
- GitHub Actionsの共通CIはコミットSHAに固定しているため、更新時には `naoiw/.github` 側の変更を確認し、Pull Requestで検証します。
- 現時点ではリポジトリに `dependabot.yml` はありません。Dependabotによる定期更新や自動マージを設定済みとは扱いません。

## ドキュメント

- [アーキテクチャ・IC信号モデル・画面構成](docs/architecture.md)
- [開発・GitHub Pagesデプロイ](docs/deployment.md)
- [共通開発規約](https://github.com/naoiw/.github)

## ライセンス

[Apache License 2.0](LICENSE)

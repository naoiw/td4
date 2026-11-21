# TD4 — Web Emulator

『CPUの創りかた』に登場する4bit CPU「TD4」を、ブラウザで動かしながらロジックIC・ROM・信号の状態を観察できるエミュレータです。

**[エミュレータを開く（本番）](https://naoiw.github.io/td4/)** ／ [開発プレビュー](https://naoiw.github.io/td4/develop/)

## 主な機能

- **CPU実行・デバッグ**：電源のON/OFF、実行・停止、2Hz/10Hz切替、ブレークポイント、実行履歴。
- **74HCロジックICの可視化**：13個のICを基板上に配置し、各端子のH/LやICごとの入出力詳細を確認。
- **ROMと入出力の操作**：16×8bit ROMのDIPスイッチ編集、4bit INPUTスイッチ、OUTPUT LED。
- **信号波形の観察**：クロック・レジスタ・ALU・ROMなどの論理波形を切り替えて表示。
- **プログラム編集**：アセンブラ、サンプルプログラム、ROMとソースコードの相互操作。

操作方法・各画面の詳細は [操作ガイド](docs/usage.md) を参照してください。

> 実行するのはTD4の命令と理想的な論理H/Lです。実ICの電圧・伝搬遅延や完全な基板配線を再現するものではありません。

## 技術構成

- TypeScript（strict）＋ Vanilla JavaScript / DOM / SVG / CSS。React・Vite・バンドラーなし
- Node.js 26・pnpm 9.14.2（CI）。ローカル開発はNode.js 22以降
- GitHub Actions / GitHub Pages。実行時の外部ライブラリ・バックエンド不要

## ローカル開発

Node.js 22以降と **pnpm 9.14.2** を使用します。

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run lint
pnpm test
```

TypeScriptの編集元は `src/`、生成JavaScriptは `assets/js/` です。生成物を直接編集せず、ビルド後に一緒にコミットします。まとめて検証する場合は `pnpm run verify` を使用します。

## ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [操作ガイド](docs/usage.md) | 操作方法・画面の機能・制限事項 |
| [設計・実装仕様](docs/architecture.md) | CPU・IC・波形モデル、画面構造、コードの責務 |
| [ネットリスト](docs/netlist.md) | 部品端子・電気ネット・接続の確定状況 |
| [開発・デプロイ](docs/deployment.md) | pnpm、ブランチ運用、CI、Pages公開 |
| [共通開発規約](https://github.com/naoiw/.github) | リポジトリ共通の開発方針 |

## ライセンス

[Apache License 2.0](LICENSE)

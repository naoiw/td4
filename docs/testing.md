# テスト戦略

TD4のテストは **命令の振る舞い**、**UIロジックの振る舞い**、**HTML/CSSの静的構造**、**配布物の整合性**を分けて考えます。バンドラーやブラウザ実行時のテスト用コードは追加しません。

## ローカル実行

```bash
pnpm install --frozen-lockfile
pnpm test            # ネットリスト生成 + 型チェック + Node.js test runner
pnpm run verify      # ネットリスト生成 + JSビルド + 型チェック + 全テスト
pnpm run lint        # スタイルとフォーマットの検証
```

`tests/*.cjs` がNode.jsのテストエントリポイントです。`tests/helpers/` は共通のテスト補助コードで、テストとして個別実行しません。

## テストの役割

| 対象 | 主なテスト | 検証するもの |
| --- | --- | --- |
| CPU・アセンブラ・命令 | CPUコア・サンプルプログラム系テスト | ROMの境界、演算、キャリー、ジャンプ、サンプルの全入力組合せ |
| CPU/ROM/実行履歴の画面更新 | `cpu-state.test.cjs`、`app-render.test.cjs` | 数値、変化ハイライト、ROM差分更新、TRACE最大25件、クロック1回につき命令1回 |
| オシロスコープ・トリガー | `scope-trigger.test.cjs`、`signals.test.cjs` | LIVE/ARMED/TRIGGERED/STOPPED、入力エッジ、波形80点、フリーズと再開、CPUとの独立性 |
| 基板ROM・UIの描画最適化 | `ui-refactor.test.cjs`、`app-render.test.cjs` | ROMビット編集の停止・更新が両UIで統一され、基板DIP 128個はROM未変更時に再描画しない |
| PCB・レスポンシブ・旧UIの除去 | `board-layout.test.cjs`、`legacy-ui-removal.test.cjs` | DOM/スタイルと基板配置の**静的契約**。実ブラウザでのピクセル一致は保証しない |
| Educationの教材内容 | `education-guided.test.cjs`、`education-logic.test.cjs`、`education-sequential.test.cjs`、`education-rom-decode.test.cjs`、`education-datapath.test.cjs`、`education-carry-jnc.test.cjs`、`education-ic-reference.test.cjs` | 14章の順番・目次、真理値表、クロック、ROMデコード全256バイト、CPUデータフロー、JNC旧C/新C、IC物理端子を検査 |
| 配布ファイル | `site-assets.test.cjs` | JSの依存順、CSSの参照、Educationのリンク、Pages成果物 |

### コンパイル済みUI関数のテスト

`tests/helpers/compiled-app.cjs` は、生成済み `assets/js/ui/app.js` と `assets/js/ui/board.js` をTypeScriptの構文解析APIで読み、**名前を指定した関数宣言だけ**をVMに読み込みます。`loadAppFunctions()` と `loadCompiledUIFunctions('board.js', ...)` の両方を利用できます。解析結果はファイルごとにキャッシュします。

- ソース内のコメントや関数の位置を境界として切り出さないため、説明文や別関数の追加に影響されにくくなります。
- 実際にブラウザへ配布するJavaScriptの処理をテストします。CPUやDOMのモックを必要最小限のコンテキストへ渡し、ROM未変更時にDIPの属性が再設定されないことも動作で確認します。
- `src/ui/app.ts` と `assets/js/ui/app.js` の一致は引き続きCIの「Verify generated JavaScript is committed」でチェックします。
- 本ヘルパーは**ユニット・コンポーネント相当のテスト用**です。DOMやイベントが実ブラウザで同じように描画されることまでは保証しません。

### 変更時の指針

1. CPUのアルゴリズム変更は、入力と出力、状態遷移を直接検証する。
2. UIロジック変更は、可能な限り `loadAppFunctions` で**更新結果・回数・履歴**を確認する。実装内の変数名やコメントの存在だけに依存しない。
3. DOMの配置順やCSSの寸法・ブレークポイントの指定など、構造そのものが仕様の場合に限り静的テストを使用する。
4. CSSやレスポンシブの見た目はNode.js上の文字列比較だけでは検証できない。プレビューのPC幅・狭幅、POWER、STEP、ROM DIP、波形を実ブラウザで確認する。
5. DOMの全面的なE2Eテスト（Playwright等）は未導入。必要になった時点で、CIのブラウザセットアップと実行時間を含めて別途検討する。

テストのリファクタリングでは**既存の振る舞いを変えない**ことを優先し、既存の静的レイアウト契約を一括削除しません。実装コードの描画最適化・状態管理見直しに対応する新しい動作テストと、既存レイアウトの回帰テストは併存させます。

### Lintと生成物のチェック

- `scripts/check-style.mjs` は `src/**/*.ts` のほか、Education JS/HTML、CSS、`scripts/`、`tests/`、`docs/`、GitHub ActionsのYAML、README、ルートHTML、設定JSONを対象に、行末空白・CR・タブ字下げ・最終改行を検査します。
- `pnpm run format:check` は既存のPrettier対象（`src/core/*.ts`、`src/data/*.ts`、`src/types/*.d.ts`）を検証します。`src/ui/` はこのPrettier対象には含みません。
- `assets/js/**` は生成物なのでスタイルチェックの対象から除外し、CIの `Verify generated JavaScript is committed` で再生成差分がないことを検査します。`src/data/netlist.json` は独立したネットリスト生成スクリプトによってスキーマ・ピン情報が検証されます。

### mainマージ前の確認

変更を `develop` にマージし、自動テストとPagesの成功を確認した後、[main統合前チェックリスト](release-checklist.md)の手動動作確認を行います。Node.js上のテスト成功だけで `main` に反映したと判断しないでください。

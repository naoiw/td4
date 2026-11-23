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
| PCB・レスポンシブ・旧UIの除去 | `board-layout.test.cjs`、`legacy-ui-removal.test.cjs` | DOM/スタイルと基板配置の**静的契約**。実ブラウザでのピクセル一致は保証しない |
| 配布ファイル | `site-assets.test.cjs` | JSの依存順、CSSの参照、Educationのリンク、Pages成果物 |

### コンパイル済みUI関数のテスト

`tests/helpers/compiled-app.cjs` は、生成済み `assets/js/ui/app.js` をTypeScriptの構文解析APIで読み、**名前を指定した関数宣言だけ**をVMに読み込みます。

- ソース内のコメントや関数の位置を境界として切り出さないため、説明文や別関数の追加に影響されにくくなります。
- 実際にブラウザへ配布するJavaScriptの処理をテストします。CPUなど必要な依存は明示的にテスト用コンテキストへ渡します。
- `src/ui/app.ts` と `assets/js/ui/app.js` の一致は引き続きCIの「Verify generated JavaScript is committed」でチェックします。
- 本ヘルパーは**ユニット・コンポーネント相当のテスト用**です。DOMやイベントが実ブラウザで同じように描画されることまでは保証しません。

### 変更時の指針

1. CPUのアルゴリズム変更は、入力と出力、状態遷移を直接検証する。
2. UIロジック変更は、可能な限り `loadAppFunctions` で**更新結果・回数・履歴**を確認する。実装内の変数名やコメントの存在だけに依存しない。
3. DOMの配置順やCSSの寸法・ブレークポイントの指定など、構造そのものが仕様の場合に限り静的テストを使用する。
4. CSSやレスポンシブの見た目はNode.js上の文字列比較だけでは検証できない。プレビューのPC幅・狭幅、POWER、STEP、ROM DIP、波形を実ブラウザで確認する。
5. DOMの全面的なE2Eテスト（Playwright等）は未導入。必要になった時点で、CIのブラウザセットアップと実行時間を含めて別途検討する。

テストのリファクタリングでは**既存の振る舞いを変えない**ことを優先し、既存の静的レイアウト契約を一括削除しません。実装コードの描画最適化・状態管理見直しに対応する新しい動作テストと、既存レイアウトの回帰テストは併存させます。

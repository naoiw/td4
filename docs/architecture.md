# TD4のCPU・信号モデル

## 基本構成

TD4は4bitレジスタA/B、4bitのPC、キャリーフラグ、4bit入力スイッチ、4bit LED出力、16×8bit ROMから構成されます。本実装はCPUを命令単位で模擬し、元の74HC153に基づく入力MUXと4bit加算の動作を再現します（非公式な命令バイトも含む）。

命令バイトを上位4bit `op`、下位4bit `im` とすると：

```
selectorA = ((op >> 3) & 1) | (op & 1)
selectorB = (op >> 1) & 1
source = [A, B, IN, 0][selectorB * 2 + selectorA]
sum = source + im
result = sum & 0xF
nextCarry = sum > 0xF ? 1 : 0
```

`op >> 2` により書込先がA/B/OUT/PCに選択されます。JNCは**実行前のC**を参照し、C=0のときだけジャンプします。Cは各命令で加算結果から更新されます。

## ボード表示

CSSベースのボードに、PC、ROM、A/Bレジスタ、ALU、出力ラッチ、LED、スイッチ、CLK、Cを機能ブロックとして配置しました。SVG配線は`data-wire`が指す**単一のビット**の信号を表し、Hなら明るい緑、Lなら暗い緑です。バス4bitを「全部HまたはL」と誤解させないよう、配線は`PC0`、`D0`、`IN0`、`OUT0`等に対応します。実物のプリント基板の形状・配線とは異なります。

## クロックと波形

クロックは低レベルLと高レベルHを交互に切り替えます。**L→H**で`cpu.step()`が1回呼び出されます。H→Lではレジスタ・LED出力は変化しません。手動ステップはHを約180ms表示してからLに戻します。

`src/core/signals.ts` の `snapshot(cpu, clockHigh)` が次の論理値を取得します。

- CLK、C
- A0〜A3、B0〜B3、PC0〜PC3
- IN0〜IN3、OUT0〜OUT3
- D0〜D7（現在PCのROMデータ）
- ALU0〜ALU3（現在PCの命令で行われる組み合わせ加算結果）

選択した信号グループごとに、直近80サンプルをSVGのステップ波形で描画します。長期連続実行でもメモリ使用量は固定で、画面再描画は高クロック時に制限します。スイッチ操作で非同期に入力が変化した場合も1サンプル記録します。

これらは**理想論理レベル**であり、実機のクロックデューティ、伝搬遅延、チャタリング、電圧やグリッチは表しません。時間軸は一律のサンプル順で、実時間の秒ではありません。

## サンプルプログラム

`src/data/samples.ts` にROMに収まる8種類のサンプルを収録しています。画面上部の6カードはROMロードと実行をワンクリックで行います。プログラムエディタのプルダウンから8種類すべてを選択できます。

## ファイル依存

読み込み順は`assets/js/core/td4-core.js` → `assets/js/data/samples.js` → `assets/js/core/signals.js` → `assets/js/ui/app.js`です。いずれもJavaScriptで、外部サービスへのアクセスは必要ありません。

## TypeScript移行・GitHub Pagesデプロイ

開発用ソースは `src/{core,data,ui,types}/`、公開用JavaScriptは `assets/js/`、スタイルは `assets/css/` です。

- `npm run build` で `tsc` が `src/` 配下のTypeScriptを対応する `assets/js/` 配下へコンパイルします。
- 既存HTMLの `<script defer>` 参照と CommonJS互換（Nodeの `require()` でテスト）は変更しません。
- `strict` な型チェックにより、4bit CPU状態・命令履歴・ROM・アセンブル結果・各種H/L信号・ブラウザDOM操作を検証します。
- 実行時依存ゼロ、DOM/SVGレイアウト・LED・スイッチ・波形・サンプルの動作を維持します。
- GitHub Actionsがmainとdevelopの `index.html` と `assets/` を検証して、`/td4/` と `/td4/develop/` にまとめて配信します。PagesのSourceはGitHub Actionsに設定してください。詳細は [デプロイ手順](deployment.md) に記載しています。
- `.js` は生成物なので直接編集せず、TypeScriptを更新して `npm run verify` 後にソースと生成物を一緒にコミットします。

## ディレクトリ変更時の注意

`tsconfig.json` の `rootDir` は `src`、`outDir` は `assets/js` です。TypeScriptの階層が公開用JSにも反映されます。HTMLの4つの `<script defer>` は依存順を維持してください。生成物は手作業で変更せず、`npm run verify` で再生成します。

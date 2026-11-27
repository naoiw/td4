# Education の構成・保守方針

[README](../README.md) ／ [操作ガイド](usage.md) ／ [設計・実装仕様](architecture.md) ／ [テスト方針](testing.md)

## 目的と学習順序

Education は [本番](https://naoiw.github.io/td4/assets/education/) と [develop プレビュー](https://naoiw.github.io/td4/develop/assets/education/) で公開する、TD4の学習ページです。CPUを触る前の基礎から、ROMの命令取得、デコード、ALU・レジスタ、プログラム実行へと進めます。

目次は4グループ、本文は14章です。

| 区分 | 章 | セクションID | 内容 |
| --- | --- | --- | --- |
| 基礎・構成 | 01 | `overview` | TD4の仕様とレジスタ |
| 基礎・構成 | 02 | `binary` | 2進数・16進数・4bit |
| 基礎・構成 | 03 | `logic` | 論理ゲートと加算回路 |
| 基礎・構成 | 04 | `sequential` | クロック、D-FF、カウンタ |
| 基礎・構成 | 05 | `hardware` | 74HC ICの役割（概要のみ） |
| 命令の処理 | 06 | `cycle` | FETCH → DECODE → EXECUTE → WRITE BACK |
| 命令の処理 | 07 | `rom-decode` | ROM行選択、負論理バス、74HC540、制御信号 |
| 命令の処理 | 08 | `decode` | 命令バイト、デコード式、標準12命令 |
| 命令の処理 | 09 | `datapath` | ROM・MUX・ALU・レジスタの経路 |
| 実行・演習 | 10 | `walkthrough` | 一般のSTEP実行例 |
| 実行・演習 | 11 | `carry-jnc` | COUT・C、JNC条件判定の比較 |
| 実行・演習 | 12 | `practice` | 自分で試す演習 |
| リファレンス | 13 | `hardware-details` | 74HC詳細・真理値表・物理ピン |
| リファレンス | 14 | `faq` | よくある疑問 |

標準12命令一覧の `instruction-set` は独立した章ではなく `decode` 内の折りたたみ式資料です。目次から直接飛べるようにします。IC詳細は入門の流れを遮らないよう後半に置き、前の章からアンカーで参照します。

## 編集時のルール

- HTML本文・章順・目次は `assets/education/index.html` にあります。既存のセクションID、教材用 `id` / `data-*` は原則として維持します。変更時はJSとテストの参照も更新します。
- 章番号は `01` から連続にし、目次リンクは本文と同じ学習順にします。章順・章番号・目次リンクの整合性は **`tests/education-guided.test.cjs` だけ**で一元検証します。個別の教材テストに総章数をハードコードしません。
- 役割に応じて、概要は短く、詳細な数式・真理値表・物理ピンの情報は専用章に置きます。STEP実行例では結論と入口を示し、Cの細かい比較は `carry-jnc` へリンクします。
- 用語は `PC`（次に読み出すアドレス）、`Im`（下位4bitの即値）、`COUT`（現在の加算器出力）、`C`（74HC74が保持するフラグ）、`SEL_A` / `SEL_B`（MUX制御）、`LOAD_*_N`（LOWで有効）で統一します。H=1、L=0です。
- ROMのスイッチ・ダイオード網は理想化した論理モデルです。物理的な電圧、CR時定数、IC伝搬遅延、完全な結線は実行できません。実ピンの情報は `src/data/netlist.json` とメーカー資料で確定したものだけ記載します。
- 本番の `main` と、開発プレビューの `develop` の反映状況は区別して記述します。

## 教材用コードの責務

| ファイル | 内容 |
| --- | --- |
| `assets/education/datapath.js` | 命令選択と経路のハイライト。実際の演算・分岐は共有の `TD4.CPU` と `TD4.decodeALU` を再利用 |
| `assets/education/rom-decode.js` | ROM行選択、ROM_RAW/D信号、デコード結果の表示。`TD4Circuit.levels` を再利用 |
| `assets/education/carry-jnc.js` | JNCの5ケースを実際の `TD4.CPU` で1命令ずつ実行 |
| `assets/education/logic-basics.js` | 真理値表と半加算器・全加算器の独立した教材ロジック |
| `assets/education/sequential.js` | 74HC74・74HC161の概念的な半周期操作と波形教材 |
| `assets/css/education.css` | Education専用スタイル（共有の `style.css` に追加） |

`td4-core.js` → `ic-circuit.js` → 各教育教材スクリプトの順に `defer` で読み込みます。実行中のEmulatorとEducation教材は状態を共有しません。数値や信号の処理を重複実装する必要が生じた場合は、まず共有CPU・ICロジックの再利用を検討してください。

## テスト

```bash
pnpm run verify
```

各教材のテスト（`tests/education-*.test.cjs`）は、真理値表・CPUステップ結果・端子モデル・教材の静的構造を確認します。目次や章番号の変更は `education-guided.test.cjs` の順序定義を更新してください。GitHub Actions のCIはリグレッションを検知しますが、ブラウザの表示やクリック操作を実際に確認するE2Eテストは導入していないため、`develop` プレビューの操作確認は別途必要です。

# TD4 — Web Emulator

> 『CPUの創りかた』に登場する4bit CPU「TD4」を、ブラウザ上で実行し、74HCロジックIC・ROMスイッチ・信号の変化を観察できるエミュレータです。

## 公開URL

| 環境 | ブランチ | URL | 状態 |
| --- | --- | --- | --- |
| 本番 | `main` | https://naoiw.github.io/td4/ | 公開中 |
| 開発プレビュー | `develop` | https://naoiw.github.io/td4/develop/ | 公開中 |

1つのGitHub Pagesサイトで本番と開発プレビューを同時公開しています。開発版への変更は、本番へのマージ前に `/develop/` で確認できます。

## 主な機能

- **74HCロジックICを可視化**：13個のICを機能別に表示。左列にMUX / ALU・REGISTERS・CLOCK / CONTROL、中央列に74HC154と74HC540を配置します。機能区画の基板シルクは英語見出しのみとし、日本語の補足文は表示しません。
- **DIPパッケージと信号表示**：DIP-14 / 16 / 20 / 24のピン本数とピッチ比を表現。信号端子はH=緑・L=灰色、電源端子はVCC=電源ON時に赤・OFF時は消灯した灰色、GND=黒、モデル化していない端子は暗い灰色で表示します。ICをクリックすると基板の下に拡大した入出力詳細を表示し、信号を追跡できます。
- **16×8bit ROMを直接編集**：ROMの各番地は基板・PROGRAM ROMの両方で `0x0`〜`0xF` と表示します。128個のスイッチを横置き8bit DIP×16組、4行×4列に配置。スイッチ下にD7側の「7」とD0側の「0」を表示し、74HC154の負論理出力に対応する緑LEDで現在選択中のアドレスを示します。
- **4bit入出力と基板表示**：ROMの下にINPUTスイッチとOUTPUT LEDを横並びで配置。点灯中のOUTPUT LEDは明るい緑色と強めの光彩で表示します。緑レジスト風の基板、四隅の取付穴。
- **基板の自動フィット**：ウィンドウ・パネルの幅に合わせて、DIP・ROMの比率を保持したまま基板全体を縮小／拡大。横スクロールせず全幅を表示し、選択信号のSVG配線も位置合わせします（縦方向のページスクロールは通常どおり可能）。
- **CPUの実行・デバッグ**：見出し行の「電源ON」「電源OFF」「停止／実行」（動作に応じて切替）で、電源OFF・電源ON/実行中・電源ON/CPU停止中の3状態を操作できます。基板上の2Hz/10Hz切替、ブレークポイント、実行履歴も利用できます。電源ONで自動実行、ROM編集・書込みやブレークポイント到達で電源ONのままCPUだけ停止します。CPUの初期化は電源OFF→ONで行います。
- **基板上の電源・CR発振操作**：基板右上は左側にCR発振回路と2Hz/10Hz切替トグル、右側に電源ON/OFFトグルと赤色パイロットLEDを配置。POWERブロックは左からLED・スイッチ・ON/OFFシルクの順、CR回路のCLK出力は左向きです。回路図の「R」は上側、「C」は右側へ文字半分程度ずらし、配線との重なりを避けています。基板のROMとIN/OUTはその下に配置します。周波数切替はスイッチ上側が10Hz、下側が2Hzで、初期状態はスイッチ下側（電源OFF・2Hz）です。電源・CRブロック内の不要な下余白と「MAIN SWITCH · DC」シルクは削除しました。電源投入直後は `PC=0x00` のまま先頭アドレスを表示し、最初のクロック立ち上がりから命令を実行します。電源を切るとCPUの揮発状態をリセットしてROMアドレス選択枠・LEDを消灯します（ROM内容と入力スイッチは保持）。見出し行には電源ON・電源OFF・CPU停止／実行の3ボタンを置き、上部の「1クロック」「リセット」ボタンと速度プルダウン、CRブロック下部の重複クロック表示はありません。
- **論理波形の観察**：クロック・キャリー・レジスタ・ROM・ALUなどをH/Lで確認し、5グループ（基本信号・入出力・レジスタA/B・PC / ALU・ROM）から選び、同時に最大10信号をスクロールなしで表示します。未使用チャンネルは「-」と「×」の空行として表示し、波形は描きません。履歴は直近80サンプルです。既定の波形記録方式は**オシロスコープモード**で、電源ON中はCPU停止中でも20msごとに信号を取得し、停止したCPUのレジスタ・PCはそのまま水平波形として表示し続けます。波形は最大約25fpsで描画し、CLKの2Hz／10Hzの周期差も再現します（直近80サンプル＝約1.6秒）。INPUTスイッチを操作すると変化点を即時記録し、その後も新しい論理値を記録し続けます。信号グループ切替時は履歴を消去し、CPU実行中ならその時点から、停止中なら再実行後から記録します。内部には別方式の**CPU実行時のみモード**も保持し、CPU停止中は波形履歴を更新しません。ブラウザの開発者コンソールから `TD4WaveCapture.setMode('oscilloscope')` / `TD4WaveCapture.setMode('cpu')` で切り替え可能です（通常UIに切替ボタンは設けません）。LOGIC ANALYZERとEXECUTION TRACEのパネル高さを揃え、長い実行履歴は履歴欄内だけをスクロールします。
- **プログラム編集**：8種類のサンプルプログラム、アセンブラ、ROMビットの直接編集と「ROM → ソース」に対応します。ROMファイル（.bin）の保存・読み込み機能はありません。PROGRAM ROMとPROGRAM EDITORの2パネルは横並び時に同じ高さで表示します。

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

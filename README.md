# TD4 — Web Emulator

『CPUの創りかた』に登場する4bit CPU「TD4」を、ブラウザで実行して観察するためのエミュレータです。

- **公開ページ（main）**: https://naoiw.github.io/td4/
- **GitHub**: https://github.com/naoiw/td4
- **開発ブランチ**: `develop`

公開済みの `index.html` はバックエンド・外部ライブラリなしで動作します。**開発用ソースはTypeScript**です。公開時は `assets/js/` 配下のコンパイル済みJavaScriptを読み込むため、GitHub PagesでのNode.jsビルドやActionsは不要です。Pagesの設定は引き続き `main` / `(root)` を使用します。

## 機能

- 中央にTD4の概念ボードを表示し、4bitスイッチを直接操作、出力LEDの点灯状態を表示
- クロック H/L、キャリーフラグ、PC、A/Bレジスタ、ROMデータ、ALU出力などの**1bitごとの論理レベル**を表示
- デジタル信号波形（基本信号／入力出力／レジスタ／ROM・ALUの4つのチャンネルグループ）、直近80サンプルを表示
- CPUのクロック立ち上がりで命令を実行（ステップ・自動実行・速度変更・停止・リセット）
- 8種類のサンプルプログラム（上部のクイックスタート6種、エディタ選択8種）
- アセンブラ（ラベル、ORG、DBなど）、16×8bit ROMビット編集、ブレークポイント、実行履歴
- ROM16バイトのバイナリ保存・読み込み

## 操作方法

1. 「サンプルを試す」から例をクリックすると、ROMにロードして実行が始まります。
2. 「スイッチ入力」を選んだ場合、ボード上のSW3〜SW0をクリックしてください。プログラムの `IN B` と `OUT B` によってLEDへ反映されます。
3. 信号モニタのセレクタで、見たいチャンネルを切り替えてください。**Hは上段、Lは下段**です。
4. 正確に命令単位で追うには停止・リセットして「1クロック」を押します。クリック後、H表示を約180ms保持してLに戻します。
5. ROMビットをクリックして直接書き換えるか、アセンブラを編集して「ROMに書き込む」を押せます。

## 信号波形について

このプロジェクトはTD4の**命令レベル・論理レベル**のエミュレータです。信号はCPUの現在状態とROMから計算した理想的なH/Lです。クロックの立ち上がりでレジスタ状態が変化し、立ち下がりでは変わりません。ROM D0..7、ALU0..3の波形は、**現在のPCが指す次の命令**の組み合わせ論理値です。

オシロスコープ風の表示は等間隔の論理サンプルです。74HC実ICの伝搬遅延、グリッチ、スイッチのチャタリングや実時間の電圧波形は再現しません。ボードは部品を機能ごとに表した概念図で、実物の配線レイアウトではありません。

詳細は [`docs/architecture.md`](docs/architecture.md) にあります。

## 開発方法（TypeScript）

Node.js 22以降とnpmが必要です。ブラウザ表示だけなら依存パッケージのインストールは不要です。

```bash
npm install
npm run build      # src/**/*.ts を型チェックして、assets/js/ に出力
npm test           # TypeScript型チェック + Node.jsの全テスト
npm run verify     # ビルド + 型チェック + テスト
```

`src/` を**唯一のTypeScript編集元**とし、`assets/js/` はビルド生成物です。生成したJavaScriptもソースと一緒にcommitしてください。GitHub Pagesは `main` のルートにある `index.html` からこれらを直接読み込みます。`assets/css/style.css` は直接編集するCSSです。`LICENSE`は変更しません。

Vite/ReactやGitHub Actionsを追加していないため、以前のPages公開設定を変更する必要はありません。ビルド後も `index.html` を直接開いて動作を確認できます。

## ファイル構成

```text
.
├── index.html             # GitHub Pages (main / root)
├── assets/
│   ├── css/style.css      # CSS（直接編集）
│   └── js/                # tsc生成物・Git管理対象
│       ├── core/          # td4-core.js, signals.js
│       ├── data/          # samples.js
│       └── ui/            # app.js
├── src/                   # TypeScriptの編集対象
│   ├── core/              # CPUと信号処理
│   ├── data/              # サンプルROM
│   ├── ui/                # DOM / SVG
│   └── types/             # 型定義
├── tests/
├── docs/
├── package.json
└── tsconfig.json
```

TypeScript製の他リポジトリを参考に、ソース・アセット・テスト・ドキュメントを分離しました。TD4は外部依存なしの静的サイトのためVite/Reactは導入せず、既存の `main / (root)` のGitHub Pages設定を維持します。ルート直下にJavaScriptファイルは置きません。

## テスト

Node.js 22以降で：

```bash
npm install
npm test
```

新規の信号・サンプルを含む計20件のテストを用意しています。ブラウザ操作はサンプル選択、スイッチ切替、LED表示、波形チャンネル切替、ステップを確認しました。

## ライセンス

Apache License 2.0（既存の [`LICENSE`](LICENSE) に準拠）。

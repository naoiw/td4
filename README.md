# TD4 Emulator

**公開URL:** https://naoiw.github.io/td4/

**リポジトリ:** https://github.com/naoiw/td4

『CPUの創りかた』のTD4（とりあえず動作するだけの4bit CPU）をブラウザで実行する、小さなオフライン対応エミュレータです。依存パッケージ・ビルド工程・サーバーは不要です。

## 起動

- `index.html` をブラウザで開いてください（`style.css`、`td4-core.js`、`app.js` を同じディレクトリに置きます）。
- GitHub Pagesの公開元は main ブランチの / (root) です。初回のみ Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save を設定してください。以降mainへの変更で自動公開されます。

## 操作

1. 「サンプルプログラム」から試したいプログラムを選びます。起動時はLEDパターンを読み込んでいます。
2. 「1クロック」で1命令ずつ実行、または「実行」で自動クロックを開始します。
3. A / B / PC / Cの各レジスタと出力LEDを確認します。
4. 入力スイッチSW3〜SW0は実行中でもON/OFFできます。入力を試すときは「入力スイッチをLEDに反映」のサンプルを使用してください。
5. ソースのアセンブリを変更して「ROMに書き込む」で実行内容を更新します。
6. ROM表の0/1ビットをクリックすると機械語を直接編集できます。ROMの行のアドレスをクリックするとブレークポイントを切り替えます。

「ROM → ソース」を押すと現在の16バイトが `DB 0xXX` 形式でソース欄に反映されます。バイナリROMの保存と読み込みにも対応しています。`td4-rom.bin` は16バイトの生バイナリ形式です。

キーボード: `Ctrl+Enter` / `Cmd+Enter` でアセンブル、`Escape` で自動実行停止、編集エリア以外にフォーカスがあるときは `Space` で1クロック実行。

## 命令セット

TD4は4bitのA/Bレジスタ、4bitのPC、1bitのCフラグ、4bitのIN/OUTポート、16バイトの8bit ROMを持ちます。

| 命令 | 機械語 | 動作 |
| --- | --- | --- |
| ADD A, Im | `0n` | A ← A + Im |
| MOV A, B | `10` | A ← B |
| IN A | `20` | A ← IN |
| MOV A, Im | `3n` | A ← Im |
| MOV B, A | `40` | B ← A |
| ADD B, Im | `5n` | B ← B + Im |
| IN B | `60` | B ← IN |
| MOV B, Im | `7n` | B ← Im |
| OUT B | `90` | OUT ← B |
| OUT Im | `Bn` | OUT ← Im |
| JNC Im | `En` | C=0ならPC ← Im |
| JMP Im | `Fn` | PC ← Im |

`n` は0〜Fの4bit即値です。加算結果は4bitに切り詰められ、桁あふれがCに格納されます。Cは**全命令で**ALUから更新され、JNCの分岐判定には**実行直前のC**が使われます。

原作の命令セットとして未定義のバイトも、本機では元のTD4のMUX・ALU・書き込み先デコードを再現して実行します（ROM表示には `*` マーク）。詳細は [`docs/architecture.md`](docs/architecture.md) を参照してください。

## アセンブラ

- 1行1命令、最大16命令。空白行とコメント行はROMを消費しません。
- 4bit即値は `10`（10進）、`0xA` / `$A` / `0Ah`（16進）、`0b1010`（2進）、`A`（16進1桁）に対応。
- `label:` でラベルを定義し、`JMP label` や `JNC label` で参照できます。
- `ORG 0xA` / `.ORG 0xA` で書き込みアドレスを変更できます。
- `DB 0xB3` / `.BYTE 0xB3` で1バイトの生機械語を配置できます。
- `10110011`（8bitバイナリ）や `B3`（2桁16進）を単独の行に記述することもできます。
- `;` または `//` 以降はコメントとして扱います。
- 明示されていないアドレスは `0x00` で初期化します。

## テスト

Node.js 18以上で、追加インストールなしで実行できます。

```sh
node --test tests/td4-core.test.cjs
```

通常の命令、4bit桁あふれ、CとJNC、入出力、PCのラップ、未定義命令、アセンブラ、ROMソースの往復変換をテストしています。256通りの命令バイトに対しハードウェアのデコード式との比較テストを含みます。

## ファイル構成

```
index.html             UI
style.css              UIスタイル
app.js                 画面・操作・ブラウザ入出力
td4-core.js            CPU・アセンブラ・逆アセンブラ
tests/td4-core.test.cjs テスト
docs/architecture.md   命令デコードと設計上の注意
```

## 制限

- 実行は**命令レベル**のシミュレーションです。ICごとの伝搬遅延、電圧変化、チャタリングやクロックエッジ上のアナログ挙動は再現しません。
- UI上の速度（1〜50Hz）は実機の周波数ではなく、表示用の仮想クロックです。
- リセット操作ではA/B/OUT/PC/C/サイクル数を0にし、ROMと入力スイッチの値は保持します。
- ROMは16バイト固定で、RAM・スタック・割込みはありません。

## 参考資料

- [TD4: Porting to CPLD](https://github.com/geodenx/td4)
- [未定義命令におけるTD4とKagekiの動作の違い](https://qiita.com/mikecat_mixc/items/c1f6086d6e85682f783b)
- [TD4エミュレータで遊ぶ — OUCC](https://oucc.org/blog/articles/2023-12-18-td4/)

## ライセンス

Apache License 2.0（`LICENSE`）。
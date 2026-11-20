# TD4 エミュレーション仕様

## CPU構成
- A/B: 4bit汎用レジスタ、PC: 4bit、キャリーフラグC: 1bit
- 4bit入力IN、4bit出力OUT、16×8bit ROM
- 実行単位は1命令。IC伝搬遅延やアナログ挙動はモデル化しない

## 1命令の実行
1. ROM[PC]から8bit命令を読む。
2. opcode=byte>>4、immediate=byte&15とする。
3. 74HC153相当の入力MUXで加算器の入力を選択。
4. selected + immediateの下位4bitを求め、オーバーフローを次のCとする。
5. opcode上位2bitでA/B/OUT/PCへの書き込みを決める。
6. 条件ジャンプJNCは実行前のCが0なら分岐。分岐しなければPC+1。
7. Cは全命令で加算器の結果から更新する。

## MUX
opcodeの4bitをi7,i6,i5,i4としたとき、
muxA = i7 OR i4、muxB = i5。
muxB:muxA が 00ならA、01ならB、10ならIN、11なら0が選ばれる。

## 未定義オペコード
公式に定義されない命令バイトも元のデコーダの動作に従って実行する。
- 0x1n/0x2n/0x4n/0x6n: ALU入力+即値をレジスタへ格納
- 0x8n/0x9n: OUT ← B+n
- 0xAn/0xBn: OUT ← n
- 0xCn: C=0なら PC ← B+n
- 0xDn: PC ← B+n

すべての命令バイト256種類を独立したMUXモデルと比較するテストを用意。

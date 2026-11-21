"use strict";
/* Tested reference programs for the TD4's 16 × 8-bit ROM. */
(function (root, factory) {
    const samples = factory();
    if (typeof module === 'object' && module.exports)
        module.exports = samples;
    else
        root.TD4Samples = samples;
})(globalThis, function () {
    'use strict';
    return [
        {
            id: 'led',
            icon: '↔',
            title: 'LEDスキャナ',
            description: 'LED0点灯で折り返す往復スキャナ',
            source: `; LEDを左右に流す
start: OUT 1
       OUT 2
       OUT 4
       OUT 8
       OUT 4
       OUT 2
       OUT 1
       JMP start`
        },
        {
            id: 'echo',
            icon: '⇄',
            title: 'スイッチ入力',
            description: '4bitスイッチを2クロックごとにLED表示（16命令）',
            source: `; 4bit入力を2クロックごとにLEDへ反映
; IN B → OUT B を8組実行し、PCの0xF→0x0で繰り返す
       IN B
       OUT B
       IN B
       OUT B
       IN B
       OUT B
       IN B
       OUT B
       IN B
       OUT B
       IN B
       OUT B
       IN B
       OUT B
       IN B
       OUT B`
        },
        {
            id: 'counter',
            icon: '#',
            title: 'アップカウンタ',
            description: '0から15まで順に表示',
            source: `; Bレジスタをインクリメント
       MOV B, 0
loop:  OUT B
       ADD B, 1
       JMP loop`
        },
        {
            id: 'blink',
            icon: '◉',
            title: 'LED点滅',
            description: '全LEDをON/OFF',
            source: `; 4個のLEDを点滅
loop:  OUT 15
       OUT 0
       JMP loop`
        },
        {
            id: 'bounce',
            icon: '◆',
            title: '2進パターン',
            description: '1→3→7→F→7→3→1',
            source: `; 1, 3, 7, F, 7, 3, 1 の2進パターン
loop:  OUT 1
       OUT 3
       OUT 7
       OUT 15
       OUT 7
       OUT 3
       OUT 1
       JMP loop`
        },
        {
            id: 'sum2',
            icon: '∑',
            title: '2bit加算（16命令）',
            description: 'SW01+SW23 → LED210（LED2は桁上がり）',
            source: `; SW1:0 (下位2bit) + SW3:2 (上位2bit) -> LED2:0
; Aで入力範囲を判別し、Bを0〜6の結果に変換
start:  IN A
        MOV B, A
        ADD A, 4
        JNC under12
        ADD B, 7
        JMP show
under12:
        ADD A, 4
        JNC under8
        ADD B, 10
        JMP show
under8:
        ADD A, 4
        JNC show
        ADD B, 13
show:   OUT B
        ADD B, 12    ; 1クロックの間、CPUのCにも桁上がりを表示
        JMP start`
        },
        {
            id: 'countdown',
            icon: '−',
            title: 'ダウンカウンタ',
            description: 'F→0にカウントダウン',
            source: `; -1 は ADD B,15 で実現
       MOV B, 15
loop:  OUT B
       ADD B, 15
       JMP loop`
        },
        {
            id: 'carry',
            icon: 'C',
            title: 'キャリーと分岐',
            description: '桁あふれでJNCを確認',
            source: `; 15+1でC=1になるのでJNCは不成立
       MOV A, 15
       ADD A, 1
       JNC skip
       OUT 15
end:   JMP end
skip:  OUT 0
       JMP end`
        },
        {
            id: 'addition',
            icon: '+',
            title: '4bit加算',
            description: 'E+3=1（桁あふれ）',
            source: `; 14 + 3 = 17, 4bitでは1
       MOV A, 14
       ADD A, 3
       MOV B, A
       OUT B
end:   JMP end`
        }
    ];
});

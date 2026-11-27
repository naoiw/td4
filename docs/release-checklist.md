# main統合前チェックリスト

[README](../README.md) ／ [開発とデプロイ](deployment.md) ／ [テスト方針](testing.md) ／ [Education構成](education.md)

この文書は `develop` に累積したEducation拡充とEmulatorの変更を、`main` に安全に反映するための検証項目です。**実行していない確認項目にチェックを付けない**こと。GitHub Actionsの成功は実ブラウザの動作保証ではありません。

## 1. ソース・生成物とPR

- [ ] `develop` が最新で、修正PRがすべてマージ済み。未解決のCI失敗やレビューコメントがない
- [ ] `pnpm install --frozen-lockfile`、`pnpm run lint`、`pnpm run verify` に相当するCIジョブが成功
- [ ] `assets/js/` を再生成しても差分がない（`Verify generated JavaScript is committed` の成功）
- [ ] `develop` から `main` のリリースPRを作り、変更ファイルと差分の範囲を確認（Educationだけでなく本体・テスト・文書も確認）
- [ ] `main` の変更が `develop` で未回収になっていないことを比較

## 2. Emulator（developプレビュー）

確認URL：https://naoiw.github.io/td4/develop/

- [ ] 初回表示：POWERはOFF、CPU STATEは数値非表示、ROM 16×8bitの初期表示
- [ ] 電源ON：PC=0から開始し、2Hz/10Hz切替が機能。周波数変更で命令が余分に1回進まない
- [ ] HARDWARE WORKBENCHとPROGRAM ROMの両方で実行／停止・STEPが正常。STEPは1命令につき1回だけ進む
- [ ] ブレークポイント停止後に再開でき、次回同番地へ戻ったとき再び停止する
- [ ] ROMテーブルと基板DIPの両方でビット変更が相互反映され、エディタとの未同期メッセージが表示される
- [ ] INPUT、OUT LED、CPU STATE（PC/C/A/B/IN/OUT）、EXECUTION TRACE（最大25件）の表示・変化強調
- [ ] 13個のIC物理ピン・機能プローブ、74HC154の選択行、74HC540のROM_RAW/D信号が正しく対応
- [ ] LOGIC ANALYZER：信号グループ、50Hzサンプル、最大80点、TRIGGER ARM/発火、STOP/RUN/クリア、CPU停止中の波形取得
- [ ] PC幅と狭いウィンドウ幅で、基板のスケール・DIP・操作ボタン・波形/履歴の高さが崩れない
- [ ] 10種類のサンプル（特にスイッチ入力、3bit加算、キャリーと分岐）が動く

## 3. Education（developプレビュー）

確認URL：https://naoiw.github.io/td4/develop/assets/education/

- [ ] 目次の4グループと01〜14の章が正しい順番で、すべてのアンカーに移動できる
- [ ] 論理ゲート・加算器の真理値表と4bitキャリー伝播の操作が正しい
- [ ] クロック/D-FF/74HC161のCOUNT・LOAD・HOLD/RESETと波形表示が正しい
- [ ] ROM選択・編集、ROM_RAWからD7..D0への反転、SEL/LOAD信号、JNCの旧Cによる違いが正しい
- [ ] CPUデータフローの9例の経路が表示と一致する
- [ ] JNCの5ケースでSTEP、旧C/COUT/新C/次PCが正しい
- [ ] 標準12命令の一覧、IC詳細9種類のピン表、演習4件、FAQが表示できる
- [ ] EducationからEmulatorへ戻れる。スマートフォン幅で表が横スクロールでき、操作しにくい改行・はみ出しがない

## 4. mainへのマージ後

- [ ] `main` PRをマージし `Deploy GitHub Pages` の成功を確認
- [ ] 本番 https://naoiw.github.io/td4/ と https://naoiw.github.io/td4/assets/education/ の表示・操作を確認
- [ ] 本番のcanonicalとサイトマップ、本番URLのインデックス対象設定に影響がない
- [ ] `/develop/`側の両ページに `noindex,follow` が付与され、本番とは別にプレビュー公開できる
- [ ] 必要なら `main` → `develop` を同期し、不要な機能ブランチを削除
- [ ] 関連Issue #106〜#111と親Issue #18は、ブラウザ実機・本番確認の完了後にクローズ

## 現時点の未実施項目

2026-11-27現在、PRの自動テストが通っていても、**実ブラウザでの一通りの表示・操作確認とmainへの統合は未実施**。実装済みと本番リリース済みを混同しないでください。

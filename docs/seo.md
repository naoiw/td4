# SEO・AI検索向けの公開設定

TD4 Web Emulatorでは、一般的な検索エンジンとAIを利用した検索サービスから、正式な公開ページを見つけてもらうことを目指します。**検索順位やAI回答への引用を保証する設定ではありません。**

## 検索対象にするページ

| ページ | 正規URL | 主な検索意図 |
| --- | --- | --- |
| エミュレータ | https://naoiw.github.io/td4/ | TD4 4bit CPU エミュレータ、ブラウザでCPUを動かす |
| Education | https://naoiw.github.io/td4/assets/education/ | TD4命令セット、命令デコード、74HC ICの構成 |

両ページに固有のtitle・description、`rel=canonical`、Open Graphメタデータを設定しています。エミュレータには`WebApplication`、Educationには`TechArticle`のJSON-LDを設けています。**実際に提供していないレビュー、評価点、機能はマークアップしません。**

エミュレータ本体にはHTMLに直接書かれた解説文を設け、JavaScriptが実行されなくても概要が読めるようにしています。Educationの詳細な解説も静的HTMLです。

## 開発プレビューと重複コンテンツ

`/td4/develop/`および`/td4/develop/assets/education/`は、本番とほぼ同一内容の動作確認用ページです。

- HTML中のcanonicalは本番URLを指します。
- GitHub Pages公開用のワークフローが、**プレビュー成果物だけ**に`<meta name="robots" content="noindex,follow">`を注入します。
- リポジトリのソースHTMLと本番成果物にはnoindexを付けません。
- サイトマップにもプレビューURLを記載しません。

公開時のサイトマップは`production/sitemap.xml`から`publish/sitemap.xml`へコピーされ、URLは **https://naoiw.github.io/td4/sitemap.xml** です。

## robots.txtの注意点（GitHub Pages）

TD4は `naoiw.github.io` 配下の**プロジェクトページ**です。`robots.txt`が有効なのはオリジンのルート **https://naoiw.github.io/robots.txt** です。`https://naoiw.github.io/td4/robots.txt`を設置しても、その内容は標準のrobots.txtルールとして適用されません。

本リポジトリだけでドメイン全体のrobots.txtを変更しないでください。他プロジェクトへの影響があります。必要なら、`naoiw.github.io`を公開する親サイト側の設定を確認し、Googlebotや`OAI-SearchBot`への意図しないDisallowがないことを確認します。

- **OAI-SearchBot**：ChatGPTの検索機能でサイトを紹介するために利用する検索向けクローラー。
- **GPTBot**：AIモデル学習用の別のクローラー。検索掲載と学習利用は別の目的で、許可設定も独立です。
- GoogleのAI検索機能のために`llms.txt`など特別なファイルを追加する必要はありません。まずインデックス可能な独自コンテンツと通常のSEOを優先します。

## Google Search Consoleの所有権確認

本番エミュレータの`index.html`の`<head>`に、Google Search Consoleから発行された`google-site-verification`メタタグを配置しています。GitHub Pagesで本番公開した後、**Search Console側で「確認」を押して所有権確認を完了する必要があります**。メタタグを公開しただけでは確認完了になりません。所有権の再確認に使う場合があるため、このタグは残してください。

## 公開後に管理者が確認すること

1. GitHub Actionsの`Deploy GitHub Pages`が完了した後、エミュレータ・Education・`sitemap.xml`がそれぞれ200で開けることを確認する。
2. プレビューのHTMLには`noindex,follow`があり、本番のHTMLにはないことを確認する。
3. [Google Search Console](https://search.google.com/search-console/)で適切なURLプレフィックスのプロパティを所有確認し、`https://naoiw.github.io/td4/sitemap.xml`を送信する。URL検査では本番2ページを調べる。
4. [Bing Webmaster Tools](https://www.bing.com/webmasters/)でも同じサイトマップを送信・検証する。
5. `naoiw.github.io`のトップ／作品一覧など、既存の関連ページから本番URLとEducationへの自然なリンクを設ける。
6. 検索流入やインデックス状態を定期的に確認する。検索結果への反映には時間がかかることがあり、登録・順位は保証されません。

## 更新時の確認

`pnpm test`の`tests/seo.test.cjs`でメタデータ・JSON-LD・サイトマップURLを、`tests/site-assets.test.cjs`でページ内の資産参照を検査します。公開ワークフローもテスト対象です。サイト構成の変更時はcanonicalとsitemapの両方を更新してください。

参考：[Google Search Central](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)、[GoogleのAI検索向けガイド](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)、[OpenAI Crawlers](https://developers.openai.com/api/docs/bots)

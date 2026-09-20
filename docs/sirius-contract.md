# Sirius実機調査（Issue #2）

## 状態

調査途中。製品のJSONデコーダーを実装できる契約は未確定。
2026-09-20にログイン済みSiriusのホームをCodex内蔵ブラウザで確認した。Chromeへの拡張読み込みとcontent scriptからの取得は未確認である。

## 確認済みの画面構造

- トップレベルに `nav#linkNav.Mrphs-sitesNav`、`nav#toolMenu`、`main#content` がある。
- サイトナビゲーションのホームリンクは `/portal/site/%7E<利用者識別値>` の形式。氏名を使わない識別の候補だが、科目ページとアカウント切り替えでの安定性は未確認。
- 科目リンクは `/portal/site/<siteId>` の形式。標準HTTPSポートを明記した `:443` のURLもある。
- 各ツール本文は複数のiframeに分かれている。固定のiframe IDを製品コードへ埋め込まない。
- 公式ホームにも「課題・小テスト一覧」がある。拡張による一覧との共存を実機で確認する必要がある。
- パネル挿入はトップレベルの `main#content` 周辺を候補とする。科目ページとフォームへの非干渉確認後に確定する。

## サーバーが提供する説明

`/direct/describe` と `/direct/site/describe` を読み取った。

- `site`、`assignment`、`sam_pub` のプロバイダーが登録されている。
- サイト一覧のGETは、現在の利用者がアクセスできるサイトを返すと説明されている。
- `_limit` にサーバー側上限があり、要求した件数がそのまま返る保証はない。
- ページングは `_start` と `_limit` が説明されている。ただし全体説明は0始まり、site固有の例は1始まりであり、実測での解決が必要。
- サイトの型定義には `id`、`title`、`type`、`published` などがある。これは説明ページのJava型であり、実際のJSON構造やフィールドの値を確認したことにはならない。
- 一覧GETとPOST/PUT/DELETEは別操作。拡張では確認済みの取得GETだけを使用する。

## 取得できていない内容

- `/direct/site.json?_limit=200` の直接表示は操作環境で `ERR_BLOCKED_BY_CLIENT` になり、HTTP状態やJSON本文を観測できなかった。
- 文書にあるHTML表示も `ERR_CONNECTION_CLOSED` になった。Siriusのアクセス拒否やAPI非対応と断定しない。
- ブラウザ操作ツールの読み取り用評価環境には `fetch` がなく、ページ内からのGETをその経路で実行できなかった。通常のChrome content scriptでfetchが使えないという意味ではない。
- 課題・小テストのJSON、日付の意味・単位、閲覧用URL、認証エラーの実応答は未確認。
- 値を匿名化した実応答fixtureはまだない。人工データでこれを代替して確認済みと扱わない。

## 次の確認

`tools/probe/` の独立した診断拡張をChromeへ読み込み、既存セッションからのGETを確認する。手順は [probe README](../tools/probe/README.md)。
診断結果はHTTP状態と選択したフィールドの型だけであり、実データの値、単位、網羅性を確定する証拠ではない。

JSON取得が確認できたら、必要なフィールドの意味を公式画面と照合し、匿名化した最小fixture、ページング、アカウント識別、日付、リンクの契約を追記する。それまではIssue #2を閉じず、依存する製品機能を推測で実装しない。

## 参照

- [調査Issue #2](https://github.com/hoki621/sirius-chromeextention/issues/2)
- [SiriusのAPI一覧](https://lms.sirius.tuat.ac.jp/direct/describe)
- [Siriusのsite説明](https://lms.sirius.tuat.ac.jp/direct/site/describe)

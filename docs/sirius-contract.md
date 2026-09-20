# Sirius実機調査（Issue #2）

## 状態

調査途中。製品のJSONデコーダーを実装できる契約は未確定。
2026-09-20にログイン済みSiriusのホームをCodex内蔵ブラウザで確認した。同ブラウザ上で利用者が読み込んだ診断拡張のパネルを操作し、既存セッションによる5件のGETすべてでHTTP 200・JSON応答を確認した。通常のChromeでの動作確認とブラウザのバージョン記録は未完了である。

## 確認済みの画面構造

- トップレベルに `nav#linkNav.Mrphs-sitesNav`、`nav#toolMenu`、`main#content` がある。
- サイトナビゲーションのホームリンクは `/portal/site/%7E<利用者識別値>` の形式。氏名を使わない識別の候補だが、科目ページとアカウント切り替えでの安定性は未確認。
- 科目リンクは `/portal/site/<siteId>` の形式。標準HTTPSポートを明記した `:443` のURLもある。
- ホームの複数ツールはiframeに分かれている。一方、確認した科目の課題一覧はトップレベルの `main#content` 内にあり、同main内にiframeはなかった。すべてのツールがiframe内にあると仮定せず、固定のiframe IDも製品コードへ埋め込まない。
- 公式ホームにも「課題・小テスト一覧」がある。拡張による一覧との共存を実機で確認する必要がある。
- パネル挿入はトップレベルの `main#content` 周辺を候補とする。科目ページとフォームへの非干渉確認後に確定する。

### 科目・課題一覧の追加確認

2026-09-20、ホームに表示された科目リンクから科目トップ、公式ナビゲーションの「課題」へ移動した。課題の本文・提出・採点リンクは押していない。

- 科目トップの `/portal/site/<siteId>` で通常のアウトラインを閲覧できた。詳細リンクが未検証の場合の案内先は科目トップとする。
- ホームへのリンクの識別部分はホーム・科目トップ・課題一覧で一致した。ただし、別アカウントへの切り替えと安定性は未確認のままである。
- 課題一覧の表見出しは「添付」「課題タイトル」「状態」「公開日時」「締切日時」。公開日時・締切日時は `YYYY/MM/DD HH:mm` 表示。画面表示だけではタイムゾーンやAPIとの対応は確定しない。
- 表の課題リンクには `assignmentReference=/assignment/a/<siteId>/<itemId>&sakai_action=doView_submission` と `submissionId=/assignment/s/<siteId>/<itemId>/<submissionId>&sakai_action=doView_grade` の2形態を観測した。これらはID照合にのみ使用し、製品の閲覧リンクとして許可したことにはしない。
- 診断v1のパネルは課題一覧でも1つだけ挿入された。公式の「課題」ナビゲーション操作を維持できた。提出フォーム・狭幅・拡大表示の非干渉確認は別途必要。

### 診断v2の日時照合（実機実行待ち）

`tools/probe/deadlines.ts` は、確認した表の列とリンクから科目ID・項目ID・表示日時をページ内だけに読み取り、既存の課題GET応答と照合する。表・IDの不明や重複を成功扱いにせず、結果は一致・不一致・判定不能の件数だけを表示する。追加HTTPリクエストはない。

仮説は `epochSecond` を秒、`nano` をナノ秒として日本時間へ変換し、公式画面と分精度で比較するもの。`openTime` を公開日時に、`dueTime` / `closeTime` / `dropDeadTime` を締切日時に比較する。同一値のフィールドの意味や期限未設定値は、この比較だけでは区別できない。

人工データによる単体テストは成功したが、現時点で実機に読み込まれているのはv1である。ビルド後に公式の課題ナビゲーションから再表示してもv1のままであり、拡張管理画面での再読み込みが必要。ブラウザ操作ツールでは同管理画面が制限されているため、利用者の再読み込み後に照合を実行する。

## サーバーが提供する説明

`/direct/describe` と `/direct/site/describe` を読み取った。

- `site`、`assignment`、`sam_pub` のプロバイダーが登録されている。
- サイト一覧のGETは、現在の利用者がアクセスできるサイトを返すと説明されている。
- `_limit` にサーバー側上限があり、要求した件数がそのまま返る保証はない。
- ページングは `_start` と `_limit` が説明されている。ただし全体説明は0始まり、site固有の例は1始まりであり、実測での解決が必要。
- サイトの型定義には `id`、`title`、`type`、`published` などがある。これは説明ページのJava型であり、実際のJSON構造やフィールドの値を確認したことにはならない。
- 一覧GETとPOST/PUT/DELETEは別操作。拡張では確認済みの取得GETだけを使用する。

## 診断拡張で確認したAPI応答

使用コードはPR #13の `6ffc9ef`、診断出力の `probeVersion` は1。ホームを再読み込みし、右下の「読み取り診断を実行」を1回押した。Cookieの抽出・転記なしに、content scriptの `credentials: "same-origin"` で取得できた。

| 取得先 | HTTP / 形式 | 観測した構造 |
| --- | --- | --- |
| `/direct/site.json?_limit=200` | 200 / JSON | `site_collection` は空でない配列 |
| `/direct/assignment/site/{siteId}.json`（表示中の2サイト） | 両方200 / JSON | `assignment_collection` は両方とも空でない配列 |
| `/direct/sam_pub/context/{siteId}.json`（同じ2サイト） | 両方200 / JSON | `sam_pub_collection` は両方とも空配列。通信失敗ではない |

3種類ともトップレベルの `entityPrefix` は文字列。以下は各配列の**先頭要素のみ**で観測した型であり、全要素の必須フィールドやnull許容性を保証しない。

- サイト: `id`、`title`、`type`、`entityId`、`entityURL`、`entityReference` は文字列、`published` は真偽値。`createdDate` / `modifiedDate` は数値、`createdTime` / `modifiedTime` は `{ display: string, time: number }`。
- 課題（両サイト）: `id`、`context`、`title`、`status`、`dueTimeString`、`entityId`、`entityURL`、`entityReference` は文字列。`dueTime` / `openTime` / `closeTime` / `dropDeadTime` は `{ epochSecond: number, nano: number }`。フィールド名だけで締切の意味・単位を確定せず、画面との照合を別途行う。
- 小テスト: 取得成功と空配列だけを確認。要素がないため、小テスト自体のフィールドは未確認。

診断は許可したフィールドの型だけを表示し、任意のキーや実値を出力しない。サイト先頭要素の26フィールド、課題先頭要素の27フィールドは省略された。非空/空以外の件数、ページング、全科目の網羅性、値や関連性は検証していない。この記録は匿名化した実応答fixtureではない。

## 操作環境による取得制約

- `/direct/site.json?_limit=200` の直接表示は操作環境で `ERR_BLOCKED_BY_CLIENT` になり、HTTP状態やJSON本文を観測できなかった。
- 文書にあるHTML表示も `ERR_CONNECTION_CLOSED` になった。Siriusのアクセス拒否やAPI非対応と断定しない。
- ブラウザ操作ツールの読み取り用評価環境には `fetch` がなく、ページ内からのGETをその経路で実行できなかった。通常のChrome content scriptでfetchが使えないという意味ではない。
- 上記は直接表示・操作ツール経由の取得に関する制約であり、その後の診断拡張による取得成功とは区別する。

## 未確認事項

- 課題の日付の意味・単位、期限未設定値、閲覧用URL、科目抽出条件、ページング、アカウント識別の安定性、認証エラーの実応答は未確認。
- 非空の小テスト応答は未確認。
- 値を匿名化した実応答fixtureはまだない。人工データでこれを代替して確認済みと扱わない。

## 次の確認

`tools/probe/` の独立した診断拡張で取得経路を確認できた。再現手順は [probe README](../tools/probe/README.md)。通常のChromeでも同じ確認を行い、環境・バージョンを記録する必要がある。
診断結果はHTTP状態と選択したフィールドの型だけであり、実データの値、単位、網羅性を確定する証拠ではない。

次に必要なフィールドの意味を公式画面と照合し、匿名化した最小fixture、ページング、アカウント識別、日付、リンクの契約を追記する。それまではIssue #2を閉じず、依存する製品機能を推測で実装しない。

## 参照

- [調査Issue #2](https://github.com/hoki621/sirius-chromeextention/issues/2)
- [SiriusのAPI一覧](https://lms.sirius.tuat.ac.jp/direct/describe)
- [Siriusのsite説明](https://lms.sirius.tuat.ac.jp/direct/site/describe)

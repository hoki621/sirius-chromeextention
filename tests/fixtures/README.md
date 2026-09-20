# Siriusの匿名化・選択フィールドfixture

2026-09-20、ログイン済みCodex内蔵ブラウザで診断v3（`a5f17d7`）を実行し、実応答から生成された `sample.fixture` を確認して保存した。人工のAPI応答を実測として記録したものではない。ただし、これは**選択フィールドの匿名化サンプルであり、生の完全な応答ではない**。

| ファイル | 取得先 | 元の件数 | 保存件数 |
| --- | --- | --- | --- |
| sites.observed.json | site | 4 | 2 |
| assignments-site-1.observed.json | assignment / site 1 | 5 | 2 |
| assignments-site-2.observed.json | assignment / site 2 | 2 | 2 |
| quizzes-empty.observed.json | sam_pub / site 1 | 0 | 0 |

同じ診断でsite 2の小テストも正常な空配列だった。同一内容のfixtureは重複して保存していない。

## 変換と制約

- 名前・タイトルは架空値、IDは診断内で共通の連番別名へ置換。課題のcontextとサイトIDの対応は保持する。
- 時刻は応答内の順序・同値を保持する2030年の架空値へ置換。元の時間間隔、秒以下の精度、別応答間の日付対応は保持しない。
- 固定種別 `project` と公開状態の真偽値は保持。サイト種別を `course` に限定すると今回の対象サイトを除外してしまう。
- 未選択のフィールドは除去。所有者・任意のprops・本文・添付・URL・認証情報は含まない。
- 非空の小テスト、期限未設定、個人用サイト、異常応答の実測fixtureはない。これらを人工データで追加する際は `.synthetic.json` とし出自を区別する。
- fixture中の架空値から実際の日時・ID形式・公開範囲を推論しない。対応する観測は [契約文書](../../docs/sirius-contract.md) を参照する。

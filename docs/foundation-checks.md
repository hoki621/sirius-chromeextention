# 開発基盤の確認（Issue #3）

## 自動検査

`npm ci`、`npm run check`、`npm test`、`npm run build` を順番に実行する。
テストは実際のTypeScriptソースとビルド済みcontent scriptを実行する。Siriusへのネットワーク接続は行わない。

確認対象は、portalのURL境界、クエリ・フラグメント付きURL、トップフレーム限定、Manifestの権限、成果物のファイル一覧、基盤版に通信・保存・DOM変更がないこと。

## Chrome実機検査

以下はNodeのテストで代替できない。実施した際にChromeバージョン、日時、合否をIssueまたはPRへ記録する。

1. READMEに従って `dist/` をChromeへ読み込む。Manifestエラーがないことを確認する。
2. Siriusの `/portal`、`/portal?lang=ja`、科目ページでConsoleの基盤版メッセージを確認する。ログイン前後は別に記録する。
3. `/direct/describe` 等の対象外ページや子フレームにはcontent scriptが挿入されないことを確認する。
4. 拡張の詳細で、対象がSiriusのみであることを確認する。
5. Networkに拡張による追加のLMSリクエストがなく、追加の保存データがないことを確認する。

## 検証記録

- 2026-09-20、macOS、Node.js 22.23.2 / npm 10.9.8。
- `npm ci`、`npm run check`、`npm test`（3件）、`npm run build` が成功。
- 配布物は `manifest.json` と `content.js` の2ファイル。実行時依存なし。
- Chromeへの拡張読み込み、Manifestの実際のマッチングと挿入、ログイン済みSiriusでの確認は未実施。自動テストの成功をこれらの代替にしない。
- [Issue #3](https://github.com/hoki621/sirius-chromeextention/issues/3) は実機確認とmainへの反映が終わるまで開いたままにする。

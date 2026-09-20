# Sirius 学習支援Chrome拡張

東京農工大学のSirius LMSに、科目横断の課題・小テスト一覧を追加する非公式Chrome拡張です。
仕様と実装順序は [計画Issue #1](https://github.com/hoki621/sirius-chromeextention/issues/1) を参照してください。

現在は [Issue #3](https://github.com/hoki621/sirius-chromeextention/issues/3) の開発基盤です。
課題一覧・API取得・設定保存は未実装です。対象ページで読み込み確認のコンソールメッセージのみを出し、画面の変更や通信は行いません。
Sirius固有のデータ形式は [実機調査Issue #2](https://github.com/hoki621/sirius-chromeextention/issues/2) で確認します。

## 開発

Node.js 22 LTS（22.18.0以上、開発・CIは `.nvmrc` の22.23.2）とnpmを使います。
TypeScriptのテストはNode.js標準の型除去と `node:test` で実行します。

```sh
npm ci
npm run check
npm test
npm run build
```

`npm test` はURLの対象判定、権限、ビルド済みコードの実行、配布物の内容を検証します。
パッケージの検査でビルドも実行します。実際のSiriusへは接続しません。
GitHub Actionsも同じ4コマンドを実行します。

## Chromeへの読み込み

1. `npm run build` を実行します。
2. Chromeの `chrome://extensions` を開き、開発者モードを有効にします。
3. 「パッケージ化されていない拡張機能を読み込む」で、このリポジトリの `dist` ディレクトリを選びます。
4. 「Sirius 学習支援」が表示され、エラーがないことを確認します。
5. Siriusの `/portal` ページを開きます。開発者ツールのConsoleで「詳細（Verbose）」を有効にすると、基盤版の読み込みメッセージを確認できます。

ソースを変更したら再ビルドし、拡張の更新ボタンを押してから対象ページを再読み込みしてください。
基盤版には課題一覧ボタンはありません。読み込みメッセージを機能の完成と解釈しないでください。

## 動作範囲とデータ

- 対象は `https://lms.sirius.tuat.ac.jp/portal` とその配下のトップレベルページです。クエリ付きURLも含みます。
- Manifest V3の静的content scriptを使います。API権限は `storage` のみで、基盤版では読み書きしません。
- Cookie値・パスワード・認証コードを読み取ったり保存したりしません。
- 基盤版はLMS通信、提出、受験開始、バックグラウンド処理を行いません。
- 実行時依存はありません。TypeScript、esbuild、Nodeの型定義は開発時だけ使用します。

## 検証の記録

自動テストとChrome実機での確認は区別し、[開発基盤の確認手順](docs/foundation-checks.md) に記録します。
不具合の報告には拡張とChromeのバージョン、再現手順を添えてください。Cookie、認証情報、生の通信記録や学習情報は添付しないでください。

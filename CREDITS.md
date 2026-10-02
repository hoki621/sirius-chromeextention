# 参考プロジェクト

## Comfortable PandA

[Comfortable PandA](https://github.com/das08/ComfortablePandA) の締切別の整理、科目ラベル、締切日時と残り時間の併記を参考にしました。学生の学習環境を改善してきた開発者・貢献者の皆さまに感謝します。

- 参照コミット: `69b7550e088033793a04853e24c3a77576c0761e`
- 参照箇所: `src/components/entryTab.tsx`、`src/components/assignment.tsx`、`public/css/comfortable-sakai.css`
- 参考元のライセンス: Apache-2.0
- 本版では、コード・CSS・画像・ロゴの直接転載は行わず、既存のSirius拡張のHTML・CSSで再実装しています。
- 本拡張は独立した非公式プロジェクトであり、参考元や大学による提供・承認を示すものではありません。

将来コードや素材を直接取り込む際は、個別の適用条件を確認し、該当するライセンス本文、著作権表示、変更表示、関連NOTICEを配布物に含めます。

## Sakai

課題ツールの解決は、[Sakai SiteEntityProvider](https://github.com/sakaiproject/sakai/blob/master/entitybroker/tool/src/main/java/org/sakaiproject/entitybroker/providers/SiteEntityProvider.java) の `pages` GETアクションが提供する `toolId`・`placementId`・`siteId` の仕様を参考にしています。Siriusでの互換性は実機確認の対象です。

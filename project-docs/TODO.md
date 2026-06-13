# NiconiPlaylist TODO

本書は NiconiPlaylist の将来拡張、改善案、未実装の検討項目を整理する。

現行仕様の正本は [spec.md](./spec.md) を参照する。

## 1. オプションページ

- 大量のプレイリストがある際の表示や管理の工夫

## 2. プレイリスト再生

## 3. ポップアップ

## 4. GitHub Pages

## 5. リファクタリング

以下は、変更時の不具合リスクと今後の保守コストを基準にした推奨着手順である。

### 5.1 storage schema と検証・正規化処理の一元化

- 対象:
  - `src/lib/typeGuards.ts`
  - `src/background/services/storage.ts`
  - `src/background/services/dataManagement.ts`
- 背景:
  - storage データの型検証、デフォルト値、正規化、インポート時の補完処理が複数ファイルに分散している。
  - storage 項目や型を追加した際に、検証処理やバックアップ復元処理の更新が漏れる可能性がある。
- 対応方針:
  - storage key ごとに default、validate、normalize を定義する schema を一箇所へ集約する。
  - 通常読み込み、JSON インポート、バックアップ復元で同じ正規化処理を使用する。
  - 外部 schema ライブラリは、現在の手書き実装より保守コストを下げられる場合のみ導入する。
- 完了条件:
  - storage 項目追加時に更新すべき定義箇所が明確になる。
  - 不正データ、旧形式データ、部分的に欠損したデータの正規化をテストできる。

### 5.2 重要領域のテスト拡充

- 対象:
  - `src/background/services/playlistStore.ts`
  - `src/contents/watch.ts`
  - `src/options/tabs/PlaylistsTab.tsx` から切り出した編集ロジック
- 背景:
  - 現在のテストは ID codec、共有 URL、動画 ID 入力、ループ判定、watch message handler の一部に集中している。
  - storage 更新、再生遷移、playlist 編集には回帰テストが不足している。
- 対応方針:
  - 上記のリファクタリングで純粋関数または副作用境界を切り出した後、単体テストを追加する。
  - 過去に発生した不具合を再現するテストケースを優先する。
  - browser API を利用する処理は adapter を mock し、判断ロジック自体を直接テストする。
- 完了条件:
  - storage の並行更新、主要な再生遷移、playlist 編集操作に回帰テストがある。
  - 不具合修正時に、同じ問題を再現するテストを追加できる構造になっている。

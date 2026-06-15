# NiconiPlaylist TODO

本書は NiconiPlaylist の将来拡張、改善案、未実装の検討項目を整理する。

現行仕様の正本は [spec.md](./spec.md) を参照する。

## 1. オプションページ

- 動画タブの大量データ表示に対して、仮想スクロールなどの表示や管理の工夫
- 大量のプレイリストがある際の表示や管理の工夫

## 2. プレイリスト再生

## 3. ポップアップ

## 4. GitHub Pages

## 5. リファクタリング

以下は、変更時の不具合リスクと今後の保守コストを基準にした推奨着手順である。

### 5.1 重要領域のテスト拡充

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

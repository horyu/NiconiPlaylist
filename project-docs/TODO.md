# NiconiPlaylist TODO

本書は NiconiPlaylist の将来拡張、改善案、未実装の検討項目を整理する。

現行仕様の正本は [spec.md](./spec.md) を参照する。

## 1. オプションページ

- 動画タブの大量データ表示に対して、ページネーションなどの表示や管理の工夫
- 大量のプレイリストがある際の表示や管理の工夫

## 2. プレイリスト再生

## 3. ポップアップ

## 4. GitHub Pages

## 5. リファクタリング

以下は、変更時の不具合リスクと今後の保守コストを基準にした推奨着手順である。

### 5.1 `PlaylistsTab` の責務分割

- 対象:
  - `src/options/tabs/PlaylistsTab.tsx`
  - `src/options/components/PlaylistDetailVideoList.tsx`
- 背景:
  - `PlaylistsTab` が一覧表示、選択、編集下書き、動画追加・削除・並べ替え、共有 URL、JSON 出力、再生操作を担当している。
  - 編集状態の初期化処理が複数箇所に重複し、UI 変更時に関連処理を追跡しにくい。
- 対応方針:
  - 動画追加、削除、移動、並べ替えを純粋関数として `playlistDraft` などへ切り出す。
  - 編集下書きと保存処理を `usePlaylistDetailEditor` などの専用 hook に分離する。
  - 一覧、詳細、編集フォーム、共有・エクスポート操作を個別コンポーネントへ分割する。
  - 分割後も playlist 選択や編集開始時に不要な再生成が起きない構成にする。
- 完了条件:
  - playlist 編集ロジックを UI なしで単体テストできる。
  - 編集状態の初期化・キャンセル処理が一箇所に集約される。
  - `PlaylistsTab` は画面全体の構成と主要状態の接続を中心に担当する。

### 5.2 再生設定の自動保存処理の分離

- 対象:
  - `src/options/tabs/RepeatSettingsTab.tsx`
  - `src/background/services/playbackSettings.ts`
- 背景:
  - `RepeatSettingsTab` がフォーム表示に加えて、debounce、保存中の追加更新、アンマウント時保存、エラー通知を管理している。
  - 保存タイミングの変更が入力フォーカスやフォーム表示へ影響しやすい。
- 対応方針:
  - 最新の更新要求まで順番に保存する `createAutoSaveQueue` などの共通処理を切り出す。
  - 設定値の編集状態と永続化状態を明確に分離する。
  - 必要に応じて、リピートプリセット、完了通知、ナビゲーション設定を個別コンポーネントへ分割する。
- 完了条件:
  - 連続入力、保存中の追加更新、blur 保存、アンマウント時保存を単体テストできる。
  - 自動保存によって入力要素のフォーカスや入力途中の値が失われない。

### 5.3 動画タブの metadata 更新方式の見直し

- 対象:
  - `src/options/tabs/VideosTab.tsx`
  - `src/options/hooks/useVideoMetadataState.ts`
- 背景:
  - metadata 取得のたびに動画タブ全体が再評価される問題を避けるため、初回取得時の metadata snapshot を表示中に固定している。
  - snapshot 固定後に取得されたタイトルやサムネイルは、タブを開き直すまで表示へ反映されない。
  - 大量データ表示への対応は既存 TODO にも残っている。
- 対応方針:
  - 行単位の更新、明示的な更新ボタン、ページネーションまたは仮想化のうち、採用する更新方式を決定する。
  - metadata 更新時に一覧全体のソート・フィルター・DOM が再構築されないようにする。
  - snapshot を維持する場合は、更新条件とユーザー向けの再取得方法を明示する。
- 完了条件:
  - metadata 取得中でもスクロール位置や操作状態を維持できる。
  - 新しく取得した metadata を、タブの再表示や明示操作によって確実に反映できる。
  - 大量の動画がある場合も操作可能な表示速度を維持できる。

### 5.4 storage schema と検証・正規化処理の一元化

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

### 5.5 重要領域のテスト拡充

- 対象:
  - `src/background/services/playlistStore.ts`
  - `src/contents/watch.ts`
  - `src/options/tabs/PlaylistsTab.tsx` から切り出した編集ロジック
  - `src/options/tabs/RepeatSettingsTab.tsx` から切り出した自動保存処理
- 背景:
  - 現在のテストは ID codec、共有 URL、動画 ID 入力、ループ判定、watch message handler の一部に集中している。
  - storage 更新、再生遷移、playlist 編集、自動保存には回帰テストが不足している。
- 対応方針:
  - 上記のリファクタリングで純粋関数または副作用境界を切り出した後、単体テストを追加する。
  - 過去に発生した不具合を再現するテストケースを優先する。
  - browser API を利用する処理は adapter を mock し、判断ロジック自体を直接テストする。
- 完了条件:
  - storage の並行更新、主要な再生遷移、playlist 編集操作、自動保存競合に回帰テストがある。
  - 不具合修正時に、同じ問題を再現するテストを追加できる構造になっている。

# NiconiPlaylist

ニコニコ動画に独自のプレイリスト機能を提供するブラウザ拡張機能です。

- 共有 URL からプレイリストをインポートして保存できる
- 保存済みプレイリストを連続再生できる
- GitHub Pages で共有 URL の内容をプレビューできる

技術スタック: Bun / Vite+ / WXT / SolidJS / Tailwind CSS

## クイックスタート

```powershell
mise trust
mise install
bun install
bun run vp config
```

`bun run vp config` は、このプロジェクトで使用される Vite+ の Git フックを設定します。

## 主な開発コマンド

- `bun run dev`: Chrome 向け開発サーバーを起動
- `bun run build`: 拡張機能を build
- `bun run test`: Bun test を実行
- `bun run check`: format / lint / typecheck を実行
- `bun run fix`: 自動修正付きで check を実行
- `bun run docs`: `src/docs/*` から `docs/index.html` を生成

## ディレクトリ概要

- `project-docs/`: 仕様書の正本や実装メモ、TODO などのドキュメント
- `src/`: 拡張機能本体
- `src/docs/`: GitHub Pages 向け docs ページの source
- `docs/`: GitHub Pages 公開用の build output
- `scripts/`: 補助スクリプト

### `project-docs/` の内容

- `project-docs/spec.md`: 全体仕様、UI 挙動、データ保持方針
- `project-docs/id-codec.md`: プレイリスト共有 URL の ID 列エンコード仕様
- `project-docs/video-metadata-api.md`: 動画メタデータ取得・保存方針
- `project-docs/user-agent.md`: User-Agent 対応方針
- `project-docs/watch-page-integration.md`: watch ページ遷移、`from=0`、SPA 連携まわりの実装メモ
- `project-docs/TODO.md`: 将来拡張、改善案、保留中の作業

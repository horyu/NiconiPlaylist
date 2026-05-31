# NiconiPlaylist

ニコニコ動画に独自のプレイリスト機能を提供するブラウザ拡張機能です。

## クイックスタート

```powershell
mise trust
mise install
bun install
bun run vp config
```

`bun run vp config` は、このプロジェクトで使用される Vite+ の Git フックを設定します。フックをインストールしたくない場合は、このコマンドをスキップしてください。

## Documentation

設計・仕様書の正本は `project-docs/` に置く。  
未実装の将来拡張や改善案は `project-docs/TODO.md` に置く。  
`docs/` は GitHub Pages 公開用ディレクトリとして扱う。
`src/docs/` は docs ページの source で、`bun run docs` により `docs/index.html` を生成する。

- `project-docs/spec.md`
  - 全体仕様、UI 挙動、データ保持方針
- `project-docs/id-codec.md`
  - プレイリスト共有 URL の ID 列エンコード仕様
- `project-docs/video-metadata-api.md`
  - 動画メタデータ取得・保存方針
- `project-docs/user-agent.md`
  - User-Agent 対応方針
- `project-docs/watch-page-integration.md`
  - watch ページ遷移、`from=0`、SPA 連携まわりの実装メモ
- `project-docs/TODO.md`
  - 将来拡張、改善案、保留中の作業

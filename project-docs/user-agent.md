# User-Agent 対応方針

## 1. 目的

NiconiPlaylist は、外部 API を利用する際に、クライアント識別子を `User-Agent` として明示する。

対象は以下の API に限定する。

- `https://nvapi.nicovideo.jp/v1/videos`

ただし、公式ページや他クライアントの同一 API 呼び出しを巻き込まないため、NiconiPlaylist 自身が付与した query marker を持つ request だけを上書き対象とする。

`User-Agent` 文字列は以下を用いる。

```txt
NiconiPlaylist (+https://github.com/horyu/NiconiPlaylist)
```

## 2. 結論

NiconiPlaylist では、`User-Agent` 上書きを必須とする。

ただし、通常の `fetch()` や `XMLHttpRequest` の header 指定には依存しない。

ブラウザ拡張からの `User-Agent` 上書きは、ブラウザごとのネットワークリクエスト改変 API を用いて行う。

## 3. 実装方針

外部 API への通信は、content script ではなく background/service worker 側で行う。

`User-Agent` の上書きは、通信コードではなくブラウザ拡張 API 側で行う。

ブラウザごとの採用方針は以下とする。

- Chrome / Edge: `declarativeNetRequest.modifyHeaders`
- Firefox: `webRequest.onBeforeSendHeaders`

Safari はサポート対象に含めない。

`User-Agent` の操作は `append` ではなく `set` による完全上書きを基本とする。

## 4. 採用しない方法

以下の方法は採用しない。

- `fetch()` の `headers` に `User-Agent` を直接指定する
- `XMLHttpRequest` の request header に `User-Agent` を直接指定する
- `X-User-Agent` などの独自ヘッダーで代替する
- content script から直接外部 API を呼ぶ

## 5. 権限方針

権限は最小限とし、対象 API の host permission だけを要求する。

`User-Agent` 上書きルールも対象 API の URL にだけ適用し、`<all_urls>` のような広い対象指定は行わない。

Chrome 系では `declarativeNetRequestWithHostAccess` を用い、既存の host permission 前提で動作させる。

## 6. テスト方針

確認対象は、JavaScript 上の request 設定ではなく、実際に送信された HTTP request header とする。

- background/service worker からの API request に `User-Agent` が反映されている
- marker の無い対象 API request には `User-Agent` を変更しない
- 対象外 URL に対しては `User-Agent` を変更しない
- ルール再読み込み後も同じ挙動を維持する

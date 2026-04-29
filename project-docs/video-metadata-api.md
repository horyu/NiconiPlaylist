# 動画メタデータ取得・保存方針

本書は、NiconiPlaylist が動画タイトル、サムネイル、再生時間などのメタデータを取得する際の API 利用方針を整理する。

## 1. 目的

プレイリスト共有 URL の `videoIds` には動画 ID しか含まれない。

そのため、ポップアップやオプションページで以下を表示するには、別途動画メタデータの取得が必要になる。

- 動画タイトル
- サムネイル URL
- 再生時間
- 動画概要の一部

## 2. 使用予定 API

使用予定 API は以下。

```txt
GET https://nvapi.nicovideo.jp/v1/videos?watchIds={videoId}
```

リクエストヘッダは以下を付与する。

```txt
x-Frontend-Id: 6
x-Frontend-Version: 0
```

User-Agent の対応方針は [User-Agent 対応方針](./user-agent.md) を正とする。

## 3. 単体取得の実測結果

Node.js から以下のリクエストを実行し、`200 OK` を確認した。

```ts
await fetch("https://nvapi.nicovideo.jp/v1/videos?watchIds=so46209323", {
  method: "GET",
  headers: {
    "x-Frontend-Id": "6",
    "x-Frontend-Version": "0",
  },
});
```

- `credentials: "include"` は不要
- 単体の `watchIds` 指定では `200 OK` が返る
- JSON には `title`, `thumbnail`, `duration`, `shortDescription` などが含まれる

```json
{
  "watchId": "so46209323",
  "video": {
    "id": "so46209323",
    "title": "名探偵プリキュア！ 第12話「キュアアルカナ・シャドウの秘密」",
    "thumbnail": {
      "url": "...",
      "middleUrl": "...",
      "largeUrl": "..."
    },
    "duration": 1450,
    "shortDescription": "...",
    "owner": {
      "id": "ch2650013",
      "name": "名探偵プリキュア！"
    }
  }
}
```

## 4. 複数取得について

`watchIds` の複数指定は、2026/04/29 時点では利用できない。

確認した結果:

- `?watchIds=so46209323&watchIds=sm25950409`
  - 最後の 1 件だけ取得される
- `?watchIds=so46209323,sm25950409`
  - `400 Bad Request`
- `?watchIds[]=so46209323&watchIds[]=sm25950409`
  - `500 Internal Server Error`
- `?watchIds[0]=so46209323&watchIds[1]=sm25950409`
  - `500 Internal Server Error`
- `?watchIds=["so46209323","sm25950409"]`
  - `400 INVALID_PARAMETER`

そのため、本プロジェクトではこの API を複数動画一括取得 API としては扱わない。

## 5. 利用方針

動画メタデータは都度描画のたびに取得しない。

方針は以下。

- 動画メタデータはプレイリストのインポート時、生成時、または明示的な更新時に取得する
- 取得したメタデータは拡張機能の local storage に保存する
- ポップアップ表示時は原則として local storage に保存済みのメタデータを参照する
- メタデータが未取得の動画のみを追加取得対象とする
- 一括取得が使えない前提で、必要な動画 ID を単体取得で順次または制限付き並列取得する

## 6. 保存戦略

動画メタデータは `watchId` 単位で保持する。

投稿者情報は動画メタデータに埋め込まず、`owner.id` を参照キーとして別に保持する。

動画メタデータは基本的に永続保持する。

どの保存済みプレイリストからも参照されない動画メタデータは、クリーンアップ対象として扱う。

クリーンアップは自動実行せず、ユーザーの明示操作でのみ行う。

投稿者情報も同様に基本的に永続保持し、どの動画メタデータからも参照されない場合にクリーンアップ対象とする。

## 7. 更新戦略

メタデータは自動更新しない。

再取得はユーザーの明示操作でのみ行う。

## 8. 保存対象

動画 ID に付随して、以下を保持する。

- `watchId`
- `title`
- `thumbnail.url`
- `thumbnail.middleUrl`
- `thumbnail.largeUrl`
- `thumbnail.listingUrl`
- `thumbnail.nHdUrl`
- `duration`
- `ownerId`
- `fetchedAt`

投稿者情報は別単位で以下を保持する。

- `owner.id`
- `owner.name`
- `owner.type`
- `owner.iconUrl`
- `fetchedAt`

## 9. 表示戦略

ポップアップやオプションページは保存済みメタデータを表示する。

未取得の動画がある場合のみ追加取得する。

既存メタデータが存在する場合は、それを優先して表示する。

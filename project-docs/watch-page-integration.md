# watch ページ連携メモ

本書は `https://www.nicovideo.jp/watch/*` との連携で観測した実装依存の挙動と、その扱い方を整理する。

現行仕様の正本は [spec.md](./spec.md) を参照する。

## 1. 目的

NiconiPlaylist は watch ページ上で以下を行う。

- 現在の動画 ID と再生コンテキストを同期する
- 再生終了を検知して次動画へ進む
- 必要に応じて同一動画をリピートする
- 次動画遷移後に再生タブへフォーカスし、必要なら元のタブへ戻す

この連携はニコニコ動画側のページ実装に依存するため、仕様書とは分けて扱う。

## 2. 前提

watch ページは通常のフルリロードだけでなく、同一タブ内の SPA 遷移を行う。

そのため以下の特徴がある。

- content script 自体はページ遷移中も維持されることがある
- `history.pushState` / `history.replaceState` による URL 変更が発生する
- JavaScript の変数状態が一部持ち越される
- 一方で動画プレイヤー周辺の DOM は再構築される

このため、ブラウザの通常ロード完了だけでは次動画への遷移完了を判定しにくい。

## 3. 次動画遷移 URL

次動画へ進む時は以下の URL を使う。

```txt
https://www.nicovideo.jp/watch/{videoId}?from=0
```

`from=0` を付ける理由は以下。

- ページ内の前回再生位置を持ち越さない
- 次動画を常に先頭から再生させる
- 遷移後に canonical URL へ変化する挙動を route-ready の判定材料として使える

## 4. SPA 遷移検知

watch ページでは MAIN world で `history.pushState` / `history.replaceState` / `popstate` を監視し、`niconiplaylist:locationchange` を発火させる。

content script 側ではこのイベントを受けて以下を行う。

- 現在の動画 ID を再同期する
- route-ready 待ちを開始する

## 5. route-ready の扱い

### 5.1 背景

非アクティブタブで次動画へ進めた場合、watch ページ側の DOM 構築や `video` 要素生成が期待どおり進まないことがある。

そのため、単に URL を切り替えた直後ではなく、「watch ページ側が次動画へ進み切った」後で再生タブへフォーカスする必要がある。

### 5.2 採用している判定

現状は以下を route-ready とみなす。

1. `?from=0` 付き URL への遷移を観測する
2. 続いて `from=0` が消えた canonical URL への変化を観測する
3. その時点で `watch:route-ready` を background へ通知する

この判定を採用している理由は以下。

- `MutationObserver` や polling で DOM 差し替わりを厳密に追うより単純
- `title` や `meta[property="og:url"]` の変化より安定して観測できた
- 現行の `?from=0` 付き遷移と自然に組み合わせられる

### 5.3 期待している次動画との照合

watch ページでは、拡張機能が次動画を決めた時点で `expectedNextVideoId` を content script 側に保持する。

その後 `niconiplaylist:locationchange` が発生した時は、

- 現在の `watch/{videoId}` と `expectedNextVideoId` を照合する
- route-ready 待ち中に別の動画 ID へ遷移していた場合は、`location.href = buildWatchUrl(expectedNextVideoId)` で正しい URL へ戻す

この処理を入れている理由は以下。

- 拡張機能側が次動画遷移を実行した後に、ニコニコ動画公式の自動遷移が遅れて走り、別動画へ上書きされることがある
- 単に URL 変化を観測するだけでは「正しい次動画へ進んだか」を保証できない

`expectedNextVideoId` は固定時間で破棄せず、次の playlist 遷移が始まるか playback context が終了するまで保持する。

## 6. React Router と `location.href`

次動画遷移は MAIN world で以下の順に試みる。

1. `window.__reactRouterDataRouter?.navigate(...)`
2. 利用できなければ `location.href = ...`

意図は以下。

- 通常はページ内 SPA 遷移を優先する
- 内部 Router が利用できない場合でもフル遷移で継続できるようにする

`__reactRouterDataRouter` は watch ページ内部実装への依存であり、将来変更される可能性がある。

## 7. 再生タブの前面化

次動画遷移前に即座に再生タブを前面化すると、ユーザーが指定した待機時間の意味が薄くなりやすい。

そのため現状は以下の順で処理する。

1. 次動画 URL への遷移だけを先に実行する
2. content script 側で、期待している次動画 ID と実際の `watch/{videoId}` を照合しながら待つ
3. canonical URL への切り替わりを観測した後、短い `setTimeout` で少し待つ
4. その後に `watch:route-ready` を通知し、再生タブを前面化する
5. 再生設定に応じて、一定時間後に元のタブへ戻す

この構成により、ユーザーが設定した待機時間を「次動画表示後の待機時間」に近づけている。

現状の短い待機時間は `50ms` としている。`requestAnimationFrame` は非アクティブタブで期待どおり発火しないことがあったため採用していない。

## 8. 広告と終了判定

watch ページにはニコニコ広告が存在し、シークバー上では本編と広告領域が連続して見えることがある。

このため、単純な `video.currentTime` だけでは「本編末尾を越えて広告領域へ入った」ケースを取りこぼすことがある。

現状は `pause` / `ended` の両イベントを監視し、どちらで来ても同じ終了処理へ流す。

- `pause` しか来ないケースがある
- `ended` しか来ないケースがある
- 同じ再生終了で `pause` と `ended` の両方が短時間に飛ぶこともある

そのため、終了判定そのものは以下を使いつつ、`videoId`・`currentSrc`・再生位置を使った短時間の重複抑止を行う。

- 重複抑止の対象は、同じ終了に対して `pause` と `ended` が連続して飛ぶケースに限る
- 同一イベント種別での次回終了までは潰さない

終了判定条件は以下。

- `video.ended`
- `video.duration - video.currentTime <= 1s`
- fallback として `aria-label="video - currentTime"` の `aria-valuenow >= video.duration`

広告動画そのものは `title` と `src` による判定で除外する。

## 9. 今後の注意点

- ニコニコ動画側で Router 実装が変わると `navigate()` 分岐が壊れる可能性がある
- `?from=0` の canonical 化挙動が変わると route-ready 判定が壊れる可能性がある
- 広告動画やシークバー DOM の仕様変更で終了判定が影響を受ける可能性がある

watch ページ連携に不具合が出た場合は、まず本書の前提に依存している箇所を見直す。

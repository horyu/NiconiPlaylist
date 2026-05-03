# ID 列エンコード仕様

本書は NiconiPlaylist のプレイリスト URL に載せる ID列を、短い URL-safe 文字列へ可逆変換する方式を定義する。

本書では、ニコニコ動画の動画ID（例: `sm9`, `so5364283`, `nm2829323`, `ss46168863`）の列を対象とする。

以後、本文では単に ID または ID列と表記する。

コード例では `videoId` / `videoIds` を用いる。

## 1. 目的

以下のような ID列を、URL に載せやすい短い文字列へ圧縮し、元の順序を保ったまま可逆復元できるようにする。

```txt
sm45764446
sm16579252
so5364283
nm2829323
ss46168863
```

対象とする ID 群は以下の構造を持つ。

- 接頭辞: `sm`, `so`, `nm`, `ss`
- 数値部: 10 進整数
- 順序は重要
- 同じ値が含まれてもよい
- 並び替えは禁止
- URL-safe な文字列へ変換する

## 2. 方針

汎用圧縮ではなく、ID の構造を利用した軽量な専用エンコードを用いる。

採用方針は以下。

- prefix は少数種なので固定テーブル化する
- 数値部は前項との差分 (`delta`) で表現する
- 差分は ZigZag エンコーディングで非負整数化する
- 整数列は `varint` で可変長符号化する
- 最後に `base64url` で URL-safe 文字列化する

圧縮パイプラインは以下。

1. 文字列 ID を `prefix + numeric` に分解する
2. prefix を小さい整数コードへ変換する
3. numeric を delta 化する
4. delta を ZigZag エンコーディングで非負整数化する
5. prefix code + ZigZag エンコード済み delta をバイト列へエンコードする
6. バイト列を base64url へ変換する

復元時は逆順で戻す。

## 3. この方式を採用する理由

- URL 埋め込み用途に向いている
- 順序保持と重複許可の条件に適合する

URL 全体の長さや最大動画件数は、本コーデックではなく利用側の仕様で制御する。

## 4. 公開 API

TypeScript で以下を提供する。

```ts
export function encodeIds(ids: string[]): string;
export function decodeIds(encoded: string): string[];
```

想定利用例:

```ts
const ids = ["sm45764446", "so5364283", "nm2829323", "ss46168863"];
const encoded = encodeIds(ids);
const decoded = decodeIds(encoded);

// decoded は ids と完全一致する
```

実際のエンコード例として、`sm9`, `so5364283`, `nm2829323`, `ss46168863` を共有 URL にしたものは以下。

```txt
https://horyu.github.io/NiconiPlaylist/import?videoIds=BOQS5OiOBd-4tQKovKop
```

空配列も可逆変換の対象とする。

`encodeIds([])` は `count = 0` の encoded string を返し、`decodeIds` はそれを `[]` として復元する。

## 5. prefix の扱い

サポート対象 prefix は以下。

- `sm`
- `so`
- `nm`
- `ss`

他のID接頭辞（ [ID - ニコ百](https://dic.nicovideo.jp/a/id) を参照）はこの拡張機能ではサポートしない。

prefix code は以下とする。

```ts
const PREFIX_TO_CODE = {
  sm: 0,
  so: 1,
  nm: 2,
  ss: 3,
} as const;
```

prefix code は 4 種類なので、2bit で packing して格納する。

1 byte には最大 4 件分の prefix code を格納する。

4 件に満たない末尾の余りは 0 で埋める。

## 6. バイト列の構造

復元時に余りを正しく無視するため、エンコード本体の先頭に ID 件数を varint で格納する。

バイト列の構造は以下とする。

```txt
[count varint][packed prefix bytes][ZigZag encoded delta varints...]
```

`packed prefix bytes` の長さは `ceil(count / 4)` で算出する。

各 byte 内の bit 配置は、先頭 ID から順に下位 bit 側へ詰める。

```txt
byte = prefix0 | (prefix1 << 2) | (prefix2 << 4) | (prefix3 << 6)
```

## 7. 数値部の扱い

例:

```txt
sm45764446 -> prefix=sm, number=45764446
```

数値部は 1 桁以上 9 桁以下の 10 進整数とし、先頭ゼロは不許可とする。

つまり、受け入れる ID は `^(sm|so|nm|ss)[1-9][0-9]{0,8}$` に一致するものに限定する。

delta と ZigZag エンコード後の値も signed 32bit に収まる。

## 8. delta エンコード

順序を変えずに、前項との差分を取る。

例:

```txt
45764446
16579252
38037909
```

delta 化:

```txt
45764446
-29185194
21458657
```

先頭要素は `prev = 0` からの差分として扱う。

## 9. ZigZag エンコーディング

delta は負になることがあるため、varint の前に ZigZag エンコーディングで非負整数へ写像する。

期待挙動:

```txt
0  -> 0
-1 -> 1
1  -> 2
-2 -> 3
2  -> 4
```

ZigZag エンコーディングは、JS の 32bit ビット演算に依存しない算術式で実装する。

## 10. varint

非負整数を 7bit continuation 形式の varint で格納する。

ルール:

- 下位 7bit を使う
- 継続がある場合は MSB を 1 にする
- 最後の byte は MSB を 0 にする

## 11. base64url

最終的なバイト列を URL-safe な base64 にする。

要件:

- `+` は `-` に変換する
- `/` は `_` に変換する
- 末尾の `=` padding は削除する
- デコード時は逆変換し、padding を復元する

base64 変換には browser 標準 API の `atob` / `btoa` を利用する。

## 12. エンコード手順

概略:

```txt
write count as varint
write packed prefix bytes

prev = 0

for each id:
  parse prefix and number
  delta = number - prev
  prev = number
  zz = zigzag(delta)
  writeVarint(zz)

base64url encode bytes
```

## 13. デコード手順

概略:

```txt
bytes = base64url decode encoded
count = read varint
read ceil(count / 4) bytes as packed prefixes
prev = 0

for index in 0..<count:
  read prefixCode from packed prefixes
  read varint zz
  delta = unzigzag(zz)
  num = prev + delta
  prev = num
  rebuild string
```

## 14. バリデーション

### 14.1 encodeIds

以下の場合は例外を投げる。

- 入力が配列でない
- 要素が文字列でない
- `^(sm|so|nm|ss)[1-9][0-9]{0,8}$` にマッチしない

### 14.2 decodeIds

以下の場合は例外を投げる。

- 不正な base64url
- 件数 varint が読めない
- prefix packing 部分の長さが不足している
- varint の継続 byte が不足している
- 復元途中で delta または ZigZag デコード後の値が signed 32bit を超える
- 復元途中で videoId の数値部が 1 以上 999_999_999 以下の範囲外になる
- count 件を復元した後に余剰バイトが残っている

## 15. テスト要件

最低限、以下を確認する。

### 15.1 基本ケース

```ts
[];
["sm1"];
["sm1", "sm2", "sm3"];
["sm45764446", "so5364283", "nm2829323", "ss46168863"];
```

### 15.2 重複あり

```ts
["sm100", "sm100", "sm100"];
["so5", "so5", "nm5", "nm5"];
```

### 15.3 増減混在

```ts
["sm100", "sm200", "sm150", "sm1000", "sm10"];
```

### 15.4 prefix 混在

```ts
["sm1", "so2", "nm3", "ss4", "sm5", "so6"];
```

### 15.5 大きめデータ

数百件程度のサンプルを生成し、以下が完全一致することを確認する。

```ts
decodeIds(encodeIds(ids));
```

### 15.6 不正系

- 数字なし
- 数値部の先頭ゼロ
- 数値部が 10 桁以上
- 不正 base64url
- 継続 byte が不足している varint

## 16. 受け入れ条件

- `encodeIds` / `decodeIds` が実装されている
- テストが通る
- 数百件規模の round-trip が通る
- README またはソースコメントに方式説明がある

## 17. 採用しない方針

本エンコードは軽量な専用形式として維持する。

以下は初期実装だけでなく、今後も原則として採用しない。

- `q_compress` の導入
- 外部ライブラリ導入
- sort / reorder を伴う圧縮
- 非可逆圧縮

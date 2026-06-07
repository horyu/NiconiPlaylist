import { describe, expect, test } from "bun:test";

import { decodeIds, encodeIds } from "./idCodec";

const BASE64_URL_PADDING_PATTERN = /=+$/u;

function encodeBytesToBase64Url(bytes: number[]): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_URL_PADDING_PATTERN, "");
}

function decodeBase64UrlToBytes(encoded: string): Uint8Array {
  const paddingLength = (4 - (encoded.length % 4)) % 4;
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(paddingLength);
  const binary = atob(base64);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

describe("encodeIds / decodeIds", () => {
  test("空配列を可逆変換できる", () => {
    expect(decodeIds(encodeIds([]))).toEqual([]);
  });

  test("単一の ID を可逆変換できる", () => {
    expect(decodeIds(encodeIds(["sm1"]))).toEqual(["sm1"]);
  });

  test("連番の ID を可逆変換できる", () => {
    const videoIds = ["sm1", "sm2", "sm3"];

    expect(decodeIds(encodeIds(videoIds))).toEqual(videoIds);
  });

  test("prefix 混在と大きな ID を可逆変換できる", () => {
    const videoIds = ["sm45764446", "sm16579252", "so5364283", "nm2829323"];

    expect(decodeIds(encodeIds(videoIds))).toEqual(videoIds);
  });

  test("重複と減少を含む ID 列を可逆変換できる", () => {
    const videoIds = ["sm100", "sm100", "so50", "so5", "nm999999999"];

    expect(decodeIds(encodeIds(videoIds))).toEqual(videoIds);
  });

  test("数百件の生成 ID 列を可逆変換できる", () => {
    const prefixes = ["sm", "so", "nm"] as const;
    const videoIds = Array.from({ length: 200 }, (_, index) => {
      const prefix = prefixes[index % prefixes.length];
      const numeric = ((index * 79_193) % 999_999_999) + 1;
      return `${prefix}${numeric}`;
    });

    expect(decodeIds(encodeIds(videoIds))).toEqual(videoIds);
  });

  test("sm 偏重列では default prefix mode が選ばれる", () => {
    const encoded = encodeIds([
      "so1",
      "sm2",
      "sm3",
      "sm4",
      "sm5",
      "sm6",
      "sm7",
      "sm8",
      "sm9",
      "sm10",
      "sm11",
      "sm12",
      "sm13",
      "sm14",
      "sm15",
      "sm16",
      "sm17",
      "sm18",
      "sm19",
      "sm20",
    ]);
    const mode = decodeBase64UrlToBytes(encoded)[0]! & 0b11;

    expect(mode).toBe(0);
  });

  test("default prefix が効きにくい混在列では base-3 mode が選ばれる", () => {
    const encoded = encodeIds(["sm1", "so2", "nm3", "sm4", "so5", "nm6", "sm7", "so8", "nm9"]);
    const mode = decodeBase64UrlToBytes(encoded)[0]! & 0b11;

    expect(mode).toBe(3);
  });

  test("so 偏重列では so default mode が選ばれる", () => {
    const encoded = encodeIds([
      "sm1",
      "so2",
      "so3",
      "so4",
      "so5",
      "so6",
      "so7",
      "so8",
      "so9",
      "so10",
      "so11",
      "so12",
      "so13",
      "so14",
      "so15",
      "so16",
      "so17",
      "so18",
      "so19",
      "so20",
    ]);
    const mode = decodeBase64UrlToBytes(encoded)[0]! & 0b11;

    expect(mode).toBe(1);
  });

  test("nm 偏重列では nm default mode が選ばれる", () => {
    const encoded = encodeIds([
      "sm1",
      "nm2",
      "nm3",
      "nm4",
      "nm5",
      "nm6",
      "nm7",
      "nm8",
      "nm9",
      "nm10",
      "nm11",
      "nm12",
      "nm13",
      "nm14",
      "nm15",
      "nm16",
      "nm17",
      "nm18",
      "nm19",
      "nm20",
    ]);
    const mode = decodeBase64UrlToBytes(encoded)[0]! & 0b11;

    expect(mode).toBe(2);
  });

  test("不正な入力 ID で例外を投げる", () => {
    expect(() => encodeIds(["sm01"])).toThrowError("Invalid video ID.");
    expect(() => encodeIds(["zz123"])).toThrowError("Invalid video ID.");
    expect(() => encodeIds(["ss123"])).toThrowError("Invalid video ID.");
  });

  test("不正な base64url で例外を投げる", () => {
    expect(() => decodeIds("!")).toThrowError("Invalid base64url.");
    expect(() => decodeIds("a")).toThrowError("Invalid base64url.");
  });

  test("mode が不正なら例外を投げる", () => {
    expect(() => decodeIds(encodeBytesToBase64Url([0x04]))).toThrowError("Invalid mode.");
  });

  test("件数 varint が不足していると例外を投げる", () => {
    expect(() => decodeIds(encodeBytesToBase64Url([0x00, 0x80]))).toThrowError(
      "Incomplete varint.",
    );
  });

  test("例外 bit 列が不足していると例外を投げる", () => {
    expect(() => decodeIds(encodeBytesToBase64Url([0x00, 0x02, 0x01, 0x00]))).toThrowError(
      "Packed exception type bits are missing.",
    );
  });

  test("mode 3 の prefix payload 長が不足していると例外を投げる", () => {
    expect(() => decodeIds(encodeBytesToBase64Url([0x03, 0x01, 0x01]))).toThrowError(
      "Packed base-3 prefix bytes are missing.",
    );
  });

  test("mode 3 で prefix payload 長が 0 の列を復元できる", () => {
    expect(decodeIds(encodeBytesToBase64Url([0x03, 0x03, 0x00, 0x02, 0x02, 0x02]))).toEqual([
      "sm1",
      "sm2",
      "sm3",
    ]);
  });

  test("delta varint が不足していると例外を投げる", () => {
    const encoded = encodeBytesToBase64Url([0x00, 0x01, 0x00, 0x01, 0x80]);

    expect(() => decodeIds(encoded)).toThrowError("Incomplete varint.");
  });

  test("ZigZag 値が signed 32bit を超えると例外を投げる", () => {
    const encoded = encodeBytesToBase64Url([0x00, 0x01, 0x00, 0x01, 0x80, 0x80, 0x80, 0x80, 0x08]);

    expect(() => decodeIds(encoded)).toThrowError("Invalid ZigZag value.");
  });

  test("復元後の数値部が許容範囲外なら例外を投げる", () => {
    const encoded = encodeBytesToBase64Url([0x00, 0x01, 0x00, 0x01, 0x80, 0x94, 0xeb, 0xdc, 0x07]);

    expect(() => decodeIds(encoded)).toThrowError("Decoded numeric part is out of range.");
  });

  test("復元後に余剰バイトが残ると例外を投げる", () => {
    const encoded = encodeIds(["sm1"]);
    expect(() => decodeIds(`${encoded}AA`)).toThrowError("Unexpected trailing bytes.");
  });
});

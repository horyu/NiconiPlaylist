import { describe, expect, test } from "bun:test";

import { decodeIds, encodeIds } from "./idCodec";

function encodeBytesToBase64Url(bytes: number[]): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
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
    const videoIds = ["sm45764446", "sm16579252", "so5364283", "nm2829323", "ss46168863"];

    expect(decodeIds(encodeIds(videoIds))).toEqual(videoIds);
  });

  test("重複と減少を含む ID 列を可逆変換できる", () => {
    const videoIds = ["sm100", "sm100", "ss50", "so5", "nm999999999"];

    expect(decodeIds(encodeIds(videoIds))).toEqual(videoIds);
  });

  test("数百件の生成 ID 列を可逆変換できる", () => {
    const prefixes = ["sm", "so", "nm", "ss"] as const;
    const videoIds = Array.from({ length: 200 }, (_, index) => {
      const prefix = prefixes[index % prefixes.length];
      const numeric = ((index * 79_193) % 999_999_999) + 1;
      return `${prefix}${numeric}`;
    });

    expect(decodeIds(encodeIds(videoIds))).toEqual(videoIds);
  });

  test("不正な入力 ID で例外を投げる", () => {
    expect(() => encodeIds(["sm01"])).toThrowError("Invalid video ID.");
    expect(() => encodeIds(["zz123"])).toThrowError("Invalid video ID.");
    expect(() => encodeIds(["ss1234567890"])).toThrowError("Invalid video ID.");
  });

  test("不正な base64url で例外を投げる", () => {
    expect(() => decodeIds("!")).toThrowError("Invalid base64url.");
    expect(() => decodeIds("a")).toThrowError("Invalid base64url.");
  });

  test("件数 varint が不足していると例外を投げる", () => {
    expect(() => decodeIds(encodeBytesToBase64Url([0x80]))).toThrowError("Incomplete varint.");
  });

  test("prefix packing 部分が不足していると例外を投げる", () => {
    expect(() => decodeIds(encodeBytesToBase64Url([0x01]))).toThrowError(
      "Packed prefix bytes are missing.",
    );
  });

  test("delta varint が不足していると例外を投げる", () => {
    expect(() => decodeIds(encodeBytesToBase64Url([0x01, 0x00, 0x80]))).toThrowError(
      "Incomplete varint.",
    );
  });

  test("ZigZag 値が signed 32bit を超えると例外を投げる", () => {
    expect(() =>
      decodeIds(encodeBytesToBase64Url([0x01, 0x00, 0x80, 0x80, 0x80, 0x80, 0x08])),
    ).toThrowError("Invalid ZigZag value.");
  });

  test("復元後の数値部が許容範囲外なら例外を投げる", () => {
    expect(() =>
      decodeIds(encodeBytesToBase64Url([0x01, 0x00, 0x80, 0x94, 0xeb, 0xdc, 0x07])),
    ).toThrowError("Decoded numeric part is out of range.");
  });

  test("復元後に余剰バイトが残ると例外を投げる", () => {
    const encoded = encodeIds(["sm1"]);
    expect(() => decodeIds(`${encoded}AA`)).toThrowError("Unexpected trailing bytes.");
  });
});

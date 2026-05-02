import { describe, expect, test } from "bun:test";

import { parseVideoIdInputLine, parseVideoIdInputLines } from "./videoIdInput";

describe("videoIdInput", () => {
  test("動画IDをそのまま解析できる", () => {
    expect(parseVideoIdInputLine("sm9")).toBe("sm9");
    expect(parseVideoIdInputLine("ss46168863")).toBe("ss46168863");
  });

  test("watch URL から動画IDを抽出できる", () => {
    expect(parseVideoIdInputLine("https://www.nicovideo.jp/watch/sm9")).toBe("sm9");
    expect(parseVideoIdInputLine("https://www.nicovideo.jp/watch/so5364283?ref=abc")).toBe(
      "so5364283",
    );
  });

  test("行中の最初の動画IDを抽出できる", () => {
    expect(parseVideoIdInputLine("https://example.com/watch/sm9")).toBe("sm9");
    expect(parseVideoIdInputLine("prefix so5364283 suffix ss46168863")).toBe("so5364283");
  });

  test("複数行の動画IDと watch URL をまとめて解析できる", () => {
    const value = [
      "sm9",
      "https://www.nicovideo.jp/watch/so5364283",
      "",
      "nm2829323",
      "https://www.nicovideo.jp/watch/ss46168863?from=0",
    ].join("\n");

    expect(parseVideoIdInputLines(value)).toEqual(["sm9", "so5364283", "nm2829323", "ss46168863"]);
  });

  test("空白区切りとタブ区切りとカンマ区切りをまとめて解析できる", () => {
    const value = ["sm9,so5364283", "nm2829323\tss46168863", "sm45764446 so46209323"].join("\n");

    expect(parseVideoIdInputLines(value)).toEqual([
      "sm9",
      "so5364283",
      "nm2829323",
      "ss46168863",
      "sm45764446",
      "so46209323",
    ]);
  });

  test("入力が空なら例外を投げる", () => {
    expect(() => parseVideoIdInputLines(" \n \n")).toThrowError(
      "watch URL または動画IDを1件以上入力してください。",
    );
  });

  test("不正な行は行番号付きで例外を投げる", () => {
    expect(() => parseVideoIdInputLines("sm9\nwatch/abc")).toThrowError(
      "2行目: watch URL または動画IDを入力してください。",
    );
  });
});

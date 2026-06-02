import { describe, expect, test } from "bun:test";

import { parseVideoIdInputLine, parseVideoIdInputLines } from "./videoIdInput";

describe("videoIdInput", () => {
  test("動画IDをそのまま解析できる", () => {
    expect(parseVideoIdInputLine("sm9")).toBe("sm9");
    expect(parseVideoIdInputLine("nm2829323")).toBe("nm2829323");
  });

  test("watch URL から動画IDを抽出できる", () => {
    expect(parseVideoIdInputLine("https://www.nicovideo.jp/watch/sm9")).toBe("sm9");
    expect(parseVideoIdInputLine("https://www.nicovideo.jp/watch/so5364283?ref=abc")).toBe(
      "so5364283",
    );
  });

  test("行中の最初の動画IDを抽出できる", () => {
    expect(parseVideoIdInputLine("https://example.com/watch/sm9")).toBe("sm9");
    expect(parseVideoIdInputLine("prefix so5364283 suffix nm2829323")).toBe("so5364283");
  });

  test("複数行の動画IDと watch URL をまとめて解析できる", () => {
    const value = [
      "sm9",
      "https://www.nicovideo.jp/watch/so5364283",
      "",
      "nm2829323",
      "https://www.nicovideo.jp/watch/sm46168863?from=0",
    ].join("\n");

    expect(parseVideoIdInputLines(value)).toEqual(["sm9", "so5364283", "nm2829323", "sm46168863"]);
  });

  test("改行なしでも複数の動画IDを順番に抽出できる", () => {
    const value = "sm9 so5364283 nm2829323 sm46168863";

    expect(parseVideoIdInputLines(value)).toEqual(["sm9", "so5364283", "nm2829323", "sm46168863"]);
  });

  test("HTML 断片のような入力から動画IDだけを抽出できる", () => {
    const value = [
      '<a href="https://www.nicovideo.jp/watch/sm9">sm9</a>',
      '<a href="https://www.nicovideo.jp/watch/so5364283">sample</a>',
      "<div>ignore me</div>",
      "nm2829323",
    ].join("");

    expect(parseVideoIdInputLines(value)).toEqual(["sm9", "sm9", "so5364283", "nm2829323"]);
  });

  test("既定では連続した同じ動画IDも保持する", () => {
    const value = [
      '<a href="https://www.nicovideo.jp/watch/sm9">sm9</a>',
      "so5364283 so5364283",
      "nm2829323",
      "nm2829323",
      "sm9",
    ].join("\n");

    expect(parseVideoIdInputLines(value)).toEqual([
      "sm9",
      "sm9",
      "so5364283",
      "so5364283",
      "nm2829323",
      "nm2829323",
      "sm9",
    ]);
  });

  test("dedupe: consecutive の時は連続した同じ動画IDを重複排除する", () => {
    const value = [
      '<a href="https://www.nicovideo.jp/watch/sm9">sm9</a>',
      "so5364283 so5364283",
      "nm2829323",
      "nm2829323",
      "sm9",
    ].join("\n");

    expect(parseVideoIdInputLines(value, { dedupe: "consecutive" })).toEqual([
      "sm9",
      "so5364283",
      "nm2829323",
      "sm9",
    ]);
  });

  test("dedupe: all の時は全体で重複排除する", () => {
    const value = [
      '<a href="https://www.nicovideo.jp/watch/sm9">sm9</a>',
      "so5364283 so5364283",
      "nm2829323",
      "nm2829323",
      "sm9",
    ].join("\n");

    expect(parseVideoIdInputLines(value, { dedupe: "all" })).toEqual([
      "sm9",
      "so5364283",
      "nm2829323",
    ]);
  });

  test("空白区切りとタブ区切りとカンマ区切りを含む入力から動画IDを抽出できる", () => {
    const value = ["sm9,so5364283", "nm2829323\tsm46168863", "sm45764446 so46209323"].join("\n");

    expect(parseVideoIdInputLines(value)).toEqual([
      "sm9",
      "so5364283",
      "nm2829323",
      "sm46168863",
      "sm45764446",
      "so46209323",
    ]);
  });

  test("入力が空なら例外を投げる", () => {
    expect(() => parseVideoIdInputLines(" \n \n")).toThrowError(
      "watch URL または動画IDを1件以上入力してください。",
    );
  });

  test("無関係な要素だけなら例外を投げる", () => {
    expect(() => parseVideoIdInputLines("watch/abc\n<div>ignore</div>")).toThrowError(
      "watch URL または動画IDを1件以上入力してください。",
    );
  });
});

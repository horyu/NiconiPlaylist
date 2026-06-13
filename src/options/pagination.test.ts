import { describe, expect, test } from "bun:test";

import { clampPage, getPageCount, paginateItems } from "./pagination";

describe("pagination", () => {
  test("空配列でも1ページとして扱う", () => {
    expect(getPageCount(0, 100)).toBe(1);
    expect(clampPage(5, 0, 100)).toBe(1);
  });

  test("範囲外のページを有効範囲へ丸める", () => {
    expect(clampPage(0, 250, 100)).toBe(1);
    expect(clampPage(4, 250, 100)).toBe(3);
  });

  test("指定ページに含まれる項目だけを返す", () => {
    expect(paginateItems([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(paginateItems([1, 2, 3, 4, 5], 3, 2)).toEqual([5]);
  });
});

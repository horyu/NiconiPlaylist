import { describe, expect, spyOn, test } from "bun:test";

import { shuffleVideoIds } from "./shuffleVideoIds";

describe("shuffleVideoIds", () => {
  test("順番を変えても重複を含む動画と件数を維持し、元の配列は変更しない", () => {
    const videoIds = ["sm9", "nm1", "sm9", "so2"];
    const random = spyOn(Math, "random").mockReturnValue(0);

    try {
      const shuffled = shuffleVideoIds(videoIds);

      expect(shuffled).toEqual(["nm1", "sm9", "so2", "sm9"]);
      expect(shuffled.toSorted()).toEqual(videoIds.toSorted());
      expect(videoIds).toEqual(["sm9", "nm1", "sm9", "so2"]);
    } finally {
      random.mockRestore();
    }
  });

  test("空配列と動画1件でも作成対象を保持する", () => {
    expect(shuffleVideoIds([])).toEqual([]);
    expect(shuffleVideoIds(["sm9"])).toEqual(["sm9"]);
  });
});

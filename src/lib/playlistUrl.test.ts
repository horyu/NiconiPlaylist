import { describe, expect, test } from "bun:test";

import { buildSharedPlaylistUrl, parseSharedPlaylistUrl, SHARED_PLAYLIST_URL } from "./playlistUrl";

describe("playlistUrl", () => {
  test("title と memo を含む共有 URL を構築できる", () => {
    const url = buildSharedPlaylistUrl({
      title: "My Playlist",
      memo: "memo text",
      videoIds: ["sm1", "so2", "ss3"],
    });

    expect(url.startsWith(`${SHARED_PLAYLIST_URL}?`)).toBe(true);
    expect(url).toContain("title=My+Playlist");
    expect(url).toContain("memo=memo+text");
    expect(url).toMatch(/videoIds=[A-Za-z0-9\-_]+$/u);
  });

  test("プレイリスト下書きを共有 URL と相互変換できる", () => {
    const draft = {
      title: "Shared title",
      memo: "Shared memo",
      videoIds: ["sm1", "so20", "nm300", "ss4000"],
    };

    expect(parseSharedPlaylistUrl(buildSharedPlaylistUrl(draft))).toEqual(draft);
  });

  test("title と memo を省略しても扱える", () => {
    const draft = {
      videoIds: ["sm1", "ss2"],
    };

    expect(parseSharedPlaylistUrl(buildSharedPlaylistUrl(draft))).toEqual({
      title: undefined,
      memo: undefined,
      videoIds: ["sm1", "ss2"],
    });
  });

  test("videoIds が無い共有 URL では例外を投げる", () => {
    expect(() => parseSharedPlaylistUrl(SHARED_PLAYLIST_URL)).toThrowError(
      "Shared playlist URL does not include videoIds.",
    );
  });
});

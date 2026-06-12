import { describe, expect, test } from "bun:test";

import type { Playlist } from "@/lib/types";

import {
  createPlaylistDraft,
  createPlaylistDraftUpdate,
  dropPlaylistDraftVideo,
  insertPlaylistDraftVideos,
  movePlaylistDraftVideo,
} from "./playlistDraft";

const playlist: Playlist = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "playlist-1",
  lastCompletedAt: null,
  lastPlayedAt: null,
  memo: "memo",
  popupHidden: false,
  title: "title",
  updatedAt: "2026-01-01T00:00:00.000Z",
  videoIds: ["sm1", "sm2", "sm3"],
};

function createRowIdFactory() {
  let nextId = 0;
  return () => `row-${nextId++}`;
}

describe("playlistDraft", () => {
  test("playlist から編集下書きを作成する", () => {
    const draft = createPlaylistDraft(playlist, createRowIdFactory());

    expect(draft.videoRows).toEqual([
      { originalIndex: 0, rowId: "row-0", videoId: "sm1" },
      { originalIndex: 1, rowId: "row-1", videoId: "sm2" },
      { originalIndex: 2, rowId: "row-2", videoId: "sm3" },
    ]);
  });

  test("指定位置へ動画を追加する", () => {
    const draft = createPlaylistDraft(playlist, createRowIdFactory());
    const nextDraft = insertPlaylistDraftVideos(
      draft,
      ["sm9", "sm10"],
      "before-index",
      "2",
      createRowIdFactory(),
    );

    expect(nextDraft.videoRows.map((row) => row.videoId)).toEqual([
      "sm1",
      "sm9",
      "sm10",
      "sm2",
      "sm3",
    ]);
  });

  test("動画を上下移動・ドラッグ移動する", () => {
    const draft = createPlaylistDraft(playlist, createRowIdFactory());
    const moved = movePlaylistDraftVideo(draft, "row-1", "up");
    const dropped = dropPlaylistDraftVideo(moved, "row-0", "row-2", "after");

    expect(dropped.videoRows.map((row) => row.videoId)).toEqual(["sm2", "sm3", "sm1"]);
  });

  test("削除対象を除外した保存内容と元動画の削除 index を作成する", () => {
    const draft = insertPlaylistDraftVideos(
      createPlaylistDraft(playlist, createRowIdFactory()),
      ["sm9"],
      "append",
      "",
      () => "added-row",
    );
    const update = createPlaylistDraftUpdate(draft, new Set(["row-1", "row-0"]));

    expect(update.deletedVideoIndices).toEqual([0, 1]);
    expect(update.videoIds).toEqual(["sm3", "sm9"]);
  });
});

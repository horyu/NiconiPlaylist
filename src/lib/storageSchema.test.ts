import { describe, expect, test } from "bun:test";

import type { Playlist } from "@/lib/types";

import {
  getDefaultStorageData,
  normalizeStorageData,
  normalizeStorageValue,
  STORAGE_KEYS,
} from "./storageSchema";

const playlist: Playlist = {
  createdAt: "2026-06-15T00:00:00.000Z",
  id: "playlist-1",
  lastCompletedAt: null,
  lastPlayedAt: null,
  popupHidden: false,
  title: "playlist",
  updatedAt: "2026-06-15T00:00:00.000Z",
  videoIds: ["sm9"],
};

describe("storageSchema", () => {
  test("storage key と default を一箇所から取得できる", () => {
    const firstDefault = getDefaultStorageData();
    const secondDefault = getDefaultStorageData();

    firstDefault.playlists.push(playlist);

    expect(STORAGE_KEYS.playlists).toBe("np_playlists");
    expect(secondDefault.playlists).toEqual([]);
    expect(secondDefault.playbackSettings.presets.length).toBeGreaterThan(0);
  });

  test("key 単位の通常読み込みで不正要素を除外する", () => {
    expect(normalizeStorageValue("playlists", [playlist, { id: "invalid" }])).toEqual([playlist]);
    expect(
      normalizeStorageValue("owners", {
        valid: {
          fetchedAt: "2026-06-15T00:00:00.000Z",
          iconUrl: null,
          id: "valid",
          name: "owner",
          type: null,
        },
        invalid: { id: "invalid" },
      }),
    ).toEqual({
      valid: {
        fetchedAt: "2026-06-15T00:00:00.000Z",
        iconUrl: null,
        id: "valid",
        name: "owner",
        type: null,
      },
    });
  });

  test("旧形式の再生設定へ不足項目を補完する", () => {
    const normalized = normalizeStorageValue("playbackSettings", {
      playlistRepeatEnabled: true,
      activeRepeatPresetId: null,
      presets: [{ count: 3, id: "count-3", mode: "count" }],
    });

    expect(normalized.playlistRepeatEnabled).toBe(true);
    expect(normalized.presets).toEqual([{ count: 3, id: "count-3", mode: "count" }]);
    expect(normalized.navigation.restorePreviousTabDelayMs).toBeGreaterThan(0);
    expect(normalized.completion.soundRepeatCount).toBeGreaterThan(0);
  });

  test("部分欠損データを default で補完し関連不整合を除外する", () => {
    const normalized = normalizeStorageData({
      data: {
        lastActivePlaylistId: "missing",
        playbackContexts: [
          { currentIndex: 0, playlistId: playlist.id, tabId: 1 },
          { currentIndex: 1, playlistId: playlist.id, tabId: 2 },
          { currentIndex: 0, playlistId: "missing", tabId: 3 },
        ],
        playlists: [playlist],
      },
    });

    expect(normalized.lastActivePlaylistId).toBeNull();
    expect(normalized.playbackContexts).toEqual([
      { currentIndex: 0, playlistId: playlist.id, tabId: 1 },
    ]);
    expect(normalized.owners).toEqual({});
    expect(normalized.videoMetadata).toEqual({});
  });
});

import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { PlaybackContext, Playlist } from "@/lib/types";

const storedValues: Record<string, unknown> = {};

mock.module("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: mock(async (keys: string[]) =>
          Object.fromEntries(
            keys.flatMap((key) =>
              key in storedValues ? [[key, structuredClone(storedValues[key])]] : [],
            ),
          ),
        ),
        set: mock(async (updates: Record<string, unknown>) => {
          Object.assign(storedValues, structuredClone(updates));
        }),
      },
    },
  },
}));

function createPlaylist(id: string, videoIds: string[]): Playlist {
  return {
    id,
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    lastPlayedAt: null,
    lastCompletedAt: null,
    popupHidden: false,
    title: id,
    videoIds,
  };
}

function setStoredPlaylists(playlists: Playlist[]): void {
  storedValues.np_playlists = playlists;
}

function setStoredPlaybackContexts(playbackContexts: PlaybackContext[]): void {
  storedValues.np_playback_contexts = playbackContexts;
}

describe("playlistStore", () => {
  beforeEach(() => {
    for (const key of Object.keys(storedValues)) {
      delete storedValues[key];
    }
  });

  test("setStoredPlaybackContextIndex は同じ tab または playlist の既存 context を置換し active を更新する", async () => {
    const playlist = createPlaylist("playlist-1", ["sm1", "sm2", "sm3"]);

    setStoredPlaylists([playlist, createPlaylist("playlist-2", ["sm9"])]);
    setStoredPlaybackContexts([
      { playlistId: "playlist-1", tabId: 1, currentIndex: 0 },
      { playlistId: "playlist-2", tabId: 2, currentIndex: 0 },
      { playlistId: "playlist-1", tabId: 3, currentIndex: 1 },
    ]);

    const { setStoredPlaybackContextIndex } = await import("./playlistStore");
    const result = await setStoredPlaybackContextIndex(1, "playlist-1", 2);

    expect(result).toEqual({ playlistId: "playlist-1", tabId: 1, currentIndex: 2 });
    expect(storedValues.np_last_active_playlist_id).toBe("playlist-1");
    expect(storedValues.np_playback_contexts).toEqual([
      { playlistId: "playlist-2", tabId: 2, currentIndex: 0 },
      { playlistId: "playlist-1", tabId: 1, currentIndex: 2 },
    ]);
    expect((storedValues.np_playlists as Playlist[])[0]?.lastPlayedAt).not.toBeNull();
  });

  test("updateStoredPlaylist は動画削除後も再生 context を妥当な index に移動する", async () => {
    setStoredPlaylists([createPlaylist("playlist-1", ["sm1", "sm2", "sm3", "sm4"])]);
    setStoredPlaybackContexts([{ playlistId: "playlist-1", tabId: 1, currentIndex: 2 }]);

    const { updateStoredPlaylist } = await import("./playlistStore");

    await updateStoredPlaylist(
      "playlist-1",
      {
        videoIds: ["sm1", "sm3", "sm4"],
      },
      {
        deletedVideoIndices: [1],
      },
    );

    expect(storedValues.np_playback_contexts).toEqual([
      { playlistId: "playlist-1", tabId: 1, currentIndex: 1 },
    ]);
  });

  test("syncPlaybackContextForVideo は重複動画IDで現在位置または次の出現位置を優先する", async () => {
    setStoredPlaylists([createPlaylist("playlist-1", ["sm9", "sm1", "sm9"])]);
    setStoredPlaybackContexts([{ playlistId: "playlist-1", tabId: 1, currentIndex: 0 }]);

    const { syncPlaybackContextForVideo } = await import("./playlistStore");
    const sameVideoContext = await syncPlaybackContextForVideo(1, "sm9");

    expect(sameVideoContext).toEqual({ playlistId: "playlist-1", tabId: 1, currentIndex: 0 });

    const nextVideoContext = await syncPlaybackContextForVideo(1, "sm1");

    expect(nextVideoContext).toEqual({ playlistId: "playlist-1", tabId: 1, currentIndex: 1 });
  });
});

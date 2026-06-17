import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { PlaybackContext, PlaybackSettings, Playlist } from "@/lib/types";

const localStorageValues: Record<string, unknown> = {};
const sessionStorageValues: Record<string, unknown> = {};

mock.module("wxt/browser", () => ({
  browser: {
    scripting: {
      executeScript: mock(async () => undefined),
    },
    storage: {
      local: {
        get: mock(async (keys: string[]) =>
          Object.fromEntries(
            keys.flatMap((key) =>
              key in localStorageValues ? [[key, structuredClone(localStorageValues[key])]] : [],
            ),
          ),
        ),
        set: mock(async (updates: Record<string, unknown>) => {
          Object.assign(localStorageValues, structuredClone(updates));
        }),
      },
      session: {
        get: mock(async (key: string) =>
          key in sessionStorageValues ? { [key]: structuredClone(sessionStorageValues[key]) } : {},
        ),
        remove: mock(async (key: string) => {
          delete sessionStorageValues[key];
        }),
        set: mock(async (updates: Record<string, unknown>) => {
          Object.assign(sessionStorageValues, structuredClone(updates));
        }),
      },
    },
  },
}));

function createPlaylist(id: string, videoIds: string[]): Playlist {
  return {
    id,
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    lastPlayedAt: null,
    lastCompletedAt: null,
    popupHidden: false,
    title: id,
    videoIds,
  };
}

function createPlaybackSettings(): PlaybackSettings {
  return {
    playlistRepeatEnabled: false,
    resumeTabMode: "replace-current-tab",
    activeRepeatPresetId: null,
    presets: [],
    navigation: {
      restorePreviousTabEnabled: false,
      restorePreviousTabDelayMs: 0,
    },
    completion: {
      alertEnabled: false,
      focusTabEnabled: false,
      playSoundEnabled: false,
      soundRepeatCount: 1,
      soundVolume: 1,
    },
  };
}

function setStoredPlaybackState(
  playbackContext: PlaybackContext | null,
  playlist = createPlaylist("playlist-1", ["sm9", "sm1"]),
): void {
  localStorageValues.np_playlists = [playlist];
  localStorageValues.np_repeat_settings = createPlaybackSettings();
  localStorageValues.np_playback_contexts = playbackContext ? [playbackContext] : [];
}

describe("handleWatchMessage", () => {
  beforeEach(() => {
    for (const key of Object.keys(localStorageValues)) {
      delete localStorageValues[key];
    }

    for (const key of Object.keys(sessionStorageValues)) {
      delete sessionStorageValues[key];
    }
  });

  test("プレイリスト再生中でない時は playbackSettings を返さない", async () => {
    setStoredPlaybackState(null);

    const { handleWatchMessage } = await import("./watch");
    const response = await handleWatchMessage(
      {
        type: "watch:resolve-next-video",
        videoId: "sm9",
      },
      {
        tab: {
          id: 1,
        },
      },
    );

    expect(response).toEqual({
      forceSkipCurrentVideoRepeat: false,
      playbackContext: null,
      nextVideoId: null,
      playbackSettings: null,
    });
  });

  test("プレイリスト再生中なら playbackSettings を返す", async () => {
    setStoredPlaybackState({ playlistId: "playlist-1", tabId: 1, currentIndex: 0 });

    const { handleWatchMessage } = await import("./watch");
    const response = await handleWatchMessage(
      {
        type: "watch:resolve-next-video",
        videoId: "sm9",
      },
      {
        tab: {
          id: 1,
        },
      },
    );

    expect(response?.playbackContext).toEqual({
      playlistId: "playlist-1",
      tabId: 1,
      currentIndex: 0,
    });
    expect(response?.forceSkipCurrentVideoRepeat).toBe(false);
    expect(response?.nextVideoId).toBe("sm1");
    expect(response?.playbackSettings).not.toBeNull();
  });

  test("再生終了後移動 override がある時は current repeat を無視してその動画へ進む", async () => {
    setStoredPlaybackState({ playlistId: "playlist-1", tabId: 1, currentIndex: 0 });
    sessionStorageValues.playbackEndNavigationOverrides = {
      1: {
        nextIndex: 1,
        nextVideoId: "so5364283",
        playlistId: "playlist-1",
      },
    };

    const { handleWatchMessage } = await import("./watch");
    const response = await handleWatchMessage(
      {
        type: "watch:resolve-next-video",
        videoId: "sm9",
      },
      {
        tab: {
          id: 1,
        },
      },
    );

    expect(response?.forceSkipCurrentVideoRepeat).toBe(true);
    expect(response?.nextVideoId).toBe("so5364283");
    expect(sessionStorageValues.playbackEndNavigationOverrides).toBeUndefined();
  });
});

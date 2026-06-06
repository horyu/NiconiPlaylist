import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { PlaybackContext, PlaybackSettings, VideoId } from "@/lib/types";

type ResolveNextVideoForPlaybackContextResult = {
  firstVideoId: VideoId | null;
  playbackContext: PlaybackContext | null;
  nextVideoId: VideoId | null;
};

const getStoredPlaybackSettingsMock = mock<() => Promise<PlaybackSettings>>(async () => ({
  playlistRepeatEnabled: false,
  resumeTabMode: "replace-current-tab",
  activeRepeatPresetId: null,
  presets: [],
  navigation: {
    restorePreviousTabEnabled: false,
    restorePreviousTabDelayMs: 0,
  },
  completion: {
    playSoundEnabled: false,
    soundVolume: 1,
    soundRepeatCount: 1,
    focusTabEnabled: false,
    alertEnabled: false,
  },
}));

const resolveNextVideoForPlaybackContextMock = mock<
  () => Promise<ResolveNextVideoForPlaybackContextResult>
>(async () => ({
  firstVideoId: null,
  playbackContext: null,
  nextVideoId: null,
}));
const consumePlaybackEndNavigationOverrideMock = mock(
  () => null as { nextVideoId: VideoId } | null,
);

mock.module("wxt/browser", () => ({
  browser: {
    scripting: {
      executeScript: mock(async () => undefined),
    },
  },
}));

mock.module("@/background/services/playbackNavigation", () => ({
  cancelPendingPlaybackTabNavigation: mock(() => undefined),
  completePlaybackTabNavigation: mock(async () => undefined),
  focusBrowserTab: mock(async () => undefined),
  preparePlaybackTabForNavigation: mock(async () => undefined),
}));

mock.module("@/background/services/playbackSettings", () => ({
  getStoredPlaybackSettings: getStoredPlaybackSettingsMock,
}));

mock.module("@/background/services/playbackEndNavigationOverride", () => ({
  clearPlaybackEndNavigationOverride: mock(() => undefined),
  consumePlaybackEndNavigationOverride: consumePlaybackEndNavigationOverrideMock,
}));

mock.module("@/background/services/playlistStore", () => ({
  clearStoredPlaybackContextByTabId: mock(async () => undefined),
  markStoredPlaylistCompletedByTabId: mock(async () => undefined),
  recordContentPlaybackDebugEvent: mock(async () => undefined),
  resolveNextVideoForPlaybackContext: resolveNextVideoForPlaybackContextMock,
  syncPlaybackContextForVideo: mock(async () => null),
}));

describe("handleWatchMessage", () => {
  beforeEach(() => {
    getStoredPlaybackSettingsMock.mockClear();
    resolveNextVideoForPlaybackContextMock.mockClear();
    consumePlaybackEndNavigationOverrideMock.mockClear();
    consumePlaybackEndNavigationOverrideMock.mockImplementation(() => null);
  });

  test("プレイリスト再生中でない時は playbackSettings を返さない", async () => {
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
    resolveNextVideoForPlaybackContextMock.mockImplementationOnce(async () => ({
      firstVideoId: "sm9",
      playbackContext: {
        playlistId: "playlist-1",
        tabId: 1,
        currentIndex: 0,
      },
      nextVideoId: "sm1",
    }));

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
    resolveNextVideoForPlaybackContextMock.mockImplementationOnce(async () => ({
      firstVideoId: "sm9",
      playbackContext: {
        playlistId: "playlist-1",
        tabId: 1,
        currentIndex: 0,
      },
      nextVideoId: "sm1",
    }));
    consumePlaybackEndNavigationOverrideMock.mockImplementationOnce(() => ({
      nextVideoId: "so5364283",
    }));

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
  });
});

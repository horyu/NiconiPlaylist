import { describe, expect, test } from "bun:test";

import type { PlaybackSettings } from "@/lib/types";

import {
  armWatchRouteReady,
  createPlaybackTransitionState,
  createWatchRouteState,
  observePlaybackEnd,
  observeWatchRouteChange,
  resolveCompletedTabNavigation,
  resolveNextPlaybackVideo,
  resolvePlaybackEndTransition,
  setExpectedWatchNavigation,
} from "./playbackTransition";

function createPlaybackSettings(overrides?: Partial<PlaybackSettings>): PlaybackSettings {
  return {
    playlistRepeatEnabled: false,
    resumeTabMode: "new-tab",
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
      soundVolume: 50,
    },
    ...overrides,
  };
}

const playbackContext = {
  currentIndex: 0,
  playlistId: "playlist-1",
  tabId: 1,
};

describe("playback end transition", () => {
  test("pause と ended の重複イベントを一度だけ処理する", () => {
    const first = observePlaybackEnd(
      createPlaybackTransitionState(),
      { at: 1_000, eventType: "pause", signature: "same" },
      5_000,
    );
    const duplicate = observePlaybackEnd(
      first.state,
      { at: 1_100, eventType: "ended", signature: "same" },
      5_000,
    );

    expect(first.shouldResolve).toBe(true);
    expect(duplicate.shouldResolve).toBe(false);
    expect(duplicate.state).toBe(first.state);
  });

  test("重複抑止時間を過ぎた再生終了イベントは再度処理する", () => {
    const first = observePlaybackEnd(
      createPlaybackTransitionState(),
      { at: 1_000, eventType: "pause", signature: "same" },
      5_000,
    );
    const later = observePlaybackEnd(
      first.state,
      { at: 6_001, eventType: "ended", signature: "same" },
      5_000,
    );

    expect(later.shouldResolve).toBe(true);
    expect(later.state.lastHandledPlaybackEnd).toEqual({
      at: 6_001,
      eventType: "ended",
      signature: "same",
    });
  });

  test("現在動画リピート条件を満たす場合は再生を再開する", () => {
    const settings = createPlaybackSettings({
      activeRepeatPresetId: "count-2",
      presets: [{ id: "count-2", mode: "count", count: 2 }],
    });
    const transition = resolvePlaybackEndTransition(createPlaybackTransitionState(), {
      durationSeconds: 100,
      playbackState: {
        playbackContext,
        playbackSettings: settings,
        nextVideoId: "sm1",
      },
      videoId: "sm9",
    });

    expect(transition.command).toEqual({ type: "restart-current-video" });
    expect(transition.state.completedPlaybackCount).toBe(1);
  });

  test("予約遷移では現在動画リピートを無視して次動画へ進む", () => {
    const settings = createPlaybackSettings({
      activeRepeatPresetId: "count-2",
      presets: [{ id: "count-2", mode: "count", count: 2 }],
    });
    const transition = resolvePlaybackEndTransition(createPlaybackTransitionState(), {
      durationSeconds: 100,
      playbackState: {
        forceSkipCurrentVideoRepeat: true,
        playbackContext,
        playbackSettings: settings,
        nextVideoId: "so5364283",
      },
      videoId: "sm9",
    });

    expect(transition.command).toEqual({
      type: "navigate-next-video",
      nextVideoId: "so5364283",
    });
  });

  test("プレイリスト終端では完了通知と完了記録を要求する", () => {
    const transition = resolvePlaybackEndTransition(createPlaybackTransitionState(), {
      durationSeconds: 100,
      playbackState: {
        playbackContext,
        playbackSettings: createPlaybackSettings(),
        nextVideoId: null,
      },
      videoId: "sm9",
    });

    expect(transition.command).toEqual({
      type: "clear-playback-context",
      markCompleted: true,
      notifyCompletion: true,
    });
  });

  test("再生コンテキストがない場合は完了扱いにせず状態をクリアする", () => {
    const transition = resolvePlaybackEndTransition(createPlaybackTransitionState(), {
      durationSeconds: 100,
      playbackState: {
        playbackContext: null,
        playbackSettings: null,
        nextVideoId: null,
      },
      videoId: "sm9",
    });

    expect(transition.command).toEqual({
      type: "clear-playback-context",
      markCompleted: false,
      notifyCompletion: false,
    });
  });
});

describe("next video resolution", () => {
  test("予約動画、通常次動画、プレイリスト先頭の順で解決する", () => {
    const settings = createPlaybackSettings({ playlistRepeatEnabled: true });

    expect(
      resolveNextPlaybackVideo({
        firstVideoId: "sm9",
        nextVideoId: "sm1",
        overrideNextVideoId: "so5364283",
        playbackContext,
        playbackSettings: settings,
      }).nextVideoId,
    ).toBe("so5364283");
    expect(
      resolveNextPlaybackVideo({
        firstVideoId: "sm9",
        nextVideoId: "sm1",
        overrideNextVideoId: null,
        playbackContext,
        playbackSettings: settings,
      }).nextVideoId,
    ).toBe("sm1");
    expect(
      resolveNextPlaybackVideo({
        firstVideoId: "sm9",
        nextVideoId: null,
        overrideNextVideoId: null,
        playbackContext,
        playbackSettings: settings,
      }).nextVideoId,
    ).toBe("sm9");
  });
});

describe("watch route transition", () => {
  test("期待外の動画へ移動した場合は期待動画への強制遷移を要求する", () => {
    const state = setExpectedWatchNavigation(createWatchRouteState(), "sm1");
    const transition = observeWatchRouteChange(state, {
      currentVideoId: "sm9",
      hasFromZero: false,
    });

    expect(transition.command).toEqual({
      type: "force-expected-navigation",
      expectedNextVideoId: "sm1",
    });
  });

  test("from=0 の除去を route-ready として扱う", () => {
    const state = armWatchRouteReady(setExpectedWatchNavigation(createWatchRouteState(), "sm1"), {
      currentVideoId: "sm1",
      hasFromZero: true,
    });
    const transition = observeWatchRouteChange(state, {
      currentVideoId: "sm1",
      hasFromZero: false,
    });

    expect(transition.command).toEqual({
      type: "route-ready",
      syncPlaybackContext: true,
    });
    expect(transition.state.routeReadyArmed).toBe(false);
  });

  test("通常のルート変更では再生状態を同期して route-ready を待機する", () => {
    const state = createWatchRouteState();
    const transition = observeWatchRouteChange(state, {
      currentVideoId: "sm9",
      hasFromZero: false,
    });

    expect(transition.command).toEqual({ type: "sync-and-arm-route-ready" });
    expect(transition.state).toBe(state);
  });

  test("route-ready 後に以前のタブを復元する条件を解決する", () => {
    expect(
      resolveCompletedTabNavigation(10, {
        delayMs: 1500,
        previousActiveTabId: 20,
        restorePreviousTabEnabled: true,
      }),
    ).toEqual({
      type: "restore-previous-tab",
      delayMs: 1500,
      previousActiveTabId: 20,
    });
    expect(resolveCompletedTabNavigation(10, null)).toEqual({
      type: "no-pending-navigation",
    });
  });

  test("前のタブへ戻さない設定では再生タブを維持する", () => {
    expect(
      resolveCompletedTabNavigation(10, {
        delayMs: 1500,
        previousActiveTabId: 20,
        restorePreviousTabEnabled: false,
      }),
    ).toEqual({ type: "keep-playback-tab-visible" });
    expect(
      resolveCompletedTabNavigation(10, {
        delayMs: 1500,
        previousActiveTabId: 10,
        restorePreviousTabEnabled: true,
      }),
    ).toEqual({ type: "keep-playback-tab-visible" });
  });
});

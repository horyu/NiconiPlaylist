import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
  DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
  DEFAULT_PLAYBACK_RESUME_TAB_MODE,
  DEFAULT_REPEAT_PRESETS,
  createCombinedRepeatPreset,
  createRepeatPreset,
  formatRepeatPresetLabel,
  resolveActiveRepeatPreset,
  resolvePlaylistPlaybackSettings,
  sanitizePlaybackSettings,
  shouldRepeatCurrentVideo,
} from "./playlistLoop";

describe("playlistLoop", () => {
  test("count モードでは指定回数に達するまでループする", () => {
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "count-3",
          presets: [
            {
              id: "count-3",
              mode: "count",
              count: 3,
            },
          ],
          navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        1,
        120,
      ),
    ).toBe(true);
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "count-3",
          presets: [
            {
              id: "count-3",
              mode: "count",
              count: 3,
            },
          ],
          navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        3,
        120,
      ),
    ).toBe(false);
  });

  test("duration モードでは合計再生時間が指定秒数に達するまでループする", () => {
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "duration-300",
          presets: [
            {
              id: "duration-300",
              mode: "duration",
              durationSeconds: 300,
            },
          ],
          navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        2,
        120,
      ),
    ).toBe(true);
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "duration-300",
          presets: [
            {
              id: "duration-300",
              mode: "duration",
              durationSeconds: 300,
            },
          ],
          navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        3,
        120,
      ),
    ).toBe(false);
  });

  test("min モードでは回数または時間の短い方に達したら次へ進む", () => {
    const settings = sanitizePlaybackSettings({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: "min-2-300",
      presets: [createCombinedRepeatPreset("min", 2, 300, "min-2-300")],
    });

    expect(shouldRepeatCurrentVideo(settings, 1, 30)).toBe(true);
    expect(shouldRepeatCurrentVideo(settings, 2, 30)).toBe(false);
  });

  test("max モードでは回数と時間の長い方に達するまでループする", () => {
    const settings = sanitizePlaybackSettings({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: "max-3-600",
      presets: [createCombinedRepeatPreset("max", 3, 600, "max-3-600")],
    });

    expect(shouldRepeatCurrentVideo(settings, 3, 30)).toBe(true);
    expect(shouldRepeatCurrentVideo(settings, 20, 30)).toBe(false);
  });

  test("複合条件は動画時間を取得できない場合に回数条件だけで判定する", () => {
    const minSettings = sanitizePlaybackSettings({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: "min-3-300",
      presets: [createCombinedRepeatPreset("min", 3, 300, "min-3-300")],
    });
    const maxSettings = sanitizePlaybackSettings({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: "max-3-300",
      presets: [createCombinedRepeatPreset("max", 3, 300, "max-3-300")],
    });

    expect(shouldRepeatCurrentVideo(minSettings, 2, Number.NaN)).toBe(true);
    expect(shouldRepeatCurrentVideo(minSettings, 3, Number.NaN)).toBe(false);
    expect(shouldRepeatCurrentVideo(maxSettings, 2, Number.NaN)).toBe(true);
    expect(shouldRepeatCurrentVideo(maxSettings, 3, Number.NaN)).toBe(false);
  });

  test("複合条件を正規化して表示できる", () => {
    const preset = createCombinedRepeatPreset("min", 0, 0, "min");

    expect(preset).toEqual({
      id: "min",
      mode: "min",
      count: 1,
      durationSeconds: 1,
    });
    expect(formatRepeatPresetLabel(createCombinedRepeatPreset("max", 3, 600, "max"))).toBe(
      "長い方（3回 / 10分）リピート",
    );
  });

  test("sanitize は未保存時だけ初期プリセットを補完し、無効な active id を解除する", () => {
    expect(sanitizePlaybackSettings(undefined)).toEqual({
      playlistRepeatEnabled: false,
      resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
      activeRepeatPresetId: null,
      presets: DEFAULT_REPEAT_PRESETS,
      navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
      completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
    });
    expect(
      sanitizePlaybackSettings({
        playlistRepeatEnabled: false,
        activeRepeatPresetId: "missing",
        presets: [],
      }),
    ).toEqual({
      playlistRepeatEnabled: false,
      resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
      activeRepeatPresetId: null,
      presets: [],
      navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
      completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
    });
  });

  test("active なプリセットを解決できる", () => {
    const repeatSettings = sanitizePlaybackSettings({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: "custom",
      presets: [createRepeatPreset("count", 4, "custom")],
    });

    expect(resolveActiveRepeatPreset(repeatSettings)).toEqual({
      id: "custom",
      mode: "count",
      count: 4,
    });
  });

  test("プレイリスト固有の各動画リピート設定をグローバル設定へ反映する", () => {
    const globalSettings = sanitizePlaybackSettings({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: "global",
      presets: [
        createRepeatPreset("count", 2, "global"),
        createRepeatPreset("duration", 300, "playlist"),
      ],
    });

    expect(resolvePlaylistPlaybackSettings(globalSettings, undefined)).toBe(globalSettings);
    expect(resolvePlaylistPlaybackSettings(globalSettings, { repeatPresetId: null })).toEqual({
      ...globalSettings,
      activeRepeatPresetId: null,
    });
    expect(resolvePlaylistPlaybackSettings(globalSettings, { repeatPresetId: "playlist" })).toEqual(
      {
        ...globalSettings,
        activeRepeatPresetId: "playlist",
      },
    );
    expect(resolvePlaylistPlaybackSettings(globalSettings, { repeatPresetId: "missing" })).toEqual({
      ...globalSettings,
      activeRepeatPresetId: null,
    });
  });

  test("completion 設定は範囲内に正規化する", () => {
    expect(
      sanitizePlaybackSettings({
        presets: [],
        completion: {
          playSoundEnabled: true,
          soundVolume: 120,
          soundRepeatCount: 0,
          focusTabEnabled: true,
          alertEnabled: true,
        },
      }).completion,
    ).toEqual({
      playSoundEnabled: false,
      soundVolume: 100,
      soundRepeatCount: 1,
      focusTabEnabled: true,
      alertEnabled: true,
    });
  });

  test("navigation 設定は範囲内に正規化する", () => {
    expect(
      sanitizePlaybackSettings({
        presets: [],
        navigation: {
          restorePreviousTabEnabled: true,
          restorePreviousTabDelayMs: -500,
        },
      }).navigation,
    ).toEqual({
      restorePreviousTabEnabled: true,
      restorePreviousTabDelayMs: 100,
    });
  });
});
